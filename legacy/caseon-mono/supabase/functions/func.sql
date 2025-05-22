-- Add helper function to check if job exists
CREATE OR REPLACE FUNCTION job_exists(job_name text) 
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM cron.job 
        WHERE jobname = job_name
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule next billing cycle for a firm
CREATE OR REPLACE FUNCTION schedule_next_billing(
    firm_id_param uuid,
    payment_method_id_param uuid,
    next_billing_date_param timestamptz,
    plan_id_param uuid
)
RETURNS void AS $$
DECLARE
    job_name text;
    cron_schedule text;
    charge_url text;
    next_run_date timestamptz;
    day_of_month integer;
    has_cron boolean;
    command text;
BEGIN
    -- Set the URL and API key
    charge_url := 'https://yourapp.supabase.co/functions/v1/charge-plan';
    
    -- Generate unique job name for this firm
    job_name := 'firm_' || firm_id_param::text;
    
    -- Determine next run date based on the provided next_billing_date or default calculation
    IF next_billing_date_param IS NULL THEN
        -- Calculate next billing date for monthly billing
        next_run_date := NOW() + INTERVAL '1 month';
    ELSE
        next_run_date := next_billing_date_param;
    END IF;
    
    -- Extract day from the next run date for cron scheduling
    day_of_month := EXTRACT(DAY FROM next_run_date)::integer;
    
    -- Format the cron schedule to run at midnight on the specific day of month
    -- Format: minute hour day month day_of_week
    cron_schedule := format('0 0 %s * *', day_of_month);
    
    -- Check if cron is available
    has_cron := EXISTS (
        SELECT 1 
        FROM information_schema.tables 
        WHERE table_schema = 'cron' AND table_name = 'job'
    );
    
    -- Format the command
    command := format(
        'SELECT net.http_post(%L, %L, %L, %L, %L)',
        charge_url,
        jsonb_build_object(
            'firm_id', firm_id_param,
            'payment_method_id', payment_method_id_param,
            'plan_id', plan_id_param,
            'billing_cycle', 'monthly'
        ),
        '{}'::jsonb, -- No URL params
        '{"Content-Type": "application/json"}'::jsonb,
        30000 -- 30 second timeout
    );
    
    -- Unschedule existing job if it exists before scheduling new one
    IF has_cron THEN
        IF job_exists(job_name) THEN
            PERFORM cron.unschedule(job_name);
        END IF;
        
        -- Schedule the new job using cron
        PERFORM cron.schedule(
            job_name,
            cron_schedule,
            command
        );
    ELSE
        -- Use our alternative scheduling method
        PERFORM schedule_without_cron(
            job_name,
            cron_schedule,
            command
        );
    END IF;
    
    -- Update firm's next billing date
    UPDATE firms 
    SET 
        next_billing_date = next_run_date,
        current_plan_id = plan_id_param,
        billing_cycle = 'monthly',
        updated_at = NOW()
    WHERE id = firm_id_param;
    
    RAISE NOTICE 'Scheduled monthly billing job for firm % with plan % to run on %', 
        firm_id_param, plan_id_param, next_run_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to generate a new invoice for a firm
CREATE OR REPLACE FUNCTION generate_invoice_for_firm(
    firm_id_param uuid,
    plan_id_param uuid
)
RETURNS uuid AS $$
DECLARE
    new_invoice_id uuid;
    invoice_number text;
    plan_record record;
    subtotal_cents integer;
    tax_rate decimal := 0.15; -- 15% VAT
    tax_cents integer;
    total_cents integer;
    due_date timestamptz;
    line_items jsonb;
