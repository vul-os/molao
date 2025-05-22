import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

serve(async (req: Request) => {
  let requestBody: { 
    invoiceId?: string; 
    firmId?: string; 
    planId?: string; 
    apiKey?: string;
    isFirstCharge?: boolean; // New parameter for first-time charge
  } = {};
  
  console.log('→ Initializing Supabase client')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )
  console.log('→ Received request:', req.method, req.url)
  
  if (req.method === 'OPTIONS') {
    console.log('→ Handling OPTIONS request')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    requestBody = await req.json()
    console.log('→ Request payload:', { 
      invoiceId: requestBody.invoiceId,
      firmId: requestBody.firmId,
      planId: requestBody.planId,
      hasApiKey: !!requestBody.apiKey,
      isFirstCharge: requestBody.isFirstCharge 
    })
    
    const { invoiceId, firmId, planId, apiKey, isFirstCharge } = requestBody

    // Validate API key
    const storedApiKey = Deno.env.get('BILLING_API_KEY')
    if (!apiKey || apiKey !== storedApiKey) {
      console.error('✖ Invalid API key provided')
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    console.log('✓ API key validated')

    // Validate required parameters
    if (!firmId || (!invoiceId && !planId)) {
      console.error('✖ Missing required parameters')
      return new Response(
        JSON.stringify({ error: 'Missing firmId and either invoiceId or planId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let invoice = null
    let amountInCents = 0
    let fullAmountInCents = 0
    let proRataApplied = false

    // Get or create invoice
    if (invoiceId) {
      console.log('→ Fetching existing invoice:', invoiceId)
      const { data: existingInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .eq('firm_id', firmId)
        .single()

      if (invoiceError || !existingInvoice) {
        console.error('✖ Failed to fetch invoice:', invoiceError)
        return new Response(
          JSON.stringify({ error: 'Invoice not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      invoice = existingInvoice
      amountInCents = invoice.total_cents
      fullAmountInCents = amountInCents
      console.log('✓ Invoice found:', { id: invoice.id, amount: amountInCents, status: invoice.status })

      // Check if invoice is already paid
      if (invoice.status === 'paid') {
        console.error('✖ Invoice already paid')
        return new Response(
          JSON.stringify({ error: 'Invoice already paid' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } else if (planId) {
      console.log('→ Creating invoice from plan:', planId)
      
      // Get plan details
      const { data: plan, error: planError } = await supabase
        .from('plans')
        .select('*')
        .eq('id', planId)
        .single()

      if (planError || !plan) {
        console.error('✖ Failed to fetch plan:', planError)
        return new Response(
          JSON.stringify({ error: 'Plan not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate invoice number
      const { data: lastInvoice } = await supabase
        .from('invoices')
        .select('invoice_number')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      const lastNumber = lastInvoice?.invoice_number ? parseInt(lastInvoice.invoice_number.split('-')[2]) : 0
      const newNumber = lastNumber + 1
      const date = new Date().toISOString().slice(2, 8) // YYMMDD
      const invoiceNumber = `INV-${date}-${newNumber.toString().padStart(4, '0')}`

      // Calculate amounts
      const subtotalCents = plan.price_cents
      fullAmountInCents = subtotalCents
      
      // Apply pro-rata calculation for first charges
      let proRataSubtotalCents = subtotalCents
      let proRataDescription = `${plan.name} - monthly subscription`
      
      if (isFirstCharge) {
        const now = new Date()
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        const remainingDays = daysInMonth - now.getDate() + 1 // +1 to include current day
        
        // Calculate pro-rata amount
        proRataSubtotalCents = Math.round((subtotalCents * remainingDays) / daysInMonth)
        proRataDescription = `${plan.name} - pro-rata for ${remainingDays} of ${daysInMonth} days`
        proRataApplied = true
        
        console.log('→ Applying pro-rata billing:', { 
          fullAmount: subtotalCents,
          proRataAmount: proRataSubtotalCents,
          remainingDays,
          daysInMonth
        })
      }
      
      // Use pro-rata amount for tax calculation
      const taxRate = 0.15 // 15% VAT
      const taxCents = Math.round(proRataSubtotalCents * taxRate)
      const totalCents = proRataSubtotalCents + taxCents
      amountInCents = totalCents

      // Create line items with pro-rata description if applicable
      const lineItems = [
        {
          description: proRataDescription,
          quantity: 1,
          unit_price_cents: proRataSubtotalCents,
          total_cents: proRataSubtotalCents
        }
      ]

      // Create invoice
      const { data: newInvoice, error: createInvoiceError } = await supabase
        .from('invoices')
        .insert({
          firm_id: firmId,
          plan_id: planId,
          invoice_number: invoiceNumber,
          status: 'pending',
          due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
          subtotal_cents: proRataSubtotalCents,
          tax_cents: taxCents,
          total_cents: totalCents,
          currency: 'ZAR',
          line_items: lineItems,
          metadata: {
            plan_name: plan.name,
            billing_cycle: 'monthly',
            pro_rata_applied: proRataApplied,
            full_amount_cents: fullAmountInCents,
            days_billed: isFirstCharge ? remainingDays : null,
            is_first_charge: isFirstCharge
          }
        })
        .select()
        .single()

      if (createInvoiceError || !newInvoice) {
        console.error('✖ Failed to create invoice:', createInvoiceError)
        return new Response(
          JSON.stringify({ error: 'Failed to create invoice' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      invoice = newInvoice
      console.log('✓ Invoice created:', { id: invoice.id, amount: amountInCents, proRataApplied })
    }

    // Get firm's default payment method
    console.log('→ Fetching default payment method for firm:', firmId)
    const { data: paymentMethod, error: paymentMethodError } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('firm_id', firmId)
      .eq('is_default', true)
      .eq('is_active', true)
      .single()

    if (paymentMethodError || !paymentMethod) {
      console.error('✖ No default payment method found:', paymentMethodError)
      return new Response(
        JSON.stringify({ error: 'No default payment method found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('✓ Payment method found:', { 
      id: paymentMethod.id,
      type: paymentMethod.type,
      provider: paymentMethod.provider,
      last4: paymentMethod.details?.last4
    })

    // Get firm details for billing
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('*')
      .eq('id', firmId)
      .single()

    if (firmError || !firm) {
      console.error('✖ Failed to fetch firm:', firmError)
      return new Response(
        JSON.stringify({ error: 'Firm not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Charge the authorization via Paystack
    console.log('→ Initiating Paystack charge authorization')
    const paystackRes = await fetch('https://api.paystack.co/transaction/charge_authorization', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('PAYSTACK_SECRET_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: paymentMethod.details.email || firm.email,
        amount: amountInCents,
        authorization_code: paymentMethod.provider_payment_method_id,
        currency: 'ZAR',
        metadata: {
          firm_id: firmId,
          invoice_id: invoice.id,
          plan_id: planId || null,
          payment_method_id: paymentMethod.id,
          pro_rata_applied: proRataApplied,
          is_first_charge: isFirstCharge
        }
      })
    })

    const paystackData = await paystackRes.json()
    console.log('← Paystack response:', {
      status: paystackData.status,
      reference: paystackData.data?.reference,
      paymentStatus: paystackData.data?.status
    })

    // Handle payment failure scenarios
    const isPaymentFailed = !paystackRes.ok || 
      !paystackData.status || 
      (paystackData.data?.status && ['failed', 'reversed', 'cancelled'].includes(paystackData.data.status.toLowerCase()));

    if (isPaymentFailed) {
      console.error('✖ Paystack charge failed:', paystackData)
      
      // Update invoice status to failed
      console.log('→ Updating invoice status to failed')
      const { error: updateError } = await supabase
        .from('invoices')
        .update({ 
          status: 'overdue',
          updated_at: new Date().toISOString()
        })
        .eq('id', invoice.id)

      if (updateError) {
        console.error('✖ Failed to update invoice status:', updateError)
      }

      // Create failed transaction record
      const { error: transactionError } = await supabase
        .from('transactions')
        .insert({
          firm_id: firmId,
          invoice_id: invoice.id,
          payment_method_id: paymentMethod.id,
          provider: 'paystack',
          provider_transaction_id: paystackData.data?.reference || null,
          type: 'payment',
          status: 'failed',
          amount_cents: amountInCents,
          fee_cents: 0,
          currency: 'ZAR',
          reference: paystackData.data?.reference || null,
          provider_reference: paystackData.data?.id?.toString() || null,
          gateway_response: paystackData,
          failure_reason: paystackData.message || 'Payment failed',
          metadata: {
            firm_email: firm.email,
            invoice_number: invoice.invoice_number,
            original_paystack_data: paystackData,
            pro_rata_applied: proRataApplied
          }
        })

      if (transactionError) {
        console.error('✖ Failed to create transaction record:', transactionError)
      }

      return new Response(
        JSON.stringify({ 
          status: false, 
          message: 'Payment failed',
          invoice_id: invoice.id,
          ...paystackData 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Payment successful - calculate fees
    const feeCents = paystackData.data?.fees || 0
    const netAmountCents = amountInCents - feeCents

    // Create successful transaction record
    console.log('→ Creating transaction record')
    const { error: transactionError } = await supabase
      .from('transactions')
      .insert({
        firm_id: firmId,
        invoice_id: invoice.id,
        payment_method_id: paymentMethod.id,
        provider: 'paystack',
        provider_transaction_id: paystackData.data.reference,
        type: 'payment',
        status: 'success',
        amount_cents: amountInCents,
        fee_cents: feeCents,
        currency: 'ZAR',
        reference: paystackData.data.reference,
        provider_reference: paystackData.data.id?.toString(),
        gateway_response: paystackData.data,
        processed_at: new Date().toISOString(),
        metadata: {
          firm_email: firm.email,
          invoice_number: invoice.invoice_number,
          card_details: {
            last4: paymentMethod.details?.last4,
            card_type: paymentMethod.details?.card_type,
            bank: paymentMethod.details?.bank
          },
          pro_rata_applied: proRataApplied,
          full_amount_cents: fullAmountInCents,
          is_first_charge: isFirstCharge
        }
      })

    if (transactionError) {
      console.error('✖ Failed to create transaction record:', transactionError)
    } else {
      console.log('✓ Transaction record created successfully')
    }

    // If this was a first-time pro-rata charge, set up next billing date for 1st of next month
    if (isFirstCharge && proRataApplied) {
      const now = new Date()
      // Get the first day of next month
      const nextBillingDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      
      console.log('→ Setting up next billing date for firm:', {
        firmId,
        nextBillingDate: nextBillingDate.toISOString()
      })
      
      // Update firm with next billing date
      const { error: firmUpdateError } = await supabase
        .from('firms')
        .update({
          next_billing_date: nextBillingDate.toISOString(),
          billing_cycle: 'monthly',
          current_plan_id: planId,
          updated_at: new Date().toISOString()
        })
        .eq('id', firmId)
      
      if (firmUpdateError) {
        console.error('✖ Failed to update firm next billing date:', firmUpdateError)
      } else {
        console.log('✓ Next billing date updated successfully')
      }
      
      // Schedule next billing
      const { data: schedulingResult, error: schedulingError } = await supabase.rpc(
        'schedule_next_billing',
        { 
          firm_id_param: firmId,
          payment_method_id_param: paymentMethod.id,
          next_billing_date_param: nextBillingDate.toISOString(),
          plan_id_param: planId
        }
      )
      
      if (schedulingError) {
        console.error('✖ Failed to schedule next billing:', schedulingError)
      } else {
        console.log('✓ Next billing scheduled successfully')
      }
    }

    // Update invoice status to paid
    console.log('→ Updating invoice status to paid')
    const { error: invoiceUpdateError } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', invoice.id)

    if (invoiceUpdateError) {
      console.error('✖ Failed to update invoice status:', invoiceUpdateError)
    } else {
      console.log('✓ Invoice status updated to paid')
    }

    console.log('✓ Charge authorization completed successfully')
    return new Response(
      JSON.stringify({
        status: true,
        message: 'Payment successful',
        invoice_id: invoice.id,
        transaction_reference: paystackData.data.reference,
        amount: amountInCents / 100,
        currency: 'ZAR',
        pro_rata_applied: proRataApplied,
        full_amount: fullAmountInCents / 100,
        is_first_charge: isFirstCharge,
        ...paystackData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('✖ Unexpected error:', error)
     
    return new Response(
      JSON.stringify({ 
        status: false,
        message: 'Unexpected error occurred',
        error: error.message
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})