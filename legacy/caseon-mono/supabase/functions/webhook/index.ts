import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.167.0/crypto/mod.ts";

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

console.log('Environment variables loaded:', {
  hasPaystackSecret: !!PAYSTACK_SECRET,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasSupabaseKey: !!SUPABASE_SERVICE_ROLE_KEY
})

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

async function verifyPaystackSignature(rawBody: string, signature: string | null): Promise<boolean> {
  console.log('Received Paystack signature:', signature)
  
  if (!signature) {
    console.warn('No Paystack signature found in request headers')
    return false
  }
  
  const hash = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder().encode(rawBody + PAYSTACK_SECRET)
  )
  const hashHex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  
  console.log('Calculated hash:', hashHex)
  console.log('Signatures match:', signature === hashHex)
  
  return signature === hashHex
}

async function generateInvoiceNumber(): Promise<string> {
  const timestamp = Date.now()
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `INV-${timestamp}-${random}`
}

async function updateOrCreatePaymentMethod(firm_id: string, authorization: any, customerEmail: string) {
  if (!authorization?.authorization_code) {
    console.log('No authorization code provided, skipping payment method update')
    return
  }

  // First, reset all default payment methods for this firm
  const { error: resetError } = await supabase
    .from('payment_methods')
    .update({ is_default: false, updated_at: new Date() })
    .eq('firm_id', firm_id)
    .eq('is_default', true)

  if (resetError) {
    console.error('Error resetting default payment methods:', resetError)
    // Continue with the process even if reset fails
  } else {
    console.log('Successfully reset default payment methods for firm:', firm_id)
  }

  const paymentMethodData = {
    firm_id,
    provider: 'paystack',
    provider_payment_method_id: authorization.authorization_code,
    type: 'card',
    is_default: true,
    details: {
      last4: authorization.last4,
      exp_month: authorization.exp_month,
      exp_year: authorization.exp_year,
      card_type: authorization.card_type,
      bank: authorization.bank,
      email: customerEmail
    },
    updated_at: new Date()
  }

  // Then, try to find existing payment method
  const { data: existingMethod, error: lookupError } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('provider', 'paystack')
    .eq('provider_payment_method_id', authorization.authorization_code)
    .single()

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Error looking up payment method:', lookupError)
    return
  }

  let result;
  if (existingMethod) {
    console.log('Updating existing payment method:', existingMethod.id)
    result = await supabase
      .from('payment_methods')
      .update(paymentMethodData)
      .eq('id', existingMethod.id)
      .select()
  } else {
    console.log('Creating new payment method')
    result = await supabase
      .from('payment_methods')
      .insert({ ...paymentMethodData, created_at: new Date() })
      .select()
  }

  if (result.error) {
    console.error('Error handling payment method:', result.error)
    return
  }

  console.log(`Payment method ${existingMethod ? 'updated' : 'created'} successfully:`, result.data)
  const pid = result?.data?.length > 0 ? result.data[0].id : ""
  return pid
}

