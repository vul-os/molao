-- Drop existing tables if they exist
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS payment_authorizations CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
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
    metadata jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

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

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_methods_updated_at BEFORE UPDATE ON payment_methods FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_authorizations_updated_at BEFORE UPDATE ON payment_authorizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();