BEGIN
    -- Generate unique invoice number
    SELECT 
        'INV-' || to_char(NOW(), 'YYMMDD') || '-' || 
        LPAD(COALESCE(
            (SELECT COUNT(*) + 1 FROM invoices 
             WHERE created_at >= date_trunc('day', NOW())),
            1)::text, 4, '0')
    INTO invoice_number;
    
    -- Get plan details
    SELECT * INTO plan_record 
    FROM plans 
    WHERE id = plan_id_param AND is_active = true;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Plan not found or not active: %', plan_id_param;
    END IF;
    
    -- Calculate amounts
    subtotal_cents := plan_record.price_cents;
    tax_cents := ROUND(subtotal_cents * tax_rate);
    total_cents := subtotal_cents + tax_cents;
    
    -- Calculate due date
    due_date := NOW() + INTERVAL '7 days';
    
    -- Create line items
    line_items := jsonb_build_array(
        jsonb_build_object(
            'description', plan_record.name || ' (monthly)',
            'quantity', 1,
            'unit_price_cents', subtotal_cents,
            'total_cents', subtotal_cents
        )
    );
    
    -- Insert new invoice
    INSERT INTO invoices (
        firm_id,
        plan_id,
        invoice_number,
        status,
        subtotal_cents,
        tax_cents,
        total_cents,
        currency,
        due_date,
        line_items,
        notes,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        firm_id_param,
        plan_id_param,
        invoice_number,
        'pending',
        subtotal_cents,
        tax_cents,
        total_cents,
        plan_record.currency,
        due_date,
        line_items,
        'Monthly subscription',
        jsonb_build_object(
            'billing_cycle', 'monthly',
            'plan_name', plan_record.name,
            'generated_at', NOW()
        ),
        NOW(),
        NOW()
    )
    RETURNING id INTO new_invoice_id;
    
    RETURN new_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to automatically charge a saved payment method
CREATE OR REPLACE FUNCTION auto_charge_payment_method(
    firm_id_param uuid,
    invoice_id_param uuid,
    payment_method_id_param uuid
)
RETURNS jsonb AS $$
DECLARE
    payment_method_record record;
    invoice_record record;
    transaction_reference text;
    transaction_id uuid;
    charge_response jsonb;
BEGIN
    -- Get payment method details
    SELECT * INTO payment_method_record
    FROM payment_methods
    WHERE id = payment_method_id_param AND firm_id = firm_id_param AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment method not found or not active'
        );
    END IF;
    
    -- Get invoice details
    SELECT * INTO invoice_record
    FROM invoices
    WHERE id = invoice_id_param AND firm_id = firm_id_param;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invoice not found'
        );
    END IF;
    
    -- Generate unique transaction reference
    transaction_reference := 'auto-' || firm_id_param::text || '-' || NOW()::text;
    
    -- Create pending transaction record
    INSERT INTO transactions (
        firm_id,
        invoice_id,
        payment_method_id,
        provider,
        type,
        status,
        amount_cents,
        currency,
        reference,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        firm_id_param,
        invoice_id_param,
        payment_method_id_param,
        payment_method_record.provider,
        'payment',
        'pending',
        invoice_record.total_cents,
        invoice_record.currency,
        transaction_reference,
        jsonb_build_object(
            'auto_charged', true,
            'invoice_number', invoice_record.invoice_number,
            'initiated_at', NOW()
        ),
        NOW(),
        NOW()
    )
    RETURNING id INTO transaction_id;
    
    -- In a real implementation, this would call the payment provider's API
    -- Here we're simulating a successful charge
    UPDATE transactions
    SET 
        status = 'success',
        processed_at = NOW(),
        updated_at = NOW(),
        metadata = jsonb_build_object(
            'auto_charged', true,
            'invoice_number', invoice_record.invoice_number,
            'processed_at', NOW(),
            'simulation', 'This is a simulated successful charge'
        )
    WHERE id = transaction_id;
    
    -- Update invoice to paid
    UPDATE invoices
    SET 
        status = 'paid',
        paid_at = NOW(),
        updated_at = NOW(),
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{payment_details}',
            jsonb_build_object(
                'transaction_id', transaction_id,
                'payment_method_id', payment_method_id_param,
                'paid_at', NOW(),
                'auto_charged', true
            )
        )
    WHERE id = invoice_id_param;
    
    charge_response := jsonb_build_object(
        'success', true,
        'transaction_id', transaction_id,
        'invoice_id', invoice_id_param,
        'amount', invoice_record.total_cents,
        'currency', invoice_record.currency,
        'reference', transaction_reference
    );
    
    RETURN charge_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to process recurring billing
CREATE OR REPLACE FUNCTION process_recurring_billing(firm_id_param uuid) 
RETURNS jsonb AS $$
DECLARE
    firm_record record;
    plan_record record;
    payment_method_record record;
    invoice_id uuid;
    charge_result jsonb;
    next_billing_date timestamptz;