async function createOrUpdateInvoice(firm_id: string, plan_id: string | null, paymentMethodId: string | null, amount: number, reference: string, metadata: any) {
  // Check if invoice exists by reference
  const { data: existingInvoice, error: lookupError } = await supabase
    .from('invoices')
    .select('*')
    .eq('invoice_number', metadata?.invoice_number || '')
    .maybeSingle()

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Error looking up invoice:', lookupError)
    return null
  }

  const now = new Date()
  const dueDate = new Date(now)
  
  // Set due date based on billing cycle from metadata
  switch(metadata?.billing_cycle) {
    case 'yearly':
      dueDate.setFullYear(dueDate.getFullYear() + 1)
      break
    case 'quarterly':
      dueDate.setMonth(dueDate.getMonth() + 3)
      break
    default:
      dueDate.setMonth(dueDate.getMonth() + 1)
      break
  }

  // Calculate amounts
  const subtotalCents = amount
  const taxRate = 0.15 // 15% VAT
  const taxCents = Math.round(subtotalCents * taxRate)
  const totalCents = subtotalCents + taxCents

  let planData = null
  if (plan_id) {
    // Get plan details if provided
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', plan_id)
      .single()

    if (!planError && plan) {
      planData = plan
    } else {
      console.error('Error fetching plan:', planError)
    }
  }

  // Prepare line items
  const lineItems = [{
    description: planData ? 
      `${planData.name} (${metadata?.billing_cycle || 'monthly'})` : 
      `Subscription Payment (${metadata?.billing_cycle || 'monthly'})`,
    quantity: 1,
    unit_price_cents: subtotalCents,
    total_cents: subtotalCents
  }]

  if (existingInvoice) {
    // Update existing invoice
    const { data: updatedInvoice, error: updateError } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: now.toISOString(),
        updated_at: now.toISOString(),
        metadata: {
          ...existingInvoice.metadata,
          payment_method_id: paymentMethodId,
          transaction_reference: reference,
          payment_date: now.toISOString()
        }
      })
      .eq('id', existingInvoice.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating invoice:', updateError)
      return null
    }

    console.log('Updated existing invoice:', updatedInvoice)
    return updatedInvoice
  } else {
    // Create new invoice if none exists
    const invoiceNumber = await generateInvoiceNumber()
    
    const { data: newInvoice, error: createError } = await supabase
      .from('invoices')
      .insert({
        firm_id,
        plan_id,
        invoice_number: invoiceNumber,
        status: 'paid',
        paid_at: now.toISOString(),
        subtotal_cents: subtotalCents,
        tax_cents: taxCents,
        total_cents: totalCents,
        currency: 'ZAR',
        due_date: dueDate.toISOString(),
        line_items: lineItems,
        notes: `Subscription payment for ${metadata?.billing_cycle || 'monthly'} billing cycle`,
        metadata: {
          payment_method_id: paymentMethodId,
          transaction_reference: reference,
          payment_date: now.toISOString(),
          ...metadata
        },
        created_at: now.toISOString(),
        updated_at: now.toISOString()
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating new invoice:', createError)
      return null
    }

    console.log('Created new invoice:', newInvoice)
    return newInvoice
  }
}

