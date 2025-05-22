import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { crypto } from "https://deno.land/std@0.167.0/crypto/mod.ts";

const PAYSTACK_SECRET = Deno.env.get('PAYSTACK_SECRET_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

async function verifyPaystackSignature(rawBody: string, signature: string | null): Promise<boolean> {
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
  
  return signature === hashHex
}

async function updateOrCreatePaymentMethod(firm_id: string, authorization: any, customerEmail: string) {
  if (!authorization?.authorization_code) {
    console.log('No authorization code provided, skipping payment method update')
    return null
  }

  // First, reset all default payment methods for this firm
  const { error: resetError } = await supabase
    .from('payment_methods')
    .update({ is_default: false, updated_at: new Date() })
    .eq('firm_id', firm_id)
    .eq('is_default', true)

  if (resetError) {
    console.error('Error resetting default payment methods:', resetError)
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
      email: customerEmail,
      authorization_code: authorization.authorization_code
    },
    metadata: {
      customer_code: authorization.customer_code,
      signature: authorization.signature
    },
    updated_at: new Date()
  }

  // Try to find existing payment method
  const { data: existingMethod, error: lookupError } = await supabase
    .from('payment_methods')
    .select('id')
    .eq('provider', 'paystack')
    .eq('provider_payment_method_id', authorization.authorization_code)
    .single()

  if (lookupError && lookupError.code !== 'PGRST116') {
    console.error('Error looking up payment method:', lookupError)
    return null
  }

  let result;
  if (existingMethod) {
    result = await supabase
      .from('payment_methods')
      .update(paymentMethodData)
      .eq('id', existingMethod.id)
      .select()
  } else {
    result = await supabase
      .from('payment_methods')
      .insert({ ...paymentMethodData, created_at: new Date() })
      .select()
  }

  if (result.error) {
    console.error('Error handling payment method:', result.error)
    return null
  }

  return result.data?.[0]?.id
}

async function generateInvoiceNumber(): Promise<string> {
  const { data, error } = await supabase
    .from('invoices')
    .select('invoice_number')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw error
  }

  const lastNumber = data?.invoice_number ? parseInt(data.invoice_number.split('-')[2]) : 0
  const newNumber = lastNumber + 1
  const date = new Date().toISOString().slice(2, 8) // YYMMDD
  return `INV-${date}-${newNumber.toString().padStart(4, '0')}`
}

async function createInvoiceFromPlan(firm_id: string, plan_id: string, metadata: any = {}) {
  // Get plan details
  const { data: plan, error: planError } = await supabase
    .from('plans')
    .select('*')
    .eq('id', plan_id)
    .single()

  if (planError || !plan) {
    console.error('Error fetching plan:', planError)
    return null
  }

  // Generate invoice number
  const invoiceNumber = await generateInvoiceNumber()

  // Calculate dates
  const now = new Date()
  const dueDate = new Date(now)
  dueDate.setDate(dueDate.getDate() + 7) // Due in 7 days

  // Calculate amounts (plan.price_cents already includes base price)
  const subtotalCents = plan.price_cents
  const taxRate = 0.15 // 15% VAT
  const taxCents = Math.round(subtotalCents * taxRate)
  const totalCents = subtotalCents + taxCents

  // Create line items
  const lineItems = [
    {
      description: `${plan.name} - ${plan.billing_cycle} subscription`,
      quantity: 1,
      unit_price_cents: subtotalCents,
      total_cents: subtotalCents
    }
  ]

  // Create invoice
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
      firm_id,
      plan_id,
      invoice_number: invoiceNumber,
      status: 'pending',
      due_date: dueDate,
      subtotal_cents: subtotalCents,
      tax_cents: taxCents,
      total_cents: totalCents,
      currency: 'ZAR',
      line_items: lineItems,
      metadata: {
        plan_name: plan.name,
        billing_cycle: plan.billing_cycle,
        ...metadata
      }
    })
    .select()
    .single()

  if (invoiceError) {
    console.error('Error creating invoice:', invoiceError)
    return null
  }

  return invoice
}