BEGIN
    -- Get firm details
    SELECT * INTO firm_record
    FROM firms
    WHERE id = firm_id_param;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Firm not found'
        );
    END IF;
    
    -- Get plan details
    SELECT * INTO plan_record
    FROM plans
    WHERE id = firm_record.current_plan_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Plan not found or not active'
        );
    END IF;
    
    -- Get default payment method
    SELECT * INTO payment_method_record
    FROM payment_methods
    WHERE firm_id = firm_id_param AND is_default = true AND is_active = true
    ORDER BY updated_at DESC
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No default payment method found'
        );
    END IF;
    
    -- Generate invoice
    invoice_id := generate_invoice_for_firm(firm_id_param, plan_record.id);
    
    -- Process payment
    charge_result := auto_charge_payment_method(firm_id_param, invoice_id, payment_method_record.id);
    
    -- Calculate next billing date - monthly only
    next_billing_date := NOW() + INTERVAL '1 month';
    
    -- Schedule next billing
    PERFORM schedule_next_billing(
        firm_id_param,
        payment_method_record.id,
        next_billing_date,
        plan_record.id
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', invoice_id,
        'charge_result', charge_result,
        'next_billing_date', next_billing_date
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cancel firm's recurring billing
CREATE OR REPLACE FUNCTION cancel_firm_billing(firm_id_param uuid) 
RETURNS boolean AS $$
DECLARE
    job_name text;
BEGIN
    -- Generate job name for this firm
    job_name := 'firm_' || firm_id_param::text;
    
    -- Update firm record
    UPDATE firms
    SET 
        billing_active = false,
        updated_at = NOW()
    WHERE id = firm_id_param;
    
    -- Unschedule job if it exists
    IF job_exists(job_name) THEN
        PERFORM cron.unschedule(job_name);
        RETURN true;
    END IF;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reload all billing jobs
CREATE OR REPLACE FUNCTION reload_all_billing_jobs()
RETURNS jsonb AS $$
DECLARE
    job_record record;
    firm_record record;
    jobs_count integer := 0;
BEGIN
    -- First, unschedule all existing firm jobs
    FOR job_record IN 
        SELECT jobname 
        FROM cron.job 
        WHERE jobname LIKE 'firm_%'
    LOOP
        PERFORM cron.unschedule(job_record.jobname);
        jobs_count := jobs_count + 1;
    END LOOP;

    -- Then reschedule active firms
    FOR firm_record IN 
        SELECT f.*, p.id as plan_id, pm.id as payment_method_id
        FROM firms f
        JOIN plans p ON p.id = f.current_plan_id
        JOIN payment_methods pm ON pm.firm_id = f.id AND pm.is_default = true
        WHERE 
            f.billing_active = true 
            AND f.next_billing_date IS NOT NULL
            AND f.current_plan_id IS NOT NULL
    LOOP
        PERFORM schedule_next_billing(
            firm_record.id,
            firm_record.payment_method_id,
            firm_record.next_billing_date,
            firm_record.plan_id
        );
        jobs_count := jobs_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'jobs_reloaded', jobs_count
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to schedule a failed payment retry
CREATE OR REPLACE FUNCTION schedule_payment_retry(
    invoice_id_param uuid,
    payment_method_id_param uuid,
    max_retries integer DEFAULT 3
)
RETURNS boolean AS $$
DECLARE
    invoice_record record;
    retry_job_name text;
    retry_count integer;
    retry_meta jsonb;
BEGIN
    -- Get invoice details
    SELECT * INTO invoice_record
    FROM invoices
    WHERE id = invoice_id_param;
    
    IF NOT FOUND THEN
        RAISE NOTICE 'Invoice not found: %', invoice_id_param;
        RETURN false;
    END IF;
    
    -- Generate unique retry job name
    retry_job_name := 'retry_' || invoice_id_param::text;
    
    -- Get current retry count from metadata or default to 0
    retry_meta := COALESCE(invoice_record.metadata->>'retry_info', '{}'::jsonb);
    retry_count := COALESCE((retry_meta->>'attempt_count')::integer, 0);
    
    -- Check if we've exceeded max retries
    IF retry_count >= max_retries THEN
        -- Update invoice to mark as permanently failed
        UPDATE invoices
        SET 
            status = 'overdue',
            updated_at = NOW(),
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{retry_info}',
                jsonb_build_object(
                    'attempt_count', retry_count,
                    'max_retries_reached', true,
                    'last_attempt', NOW()
                )
            )
        WHERE id = invoice_id_param;
        
        -- Cancel any existing retry job
        IF job_exists(retry_job_name) THEN
            PERFORM cron.unschedule(retry_job_name);
        END IF;
        
        RAISE NOTICE 'Max retries reached for invoice %', invoice_id_param;
        RETURN false;
    END IF;
    
    -- Increment retry count
    retry_count := retry_count + 1;
    
    -- Update invoice with retry information
    UPDATE invoices
    SET 
        status = 'pending',
        updated_at = NOW(),
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{retry_info}',
            jsonb_build_object(
                'attempt_count', retry_count,
                'next_retry', NOW() + INTERVAL '1 day',
                'last_attempt', NOW(),
                'payment_method_id', payment_method_id_param
            )
        )
    WHERE id = invoice_id_param;
    
    -- Unschedule existing job if it exists
    IF job_exists(retry_job_name) THEN
        PERFORM cron.unschedule(retry_job_name);
    END IF;
    
    -- Schedule the retry job to run daily at 2 AM
    -- Cron format: minute hour day month day_of_week
    PERFORM cron.schedule(
        retry_job_name,
        '0 2 * * *', -- Run at 2:00 AM every day
        format(
            'SELECT retry_failed_payment(%L, %L)',
            invoice_id_param,
            payment_method_id_param
        )
    );
    
    RAISE NOTICE 'Scheduled retry #% for invoice % to run tomorrow at 2 AM', 
        retry_count, invoice_id_param;
    
    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to perform a payment retry
