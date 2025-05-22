import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

interface ChangePlanRequest {
  planId: string
  firmId: string
  email: string
}

serve(async (req: Request) => {
  console.log('=== Request Started ===');
  console.log('Request method:', req.method);

  // Handle CORS
  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Initializing Supabase client...');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    console.log('Supabase configuration:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey
    });

    const supabaseClient = createClient(
      supabaseUrl ?? '',
      supabaseKey ?? ''
    )

    // Parse request body
    const requestBody = await req.json();
    console.log('Received request body:', requestBody);

    const { planId, firmId, email }: ChangePlanRequest = requestBody;
    // Always use monthly billing cycle
    const billingCycle = 'monthly';

    // Validate required fields
    console.log('Validating required fields:', {
      hasPlanId: !!planId,
      hasFirmId: !!firmId,
      hasEmail: !!email
    });

    if (!planId || !firmId || !email) {
      console.log('Validation failed: Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get plan details
    console.log('Fetching plan details for:', {
      planId
    });

    const { data: plan, error: planError } = await supabaseClient
      .from('plans')
      .select('*')
      .eq('id', planId)
      .eq('is_active', true)
      .single()

    console.log('Plan query result:', {
      success: !!plan,
      error: planError,
      planData: plan
    });

    if (planError || !plan) {
      console.log('Error fetching plan:', planError);
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive plan' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate plan pricing
    console.log('Validating plan pricing:', {
      priceCents: plan.price_cents,
      currency: plan.currency
    });

    if (!plan.price_cents || plan.currency !== 'ZAR') {
      console.log('Invalid plan pricing configuration');
      return new Response(
        JSON.stringify({ error: 'Invalid plan pricing configuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get current subscription if exists
    console.log('Checking for existing subscription:', {
      firmId
    });

    const { data: existingSubscription, error: subscriptionQueryError } = await supabaseClient
      .from('invoices')
      .select('*, plan_id(*)')
      .eq('firm_id', firmId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    console.log('Existing subscription query result:', {
      hasExistingSubscription: !!existingSubscription,
      queryError: subscriptionQueryError,
      subscriptionData: existingSubscription
    });

    const now = new Date();
    const periodEnd = new Date(now);
    
    // Set period end for monthly billing
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    console.log('Calculated period dates:', {
      now: now.toISOString(),
      periodEnd: periodEnd.toISOString(),
      billingCycle
    });

    // Generate a unique reference for tracking
    const timestamp = Date.now();
    const reference = `${existingSubscription ? 'change' : 'new'}-${plan.id}-${timestamp}`;
    console.log('Generated transaction reference:', reference);

    // Create invoice number
    const invoiceNumber = `INV-${firmId.substring(0, 8)}-${timestamp}`;

    // Initialize Paystack transaction
    const paystackAmount = plan.price_cents;
    console.log('Initializing Paystack transaction:', {
      email,
      amount: paystackAmount,
      currency: 'ZAR',
      reference
    });

    const paystackResponse = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        amount: paystackAmount,
        currency: 'ZAR',
        callback_url: `${Deno.env.get('APP_URL') || 'https://app.example.com'}/billing/callback`,
        metadata: {
          firm_id: firmId,
          plan_id: planId,
          billing_cycle: billingCycle,
          reference: reference,
          is_new_subscription: !existingSubscription,
          current_plan_id: existingSubscription?.plan_id?.id,
          invoice_number: invoiceNumber,
          period_end: periodEnd.toISOString(),
          custom_fields: [
            {
              display_name: "Plan",
              variable_name: "plan_name",
              value: plan.name
            },
            {
              display_name: "Billing Cycle",
              variable_name: "billing_cycle",
              value: billingCycle
            },
            {
              display_name: "Reference",
              variable_name: "reference",
              value: reference
            }
          ]
        }
      })
    })

    const paystackData = await paystackResponse.json()
    console.log('Paystack response:', {
      status: paystackResponse.status,
      data: paystackData
    });

    if (!paystackResponse.ok) {
      console.log('Paystack initialization failed:', paystackData);
      return new Response(
        JSON.stringify({ error: 'Payment initialization failed', details: paystackData }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create draft invoice
    console.log('Creating draft invoice');

    const invoicePayload = {
      firm_id: firmId,
      plan_id: planId,
      invoice_number: invoiceNumber,
      status: 'draft',
      subtotal_cents: plan.price_cents,
      tax_cents: 0,
      total_cents: plan.price_cents,
      currency: plan.currency,
      due_date: periodEnd.toISOString(),
      line_items: JSON.stringify([{
        description: `${plan.name} (Monthly)`,
        quantity: 1,
        unit_price_cents: plan.price_cents,
        total_cents: plan.price_cents
      }]),
      notes: `Monthly subscription`,
      metadata: {
        paystack_reference: paystackData.data.reference,
        authorization_url: paystackData.data.authorization_url,
        billing_cycle: billingCycle
      }
    };

    console.log('Invoice payload:', invoicePayload);

    const { data: invoice, error: invoiceError } = await supabaseClient
      .from('invoices')
      .insert(invoicePayload)
      .select('id')
      .single();

    if (invoiceError || !invoice) {
      console.log('Failed to create invoice:', invoiceError);
      return new Response(
        JSON.stringify({ error: 'Failed to create invoice', details: invoiceError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully created invoice:', invoice);

    // Create pending transaction record
    console.log('Creating transaction record');

    const transactionPayload = {
      firm_id: firmId,
      invoice_id: invoice.id,
      provider: 'paystack',
      provider_transaction_id: paystackData.data.reference,
      type: 'payment',
      status: 'pending',
      amount_cents: plan.price_cents,
      currency: plan.currency,
      reference: reference,
      gateway_response: paystackData,
      metadata: {
        plan_id: planId,
        billing_cycle: billingCycle,
        previous_plan_id: existingSubscription?.plan_id?.id,
        invoice_number: invoiceNumber
      }
    };

    console.log('Transaction payload:', transactionPayload);

    const { error: transactionError } = await supabaseClient
      .from('transactions')
      .insert(transactionPayload)

    if (transactionError) {
      console.log('Failed to create transaction record:', transactionError);
      return new Response(
        JSON.stringify({ error: 'Failed to create transaction record', details: transactionError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Successfully created transaction record');

    const response = {
      status: 'pending',
      authorization_url: paystackData.data.authorization_url,
      reference: paystackData.data.reference,
      transaction_reference: reference,
      invoice_id: invoice.id
    };

    console.log('Sending successful response:', response);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.log('Unhandled error:', {
      message: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