async function handleChargeSuccess(data: any) {
  console.log('Processing charge.success event:', data)
  
  const {
    reference,
    amount,
    status,
    currency,
    customer,
    authorization,
    metadata,
    paid_at,
  } = data

  const firm_id = metadata?.firm_id
  console.log('Extracted firm_id:', firm_id)

  if (!firm_id) {
    console.error('No firm_id found in metadata')
    return
  }

  // First check if a transaction with this reference already exists
  const { data: existingTransaction, error: lookupError } = await supabase
    .from('transactions')
    .select('*')
    .eq('provider_transaction_id', reference)
    .single()

  if (lookupError && lookupError.code !== 'PGRST116') { // PGRST116 is "not found" error
    console.error('Error looking up existing transaction:', lookupError)
    return
  }

  // Handle payment method
  const paymentMethodId = await updateOrCreatePaymentMethod(firm_id, authorization, customer.email)
  console.log('Payment method ID:', paymentMethodId)

  // Create or update invoice
  const invoice = await createOrUpdateInvoice(
    firm_id,
    metadata?.plan_id || null,
    paymentMethodId || null,
    amount,
    reference,
    metadata
  )

  console.log('Invoice processing result:', invoice ? 'Success' : 'Failed')

  const transactionData = {
    firm_id,
    invoice_id: invoice?.id || null,
    payment_method_id: paymentMethodId || null,
    amount_cents: amount,
    currency: currency || 'ZAR',
    status: status === 'success' ? 'success' : 'failed',
    provider: 'paystack',
    provider_transaction_id: reference,
    reference,
    type: 'payment',
    processed_at: new Date(paid_at || Date.now()),
    gateway_response: data,
    metadata: {
      paystack_response: data,
      authorization_code: authorization?.authorization_code,
      card_details: {
        last4: authorization?.last4,
        exp_month: authorization?.exp_month,
        exp_year: authorization?.exp_year,
        card_type: authorization?.card_type,
        bank: authorization?.bank
      },
      invoice_id: invoice?.id
    },
    updated_at: new Date()
  }

  let result;
  if (existingTransaction) {
    console.log('Updating existing transaction:', existingTransaction.id)
    result = await supabase
      .from('transactions')
      .update(transactionData)
      .eq('id', existingTransaction.id)
      .select()
  } else {
    console.log('Creating new transaction')
    result = await supabase
      .from('transactions')
      .insert({ ...transactionData, created_at: new Date() })
      .select()
  }

  if (result.error) {
    console.error('Error handling transaction:', result.error)
    return
  }

  console.log(`Transaction ${existingTransaction ? 'updated' : 'created'} successfully:`, result.data)

  // Create payment authorization if applicable
  if (authorization?.authorization_code && paymentMethodId) {
    console.log('Creating payment authorization record')
    
    const authData = {
      firm_id,
      payment_method_id: paymentMethodId,
      provider: 'paystack',
      provider_authorization_id: authorization.authorization_code,
      amount_cents: amount,
      currency: currency || 'ZAR',
      status: 'authorized',
      metadata: {
        authorization: authorization,
        transaction_id: result.data[0].id
      },
      created_at: new Date(),
      updated_at: new Date()
    }

    const { error: authError } = await supabase
      .from('payment_authorizations')
      .insert(authData)

    if (authError) {
      console.error('Error creating payment authorization:', authError)
    } else {
      console.log('Payment authorization created successfully')
    }
  }

  // Update billing_cycle information in the firm record if available
  if (metadata?.billing_cycle) {
    const { error: firmUpdateError } = await supabase
      .from('firms')
      .update({
        billing_cycle: metadata.billing_cycle,
        current_plan_id: metadata.plan_id || null,
        updated_at: new Date()
      })
      .eq('id', firm_id)

    if (firmUpdateError) {
      console.error('Error updating firm billing information:', firmUpdateError)
    } else {
      console.log('Firm billing information updated successfully')
    }
  }

  // Generate the next invoice due date based on billing cycle
  const currentDate = new Date()
  let nextBillingDate = new Date(currentDate)
  
  switch(metadata?.billing_cycle) {
    case 'yearly':
      nextBillingDate.setFullYear(nextBillingDate.getFullYear() + 1)
      break
    case 'quarterly':
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 3)
      break
    default: // monthly
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
      break
  }

  // Schedule the next billing cycle by calling the stored procedure
  try {
    await supabase.rpc('schedule_next_billing', {
      firm_id_param: firm_id,
      payment_method_id_param: paymentMethodId,
      next_billing_date_param: nextBillingDate.toISOString(),
      plan_id_param: metadata?.plan_id || null,
      billing_cycle_param: metadata?.billing_cycle || 'monthly'
    })
    console.log('Next billing cycle scheduled successfully')
  } catch (error) {
    console.error('Error scheduling next billing cycle:', error)
  }
}