CREATE OR REPLACE FUNCTION retry_failed_payment(
    invoice_id_param uuid,
    payment_method_id_param uuid
)
RETURNS jsonb AS $$
DECLARE
    invoice_record record;
    payment_method_record record;
    firm_id_param uuid;
    transaction_reference text;
    transaction_id uuid;
    retry_meta jsonb;
    retry_count integer;
    retry_url text;
    retry_result jsonb;
    charge_response jsonb;
BEGIN
    -- Get invoice details
    SELECT * INTO invoice_record
    FROM invoices
    WHERE id = invoice_id_param;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invoice not found'
        );
    END IF;
    
    firm_id_param := invoice_record.firm_id;
    
    -- Get payment method details
    SELECT * INTO payment_method_record
    FROM payment_methods
    WHERE id = payment_method_id_param AND firm_id = firm_id_param AND is_active = true;
    
    IF NOT FOUND THEN
        -- Try to get any default payment method if the specified one doesn't exist
        SELECT * INTO payment_method_record
        FROM payment_methods
        WHERE firm_id = firm_id_param AND is_default = true AND is_active = true
        LIMIT 1;
        
        IF NOT FOUND THEN
            -- Mark retry as failed and don't schedule another retry
            UPDATE invoices
            SET 
                metadata = jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{retry_info}',
                    jsonb_build_object(
                        'attempt_count', COALESCE((metadata->'retry_info'->>'attempt_count')::integer, 1),
                        'last_attempt', NOW(),
                        'last_error', 'No active payment method found'
                    )
                )
            WHERE id = invoice_id_param;
            
            RETURN jsonb_build_object(
                'success', false,
                'error', 'No active payment method found'
            );
        END IF;
    END IF;
    
    -- Get retry information
    retry_meta := COALESCE(invoice_record.metadata->'retry_info', '{}'::jsonb);
    retry_count := COALESCE((retry_meta->>'attempt_count')::integer, 1);
    
    -- Generate unique transaction reference for this retry
    transaction_reference := 'retry-' || retry_count || '-' || invoice_id_param::text;
    
    -- Create pending transaction record for this retry
    INSERT INTO transactions (
        firm_id,
        invoice_id,
        payment_method_id,
        provider,
        type,
        status,
        amount_cents,
        currency,
        reference,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        firm_id_param,
        invoice_id_param,
        payment_method_record.id,
        payment_method_record.provider,
        'payment',
        'pending',
        invoice_record.total_cents,
        invoice_record.currency,
        transaction_reference,
        jsonb_build_object(
            'retry_attempt', retry_count,
            'invoice_number', invoice_record.invoice_number,
            'initiated_at', NOW()
        ),
        NOW(),
        NOW()
    )
    RETURNING id INTO transaction_id;
    
    -- In a real implementation, this would make an API call to charge
    -- Set URL for real payment processor API
    retry_url := 'https://yourapp.supabase.co/functions/v1/retry-charge';
    
    -- Make a real API call to retry the payment
    -- Here we're simulating with a flip of the coin (50% success chance)
    IF random() > 0.5 THEN
        -- Simulate success
        UPDATE transactions
        SET 
            status = 'success',
            processed_at = NOW(),
            updated_at = NOW(),
            metadata = jsonb_build_object(
                'retry_attempt', retry_count,
                'invoice_number', invoice_record.invoice_number,
                'processed_at', NOW(),
                'simulation', 'This is a simulated successful retry'
            )
        WHERE id = transaction_id;
        
        -- Update invoice to paid
        UPDATE invoices
        SET 
            status = 'paid',
            paid_at = NOW(),
            updated_at = NOW(),
            metadata = jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{payment_details}',
                jsonb_build_object(
                    'transaction_id', transaction_id,
                    'payment_method_id', payment_method_record.id,
                    'paid_at', NOW(),
                    'retry_attempt', retry_count,
                    'retry_success', true
                )
            )
        WHERE id = invoice_id_param;
        
        -- Remove retry schedule
        PERFORM cron.unschedule('retry_' || invoice_id_param::text);
        
        charge_response := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id,
            'invoice_id', invoice_id_param,
            'amount', invoice_record.total_cents,
            'currency', invoice_record.currency,
            'reference', transaction_reference,
            'retry_attempt', retry_count
        );
    ELSE
        -- Simulate failure
        UPDATE transactions
        SET 
            status = 'failed',
            processed_at = NOW(),
            updated_at = NOW(),
            failure_reason = 'Simulated retry failure',
            metadata = jsonb_build_object(
                'retry_attempt', retry_count,
                'invoice_number', invoice_record.invoice_number,
                'processed_at', NOW(),
                'simulation', 'This is a simulated failed retry'
            )
        WHERE id = transaction_id;
        
        -- Schedule next retry if not at max attempts yet
        PERFORM schedule_payment_retry(invoice_id_param, payment_method_record.id);
        
        charge_response := jsonb_build_object(
            'success', false,
            'transaction_id', transaction_id,
            'invoice_id', invoice_id_param,
            'retry_attempt', retry_count,
            'error', 'Simulated payment failure on retry attempt ' || retry_count
        );
    END IF;
    
    RETURN charge_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle failed payments and set up retries
