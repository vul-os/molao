-- Drop existing tables if they exist
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS payment_authorizations CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS plans CASCADE;

-- 1. Plans - Subscription/billing plans
CREATE TABLE plans (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    name text NOT NULL,
    description text,
    price_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'ZAR',
    billing_cycle text CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')) NOT NULL DEFAULT 'monthly',
    features jsonb, -- Array of features included in this plan
    is_active boolean DEFAULT true,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 1b. Subscriptions - Track which plan a firm is on
CREATE TABLE subscriptions (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    plan_id uuid REFERENCES plans(id) ON DELETE RESTRICT NOT NULL,
    status text CHECK (status IN ('active', 'canceled', 'paused', 'past_due', 'trialing', 'expired')) NOT NULL DEFAULT 'active',
    start_date timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    end_date timestamp with time zone,
    auto_renew boolean DEFAULT true,
    next_billing_date timestamp with time zone,
    trial_end_date timestamp with time zone,
    canceled_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create a partial unique index to ensure a firm can only have one active subscription
CREATE UNIQUE INDEX idx_subscriptions_firm_active ON subscriptions(firm_id) WHERE status = 'active';

-- 2. Payment Methods - Store saved payment methods for firms
CREATE TABLE payment_methods (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    provider text NOT NULL, -- 'paystack', 'stripe', 'flutterwave', etc.
    provider_payment_method_id text, -- Provider's ID for this payment method
    type text NOT NULL, -- 'card', 'bank_account', 'mobile_money', etc.
    is_default boolean DEFAULT false,
    details jsonb NOT NULL, -- Masked card details, bank name, authorization_code for Paystack
    is_active boolean DEFAULT true,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(provider, provider_payment_method_id)
);

-- 3. Invoices - Bills for firms
CREATE TABLE invoices (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
    invoice_number text UNIQUE NOT NULL,
    status text CHECK (status IN ('draft', 'pending', 'paid', 'partially_paid', 'overdue', 'cancelled')) NOT NULL DEFAULT 'draft',
    subtotal_cents integer NOT NULL DEFAULT 0,
    tax_cents integer NOT NULL DEFAULT 0,
    total_cents integer NOT NULL DEFAULT 0,
    currency text NOT NULL DEFAULT 'ZAR',
    due_date timestamp with time zone,
    paid_at timestamp with time zone,
    line_items jsonb NOT NULL, -- Array of {description, quantity, unit_price_cents, total_cents}
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- -- 4. Payment Authorizations - Pre-authorized payments (Paystack auth codes, etc.)
-- CREATE TABLE payment_authorizations (
--     id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
--     firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
--     payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
--     provider text NOT NULL,
--     provider_authorization_id text, -- Paystack authorization code, Stripe setup intent, etc.
--     amount_cents integer NOT NULL,
--     currency text NOT NULL DEFAULT 'ZAR',
--     status text CHECK (status IN ('pending', 'authorized', 'failed', 'cancelled', 'expired')) NOT NULL DEFAULT 'pending',
--     expires_at timestamp with time zone,
--     metadata jsonb,
--     created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
--     updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
-- );

-- 4. Payment Authorizations - Pre-authorized payments (Paystack auth codes, etc.)
CREATE TABLE payment_authorizations (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
    provider text NOT NULL,
    provider_authorization_id text, -- Paystack authorization code, Stripe setup intent, etc.
    amount_cents integer NOT NULL,
    currency text NOT NULL DEFAULT 'ZAR',
    status text CHECK (status IN ('pending', 'authorized', 'failed', 'cancelled', 'expired')) NOT NULL DEFAULT 'pending',
    expires_at timestamp with time zone,
    
    -- Payment retry tracking
    retry_count integer DEFAULT 0,
    last_retry_at timestamp with time zone,
    max_retries integer DEFAULT 3,
    retry_scheduled boolean DEFAULT false,
    next_retry_at timestamp with time zone,
    
    -- Failure information
    failure_reason text,
    failure_code text,
    
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index for efficient querying of records needing retry
CREATE INDEX idx_payment_authorizations_retry ON payment_authorizations(next_retry_at) 
WHERE status = 'failed' AND retry_count < max_retries;

-- 5. Transactions - All payment transactions and attempts
CREATE TABLE transactions (
    id uuid DEFAULT uuid_generate_v4() PRIMARY KEY,
    firm_id uuid REFERENCES firms(id) ON DELETE CASCADE NOT NULL,
    invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
    payment_method_id uuid REFERENCES payment_methods(id) ON DELETE SET NULL,
    payment_authorization_id uuid REFERENCES payment_authorizations(id) ON DELETE SET NULL,
    provider text NOT NULL,
    provider_transaction_id text,
    type text CHECK (type IN ('payment', 'refund', 'chargeback')) NOT NULL DEFAULT 'payment',
    status text CHECK (status IN ('pending', 'processing', 'success', 'failed', 'cancelled')) NOT NULL DEFAULT 'pending',
    amount_cents integer NOT NULL,
    fee_cents integer DEFAULT 0,
    currency text NOT NULL DEFAULT 'ZAR',
    reference text UNIQUE, -- Your internal reference
    provider_reference text, -- Provider's reference (Paystack reference, etc.)
    gateway_response jsonb, -- Full response from payment gateway
    failure_reason text,
    processed_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- Indexes for performance
CREATE INDEX idx_plans_is_active ON plans(is_active);
CREATE INDEX idx_plans_billing_cycle ON plans(billing_cycle);

CREATE INDEX idx_subscriptions_firm_id ON subscriptions(firm_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions(next_billing_date) WHERE status = 'active';

CREATE INDEX idx_payment_methods_firm_id ON payment_methods(firm_id);
CREATE INDEX idx_payment_methods_provider ON payment_methods(provider);
CREATE INDEX idx_payment_methods_is_default ON payment_methods(firm_id, is_default) WHERE is_default = true;

CREATE INDEX idx_invoices_firm_id ON invoices(firm_id);
CREATE INDEX idx_invoices_plan_id ON invoices(plan_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);

CREATE INDEX idx_payment_authorizations_firm_id ON payment_authorizations(firm_id);
CREATE INDEX idx_payment_authorizations_status ON payment_authorizations(status);

CREATE INDEX idx_transactions_firm_id ON transactions(firm_id);
CREATE INDEX idx_transactions_invoice_id ON transactions(invoice_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_reference ON transactions(reference);

-- Function to cancel a subscription
CREATE OR REPLACE FUNCTION cancel_subscription(
  firm_id_param uuid,
  subscription_id_param uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  subscription_id uuid;
  now_timestamp timestamp with time zone := timezone('utc'::text, now());
  job_name text;
  has_cron boolean;
BEGIN
  -- Find the active subscription for the firm if subscription_id is not provided
  IF subscription_id_param IS NULL THEN
    SELECT id INTO subscription_id
    FROM subscriptions
    WHERE firm_id = firm_id_param AND status = 'active'
    LIMIT 1;
  ELSE
    subscription_id := subscription_id_param;
  END IF;

  -- If no subscription found, return null
  IF subscription_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Update the subscription status to canceled
  UPDATE subscriptions
  SET 
    status = 'canceled',
    canceled_at = now_timestamp,
    end_date = now_timestamp,
    auto_renew = false,
    updated_at = now_timestamp,
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{canceled_reason}',
      '"user_requested"'
    )
  WHERE id = subscription_id;

  -- Check if cron is available
  has_cron := EXISTS (
    SELECT 1 
    FROM information_schema.tables 
    WHERE table_schema = 'cron' AND table_name = 'job'
  );

  -- Generate unique job name for this firm
  job_name := 'firm_' || firm_id_param::text;
  
  -- Unschedule job if it exists and cron is available
  IF has_cron THEN
    -- Check if job exists before trying to unschedule
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = job_name) THEN
      PERFORM cron.unschedule(job_name);
      RAISE NOTICE 'Unscheduled cron job % for firm %', job_name, firm_id_param;
    END IF;
  END IF;
  
  -- Also update the firm record to indicate billing is no longer active
  UPDATE firms
  SET 
    billing_active = false,
    updated_at = now_timestamp
  WHERE id = firm_id_param;

  RETURN subscription_id;
END;
$$;

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_authorizations_updated_at BEFORE UPDATE ON payment_authorizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();