async function handleFailedCharge(data: any) {
  console.log('Processing charge.failed event:', data)
  
  const {
    reference,
    amount,
    status,
    currency,
    customer,
    metadata,
  } = data

  const firm_id = metadata?.firm_id
  console.log('Extracted firm_id:', firm_id)

  if (!firm_id) {
    console.error('No firm_id found in metadata')
    return
  }

  // Update transaction if it exists
  const { data: existingTransaction, error: lookupError } = await supabase
    .from('transactions')
    .select('id')
    .eq('provider_transaction_id', reference)
    .single()

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Error looking up transaction:', lookupError)
    return
  }

  const transactionData = {
    firm_id,
    amount_cents: amount,
    currency: currency || 'ZAR',
    status: 'failed',
    provider: 'paystack',
    provider_transaction_id: reference,
    type: 'payment',
    reference,
    failure_reason: data.gateway_response || 'Payment failed',
    gateway_response: data,
    updated_at: new Date(),
    metadata: {
      paystack_response: data
    }
  }

  let result;
  if (existingTransaction) {
    console.log('Updating existing transaction:', existingTransaction.id)
    result = await supabase
      .from('transactions')
      .update(transactionData)
      .eq('id', existingTransaction.id)
  } else {
    console.log('Creating new failed transaction record')
    result = await supabase
      .from('transactions')
      .insert({ ...transactionData, created_at: new Date() })
      .select()
  }

  if (result.error) {
    console.error('Error handling failed transaction:', result.error)
  } else {
    console.log('Failed transaction record updated/created successfully')
  }

  // Get the payment method ID from metadata or attempt to find a default one
  let paymentMethodId = metadata?.payment_method_id;
  if (!paymentMethodId) {
    const { data: defaultPaymentMethod } = await supabase
      .from('payment_methods')
      .select('id')
      .eq('firm_id', firm_id)
      .eq('is_default', true)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (defaultPaymentMethod) {
      paymentMethodId = defaultPaymentMethod.id;
    }
  }

  // Get invoice ID from metadata or find by reference
  let invoiceId = metadata?.invoice_id;
  if (!invoiceId && metadata?.invoice_number) {
    const { data: invoice } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', metadata.invoice_number)
      .single();
    
    if (invoice) {
      invoiceId = invoice.id;
    }
  }

  // If we have both an invoice ID and payment method ID, schedule retry attempts
  if (invoiceId && paymentMethodId) {
    console.log('Setting up payment retry for invoice:', invoiceId);
    
    try {
      // Call the handle_payment_failure function to set up retries
      const { data: retryResult, error: retryError } = await supabase.rpc(
        'handle_payment_failure', 
        { 
          invoice_id_param: invoiceId,
          payment_method_id_param: paymentMethodId,
          failure_reason: data.gateway_response || 'Payment processing failed' 
        }
      );
      
      if (retryError) {
        console.error('Error scheduling payment retry:', retryError);
      } else {
        console.log('Payment retry scheduled successfully:', retryResult);
      }
    } catch (error) {
      console.error('Exception when scheduling payment retry:', error);
    }
  } else {
    console.log('Cannot schedule retry - missing invoice ID or payment method ID');
    
    // Still update invoice if invoice_number is provided
    if (metadata?.invoice_number) {
      console.log('Updating invoice for failed payment:', metadata.invoice_number);
      
      const { error: invoiceError } = await supabase
        .from('invoices')
        .update({
          status: 'overdue',
          updated_at: new Date(),
          metadata: {
            ...metadata,
            payment_failed: true,
            payment_failed_at: new Date(),
            failure_reason: data.gateway_response || 'Payment failed',
            retry_failed: 'Missing payment method or invoice ID'
          }
        })
        .eq('invoice_number', metadata.invoice_number);

      if (invoiceError) {
        console.error('Error updating invoice for failed payment:', invoiceError);
      } else {
        console.log('Invoice updated successfully for failed payment');
      }
    }
  }

  // Record payment failure in firm record
  const { error: firmUpdateError } = await supabase
    .from('firms')
    .update({
      payment_failed: true,
      payment_failed_at: new Date(),
      updated_at: new Date()
    })
    .eq('id', firm_id);

  if (firmUpdateError) {
    console.error('Error updating firm payment failure status:', firmUpdateError);
  } else {
    console.log('Firm payment failure status updated successfully');
  }
}

serve(async (req) => {
  console.log('\n--- New webhook request received ---')
  console.log('Request method:', req.method)
  console.log('Request headers:', Object.fromEntries(req.headers.entries()))

  if (req.method === 'OPTIONS') {
    console.log('Handling CORS preflight request')
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    console.warn('Invalid request method:', req.method)
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    
    const isValidSignature = await verifyPaystackSignature(rawBody, signature)
    if (!isValidSignature) {
      console.warn('Invalid Paystack signature')
      // In production, you should uncomment these lines:
      // return new Response('Invalid signature', { 
      //   status: 401,
      //   headers: corsHeaders 
      // })
    }

    const body = JSON.parse(rawBody)
    console.log('Webhook payload:', body)
    
    const { event, data } = body

    console.log('Processing event type:', event)

    switch (event) {
      case 'charge.success':
        await handleChargeSuccess(data)
        break

      case 'charge.failed':
        await handleFailedCharge(data)
        break

      default:
        console.log(`Unhandled event type: ${event}`)
    }

    console.log('Webhook processed successfully')
    return new Response('OK', { 
      status: 200,
      headers: corsHeaders 
    })
  } catch (error) {
    console.error('Error processing webhook:', error)
    console.error('Error stack:', error.stack)
    return new Response('Internal server error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
}) 