CREATE OR REPLACE FUNCTION handle_payment_failure(
    invoice_id_param uuid,
    payment_method_id_param uuid,
    failure_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    retry_scheduled boolean;
BEGIN
    -- Update invoice status
    UPDATE invoices
    SET 
        status = 'pending',
        updated_at = NOW(),
        metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{payment_failure}',
            jsonb_build_object(
                'failed_at', NOW(),
                'reason', COALESCE(failure_reason, 'Payment processing failed'),
                'payment_method_id', payment_method_id_param
            )
        )
    WHERE id = invoice_id_param;
    
    -- Schedule retry
    retry_scheduled := schedule_payment_retry(invoice_id_param, payment_method_id_param);
    
    RETURN jsonb_build_object(
        'invoice_id', invoice_id_param,
        'retry_scheduled', retry_scheduled,
        'next_attempt', CASE WHEN retry_scheduled THEN NOW() + INTERVAL '1 day' ELSE NULL END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add billing cycles table if needed
CREATE TABLE IF NOT EXISTS billing_cycles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    days_interval INTEGER NOT NULL,
    description TEXT
);

-- Insert billing cycle options if table is empty
INSERT INTO billing_cycles (name, days_interval, description)
SELECT * FROM (
    VALUES 
        ('monthly', 30, 'Billed every month'),
        ('quarterly', 90, 'Billed every three months'),
        ('yearly', 365, 'Billed once per year')
) AS data(name, days_interval, description)
WHERE NOT EXISTS (SELECT 1 FROM billing_cycles);