async function handlePaymentAuthorization(data: any, isSuccess: boolean) {
  const {
    reference,
    amount,
    status,
    currency,
    customer,
    authorization,
    metadata
  } = data
  
  let firm_id = metadata?.firm_id
  
  if (!firm_id) {
    // Try to find firm by customer email
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('id')
      .eq('email', customer.email)
      .single()
      
    if (firmError || !firm) {
      console.error('No firm found for email:', customer.email)
      return
    }
    firm_id = firm.id
  }
  
  // Create payment method
  const paymentMethodId = await updateOrCreatePaymentMethod(firm_id, authorization, customer.email)
  
  // Record payment authorization
  const { data: authData, error: authError } = await supabase
    .from('payment_authorizations')
    .insert({
      firm_id,
      payment_method_id: paymentMethodId,
      provider: 'paystack',
      provider_authorization_id: authorization?.authorization_code,
      amount_cents: amount,
      currency: currency || 'ZAR',
      status: isSuccess ? 'authorized' : 'failed',
      metadata: {
        customer_code: authorization?.customer_code,
        signature: authorization?.signature,
        reusable: authorization?.reusable,
        customer_email: customer.email,
        reference: reference
      },
      retry_count: 0,
      retry_scheduled: false,
      failure_reason: !isSuccess ? (data.gateway_response || 'Authorization failed') : null
    })
    .select()
    .single()
  
  if (authError) {
    console.error('Error creating payment authorization:', authError)
    return
  }
  
  // If failed, schedule retry using handle_authorization_failure function
  if (!isSuccess) {
    // Update firm status
    await supabase
      .from('firms')
      .update({
        payment_failed: true,
        payment_failed_at: new Date()
      })
      .eq('id', firm_id)
    
    // Call database function to handle failure and schedule retry
    const { data: retryData, error: retryError } = await supabase.rpc(
      'handle_authorization_failure',
      { 
        authorization_id_param: authData.id,
        failure_reason: data.gateway_response || 'Authorization failed'
      }
    )
    
    if (retryError) {
      console.error('Error scheduling authorization retry:', retryError)
    } else {
      console.log('Scheduled retry for failed authorization:', retryData)
    }
  }
  
  return authData
}