-- Function to setup daily retry batch jobs
CREATE OR REPLACE FUNCTION setup_daily_retry_batch()
RETURNS void AS $$
BEGIN
    -- Unschedule if already exists
    IF job_exists('daily_payment_retry_batch') THEN
        PERFORM cron.unschedule('daily_payment_retry_batch');
    END IF;
    
    -- Schedule daily batch job at 3 AM to find all invoices and authorizations needing retry
    PERFORM cron.schedule(
        'daily_payment_retry_batch',
        '0 3 * * *', -- Run at 3:00 AM every day
        $batch$
        DO $do$
        DECLARE
            invoice_record record;
            auth_record record;
        BEGIN
            -- Find all pending invoices with retry_info
            FOR invoice_record IN
                SELECT i.id, i.metadata->'retry_info'->>'payment_method_id' as payment_method_id
                FROM invoices i
                WHERE 
                    i.status = 'pending' 
                    AND i.metadata ? 'retry_info'
                    AND (i.metadata->'retry_info'->>'max_retries_reached')::boolean IS NOT TRUE
            LOOP
                -- Retry each payment
                PERFORM retry_failed_payment(
                    invoice_record.id, 
                    invoice_record.payment_method_id::uuid
                );
            END LOOP;
            
            -- Find all failed payment authorizations eligible for retry
            FOR auth_record IN
                SELECT id
                FROM payment_authorizations
                WHERE 
                    status = 'failed' 
                    AND retry_scheduled = true
                    AND retry_count < max_retries
                    AND next_retry_at <= NOW()
            LOOP
                -- Retry each authorization
                PERFORM retry_failed_authorization(auth_record.id);
            END LOOP;
        END $do$;
        $batch$
    );
    
    RAISE NOTICE 'Setup daily payment retry batch job at 3 AM for both invoices and authorizations';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retry failed payment authorizations
CREATE OR REPLACE FUNCTION retry_failed_authorization(
    authorization_id_param uuid
)
RETURNS jsonb AS $$
DECLARE
    auth_record record;
    payment_method_record record;
    transaction_reference text;
    transaction_id uuid;
    charge_response jsonb;
BEGIN
    -- Get authorization details
    SELECT * INTO auth_record
    FROM payment_authorizations
    WHERE id = authorization_id_param AND status = 'failed' AND retry_count < max_retries;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authorization not found or not eligible for retry'
        );
    END IF;
    
    -- Get payment method details
    SELECT * INTO payment_method_record
    FROM payment_methods
    WHERE id = auth_record.payment_method_id AND is_active = true;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Payment method not found or not active'
        );
    END IF;
    
    -- Generate unique transaction reference for this retry
    transaction_reference := 'auth-retry-' || auth_record.retry_count + 1 || '-' || authorization_id_param::text;
    
    -- Create pending transaction record for this retry
    INSERT INTO transactions (
        firm_id,
        payment_method_id,
        payment_authorization_id,
        provider,
        type,
        status,
        amount_cents,
        currency,
        reference,
        metadata,
        created_at,
        updated_at
    ) VALUES (
        auth_record.firm_id,
        auth_record.payment_method_id,
        authorization_id_param,
        auth_record.provider,
        'payment',
        'pending',
        auth_record.amount_cents,
        auth_record.currency,
        transaction_reference,
        jsonb_build_object(
            'retry_attempt', auth_record.retry_count + 1,
            'authorization_retry', true,
            'initiated_at', NOW()
        ),
        NOW(),
        NOW()
    )
    RETURNING id INTO transaction_id;
    
    -- Simulate payment processing (50% success chance)
    IF random() > 0.5 THEN
        -- Simulate success
        UPDATE transactions
        SET 
            status = 'success',
            processed_at = NOW(),
            updated_at = NOW(),
            metadata = jsonb_build_object(
                'retry_attempt', auth_record.retry_count + 1,
                'processed_at', NOW(),
                'simulation', 'This is a simulated successful authorization retry'
            )
        WHERE id = transaction_id;
        
        -- Update authorization to authorized
        UPDATE payment_authorizations
        SET 
            status = 'authorized',
            updated_at = NOW(),
            retry_count = auth_record.retry_count + 1,
            last_retry_at = NOW(),
            retry_scheduled = false,
            next_retry_at = NULL
        WHERE id = authorization_id_param;
        
        charge_response := jsonb_build_object(
            'success', true,
            'transaction_id', transaction_id,
            'authorization_id', authorization_id_param,
            'amount', auth_record.amount_cents,
            'currency', auth_record.currency,
            'reference', transaction_reference,
            'retry_attempt', auth_record.retry_count + 1
        );
    ELSE
        -- Simulate failure
        UPDATE transactions
        SET 
            status = 'failed',
            processed_at = NOW(),
            updated_at = NOW(),
            failure_reason = 'Simulated retry failure',
            metadata = jsonb_build_object(
                'retry_attempt', auth_record.retry_count + 1,
                'processed_at', NOW(),
                'simulation', 'This is a simulated failed authorization retry'
            )
        WHERE id = transaction_id;
        
        -- Increment retry count and schedule next retry if under max_retries
        UPDATE payment_authorizations
        SET 
            retry_count = auth_record.retry_count + 1,
            last_retry_at = NOW(),
            next_retry_at = CASE 
                WHEN auth_record.retry_count + 1 < max_retries THEN NOW() + INTERVAL '1 day'
                ELSE NULL 
            END,
            retry_scheduled = auth_record.retry_count + 1 < max_retries,
            status = CASE 
                WHEN auth_record.retry_count + 1 >= max_retries THEN 'expired'
                ELSE 'failed'
            END,
            updated_at = NOW()
        WHERE id = authorization_id_param;
        
        charge_response := jsonb_build_object(
            'success', false,
            'transaction_id', transaction_id,
            'authorization_id', authorization_id_param,
            'retry_attempt', auth_record.retry_count + 1,
            'error', 'Simulated authorization failure on retry attempt ' || (auth_record.retry_count + 1)
        );
    END IF;
    
    RETURN charge_response;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle authorization failure
CREATE OR REPLACE FUNCTION handle_authorization_failure(
    authorization_id_param uuid,
    failure_reason text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
    auth_record record;
BEGIN
    -- Get authorization details
    SELECT * INTO auth_record
    FROM payment_authorizations
    WHERE id = authorization_id_param;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Authorization not found'
        );
    END IF;
    
    -- Update authorization status and schedule retry
    UPDATE payment_authorizations
    SET 
        status = 'failed',
        retry_count = COALESCE(retry_count, 0),
        last_retry_at = NOW(),
        next_retry_at = NOW() + INTERVAL '1 day',
        retry_scheduled = true,
        failure_reason = COALESCE(failure_reason, 'Authorization processing failed'),
        updated_at = NOW()
    WHERE id = authorization_id_param;
    
    -- Also update firm record to track payment failures
    UPDATE firms
    SET
        payment_failed = true,
        payment_failed_at = NOW(),
        updated_at = NOW()
    WHERE id = auth_record.firm_id;
    
    RETURN jsonb_build_object(
        'authorization_id', authorization_id_param,
        'retry_scheduled', true,
        'next_attempt', NOW() + INTERVAL '1 day'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke public access to these functions
REVOKE ALL ON FUNCTION job_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION schedule_next_billing(uuid, uuid, timestamptz, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_invoice_for_firm(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION auto_charge_payment_method(uuid, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION process_recurring_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION cancel_firm_billing(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION reload_all_billing_jobs() FROM PUBLIC;
REVOKE ALL ON FUNCTION schedule_payment_retry(uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION retry_failed_payment(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_payment_failure(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION setup_daily_retry_batch() FROM PUBLIC;
REVOKE ALL ON FUNCTION retry_failed_authorization(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION handle_authorization_failure(uuid, text) FROM PUBLIC;

-- Grant access to authenticated users for specific functions
GRANT EXECUTE ON FUNCTION cancel_firm_billing(uuid) TO authenticated;

-- Service functions should only be accessible by service role
GRANT EXECUTE ON FUNCTION schedule_next_billing(uuid, uuid, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION process_recurring_billing(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION generate_invoice_for_firm(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION schedule_payment_retry(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION retry_failed_payment(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION handle_payment_failure(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION retry_failed_authorization(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION handle_authorization_failure(uuid, text) TO service_role;

-- Setup daily retry batch job
SELECT setup_daily_retry_batch();

-- Initial load of billing jobs (commented out for safety)
-- SELECT reload_all_billing_jobs();