async function handleChargeSuccess(data: any) {
  const {
    reference,
    amount,
    status,
    currency,
    customer,
    authorization,
    metadata,
    paid_at,
    fees
  } = data

  // Look up firm_id using customer email or metadata
  let firm_id = metadata?.firm_id

  if (!firm_id) {
    // Try to find firm by customer email
    const { data: firm, error: firmError } = await supabase
      .from('firms')
      .select('id')
      .eq('email', customer.email)
      .single()

    if (firmError || !firm) {
      console.error('No firm found for email:', customer.email)
      return
    }
    firm_id = firm.id
  }

  // Calculate fees
  const feeCents = fees || 0
  const netAmountCents = amount - feeCents

  // Check if transaction already exists
  const { data: existingTransaction, error: lookupError } = await supabase
    .from('transactions')
    .select('*')
    .eq('provider_transaction_id', reference)
    .single()

  // Create or update payment method
  const paymentMethodId = await updateOrCreatePaymentMethod(firm_id, authorization, customer.email)

  const transactionData = {
    firm_id,
    invoice_id: metadata?.invoice_id || null,
    payment_method_id: paymentMethodId,
    provider: 'paystack',
    provider_transaction_id: reference,
    type: 'payment',
    status: status === 'success' ? 'success' : 'failed',
    amount_cents: amount,
    fee_cents: feeCents,
    currency: currency || 'ZAR',
    reference: reference,
    provider_reference: data.id?.toString(),
    gateway_response: data,
    processed_at: new Date(paid_at),
    metadata: {
      customer_email: customer.email,
      authorization_code: authorization?.authorization_code,
      card_details: {
        last4: authorization?.last4,
        exp_month: authorization?.exp_month,
        exp_year: authorization?.exp_year,
        card_type: authorization?.card_type,
        bank: authorization?.bank
      },
      original_metadata: metadata
    },
    updated_at: new Date()
  }

  let result;
  let transaction;
  
  if (existingTransaction) {
    result = await supabase
      .from('transactions')
      .update(transactionData)
      .eq('id', existingTransaction.id)
      .select()
    
    transaction = result.data?.[0] || existingTransaction
  } else {
    result = await supabase
      .from('transactions')
      .insert({ ...transactionData, created_at: new Date() })
      .select()
    
    transaction = result.data?.[0]
  }

  if (result.error) {
    console.error('Error handling transaction:', result.error)
    return
  }

  // Handle invoice creation and payment
  if (status === 'success') {
    let invoice = null

    // If invoice_id is provided in metadata, use that invoice
    if (metadata?.invoice_id) {
      const { data: existingInvoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', metadata.invoice_id)
        .single()

      if (!invoiceError && existingInvoice) {
        invoice = existingInvoice
        
        // Update invoice payment status
        const { data: statusResult, error: statusError } = await supabase.rpc(
          'update_invoice_payment_status',
          { invoice_id_param: invoice.id }
        )
        
        if (statusError) {
          console.error('Error updating invoice payment status:', statusError)
        } else {
          console.log(`Updated invoice ${invoice.id} status to: ${statusResult}`)
        }
      }
    }
    // If plan_id is provided, create invoice from plan
    else if (metadata?.plan_id) {
      // Generate an invoice using the new function
      const { data: invoiceData, error: invoiceError } = await supabase.rpc(
        'generate_subscription_invoice',
        { 
          firm_id_param: firm_id, 
          plan_id_param: metadata.plan_id,
          status_param: 'paid'
        }
      )

      if (invoiceError) {
        console.error('Error generating invoice:', invoiceError)
      } else {
        // Get the generated invoice
        const { data: newInvoice, error: fetchError } = await supabase
          .from('invoices')
          .select('*')
          .eq('id', invoiceData)
          .single()
        
        if (!fetchError) {
          invoice = newInvoice
          
          // Update transaction with invoice_id
          if (invoice && transaction) {
            await supabase
              .from('transactions')
              .update({ invoice_id: invoice.id })
              .eq('id', transaction.id)
          }
        }
      }
    }
    // If no invoice_id or plan_id, but transaction exists, generate invoice from transaction
    else if (transaction) {
      const { data: invoiceData, error: invoiceError } = await supabase.rpc(
        'generate_invoice_from_transaction',
        { 
          transaction_id_param: transaction.id,
          status_param: 'paid'
        }
      )

      if (invoiceError) {
        console.error('Error generating invoice from transaction:', invoiceError)
      } else {
        console.log('Generated invoice from transaction:', invoiceData)
      }
    }

    // Reset firm payment_failed status if it was previously failed
    const { error: firmUpdateError } = await supabase
      .from('firms')
      .update({
        payment_failed: false,
        payment_failed_at: null
      })
      .eq('id', firm_id)
      .eq('payment_failed', true)
    
    if (firmUpdateError) {
      console.error('Error updating firm payment status:', firmUpdateError)
    }

    // Create payment authorization for future use
    if (authorization?.authorization_code) {
      await handlePaymentAuthorization(data, true)
    }
  }

  console.log(`Successfully processed charge.success for firm ${firm_id}, amount: ${amount/100} ${currency}`)
}

async function handleChargeFailed(data: any) {
  const { reference, amount, status, customer, metadata } = data

  // Look up firm_id
  let firm_id = metadata?.firm_id
  if (!firm_id) {
    const { data: firm } = await supabase
      .from('firms')
      .select('id')
      .eq('email', customer.email)
      .single()
    
    firm_id = firm?.id
  }

  if (!firm_id) {
    console.error('No firm found for failed charge')
    return
  }

  // Record failed transaction
  const { data: transaction, error: transactionError } = await supabase
    .from('transactions')
    .insert({
      firm_id,
      invoice_id: metadata?.invoice_id || null,
      provider: 'paystack',
      provider_transaction_id: reference,
      type: 'payment',
      status: 'failed',
      amount_cents: amount,
      currency: 'ZAR',
      reference: reference,
      gateway_response: data,
      failure_reason: data.gateway_response || 'Payment failed',
      metadata: {
        customer_email: customer.email,
        original_metadata: metadata
      }
    })
    .select()
    .single()

  if (transactionError) {
    console.error('Error recording failed transaction:', transactionError)
    return
  }
  
  // Generate invoice for failed transactions on subscription renewals if plan_id is provided
  if (metadata?.plan_id && metadata?.is_renewal === true) {
    const { data: invoiceData, error: invoiceError } = await supabase.rpc(
      'generate_subscription_invoice',
      { 
        firm_id_param: firm_id, 
        plan_id_param: metadata.plan_id,
        status_param: 'pending'
      }
    )
    
    if (invoiceError) {
      console.error('Error generating pending invoice for failed renewal:', invoiceError)
    } else {
      console.log('Generated pending invoice for failed renewal:', invoiceData)
      
      // Update transaction with the new invoice_id
      if (transaction) {
        await supabase
          .from('transactions')
          .update({ invoice_id: invoiceData })
          .eq('id', transaction.id)
      }
    }
  }
  
  // Update firm status
  await supabase
    .from('firms')
    .update({
      payment_failed: true,
      payment_failed_at: new Date()
    })
    .eq('id', firm_id)
  
  // Handle authorization failure if authorization data exists
  if (data.authorization) {
    await handlePaymentAuthorization(data, false)
  }
  
  // If there's an invoice, handle payment failure and schedule retry
  if (metadata?.invoice_id) {
    const paymentMethodId = metadata?.payment_method_id
    
    // Call database function to handle failure and schedule retry
    const { data: retryData, error: retryError } = await supabase.rpc(
      'handle_payment_failure',
      { 
        invoice_id_param: metadata.invoice_id,
        payment_method_id_param: paymentMethodId,
        failure_reason: data.gateway_response || 'Payment failed'
      }
    )
    
    if (retryError) {
      console.error('Error scheduling payment retry:', retryError)
    } else {
      console.log('Scheduled retry for failed payment:', retryData)
    }
  }

  console.log(`Recorded failed charge for firm ${firm_id}, amount: ${amount/100} ZAR`)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    })
  }

  try {
    const rawBody = await req.text()
    const signature = req.headers.get('x-paystack-signature')
    
    // Uncomment to verify signature in production
    // const isValidSignature = await verifyPaystackSignature(rawBody, signature)
    // if (!isValidSignature) {
    //   console.warn('Invalid Paystack signature')
    //   return new Response('Invalid signature', { 
    //     status: 401,
    //     headers: corsHeaders 
    //   })
    // }

    const body = JSON.parse(rawBody)
    const { event, data } = body
    
    console.log(`Processing Paystack webhook: ${event}`)

    switch (event) {
      case 'charge.success':
        await handleChargeSuccess(data)
        break

      case 'charge.failed':
        await handleChargeFailed(data)
        break
        
      case 'authorization.success':
        await handlePaymentAuthorization(data, true)
        break
        
      case 'authorization.failed':
        await handlePaymentAuthorization(data, false)
        break

      default:
        console.log(`Unhandled event type: ${event}`)
    }

    return new Response('OK', { 
      status: 200,
      headers: corsHeaders 
    })
  } catch (error) {
    console.error('Error processing webhook:', error)
    return new Response('Internal server error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
})