-- StorNxtDoor Dummy Data

-- Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Variables (change as needed)
DO $$
DECLARE
    now_timestamp TIMESTAMP := NOW();
    host_id UUID = 'cb991acc-d525-446c-8a3f-73379e588387';
    space_id UUID;
    space_option_id UUID;
    user_id UUID;
    profile_id UUID = '41b83fde-a5b7-4cb1-bab4-c6d8e124fc87';
    booking_id UUID;
    transaction_id UUID;
    payment_method_id UUID;
BEGIN



-- Create payment method for host
INSERT INTO billing_payment_methods (
    id, host_id, provider, provider_payment_method_id, 
    payment_type, is_default, billing_details
)
VALUES (
    gen_random_uuid(), host_id, 'stripe', 'pm_' || floor(random() * 1000000)::text,
    'bank_account', true, 
    jsonb_build_object(
        'bank_name', 'First National Bank',
        'account_number', '********1234',
        'account_type', 'Business'
    )
)
RETURNING id INTO payment_method_id;

-- Create spaces
INSERT INTO spaces (
    id, host_id, name, slug, description, address, city, state, postal_code, country,
    space_type, amenities, climate_controlled, security_features, access_hours, status,
    lat, long, created_at, updated_at
)
VALUES
(
    gen_random_uuid(), host_id, 'Central Cape Town Storage', 'central-cape-town', 
    'Convenient storage facility in the heart of Cape Town with 24/7 access and security.',
    '42 Long Street', 'Cape Town', 'Western Cape', '8001', 'South Africa',
    'storage_room', 
    jsonb_build_object(
        'parking', true, 
        'loading_dock', true, 
        'elevators', true, 
        'restrooms', true, 
        'wifi', false
    ),
    true, 
    ARRAY['security_cameras', 'alarm_system', 'gated_access', 'on_site_staff'],
    jsonb_build_object(
        'monday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'tuesday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'wednesday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'thursday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'friday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'saturday', jsonb_build_object('open', '00:00', 'close', '23:59'),
        'sunday', jsonb_build_object('open', '00:00', 'close', '23:59')
    ),
    'active',
    -33.9249, 18.4241,
    now_timestamp, now_timestamp
)
RETURNING id INTO space_id;

-- Add space images
INSERT INTO space_images (
    id, space_id, public_url, file_path, alt_text, caption, display_order, created_at
)
VALUES
(
    gen_random_uuid(), space_id, 
    'https://images.unsplash.com/photo-1545558014-8692077e9b5c?ixlib=rb-4.0.3',
    'storage/space-images/unit1.jpg',
    'Clean storage unit with roll-up door', 
    'Our standard storage unit with easy access',
    0, 
    now_timestamp
),
(
    gen_random_uuid(), space_id, 
    'https://images.unsplash.com/photo-1581141234794-2103a3e8ed8e?ixlib=rb-4.0.3',
    'storage/space-images/facility.jpg',
    'Facility exterior', 
    'Our secure facility with modern security features',
    1, 
    now_timestamp
),
(
    gen_random_uuid(), space_id, 
    'https://images.unsplash.com/photo-1618248945468-e07f3e70de6a?ixlib=rb-4.0.3',
    'storage/space-images/interior.jpg',
    'Interior hallway with storage units', 
    'Clean, well-lit interior hallways',
    2, 
    now_timestamp
);

-- Create space options
INSERT INTO space_options (
    id, space_id, name, description, size_sqm, max_height_cm, price_per_day, 
    price_per_week, price_per_month, security_deposit_amount, status
)
VALUES
(
    gen_random_uuid(), space_id, 'Small Unit', 
    'Perfect for personal items, seasonal decorations, or small furniture pieces.',
    5, 230, 120, 700, 2500, 1000, 'available'
),
(
    gen_random_uuid(), space_id, 'Medium Unit', 
    'Ideal for contents of a 1-bedroom apartment or home office equipment.',
    10, 250, 180, 1000, 3600, 1500, 'available'
),
(
    gen_random_uuid(), space_id, 'Large Unit', 
    'Spacious storage for furniture from a 2-3 bedroom house or business inventory.',
    15, 300, 240, 1500, 5400, 2000, 'occupied'
);

-- Get the Large Unit ID for the booking
EXECUTE format('
  SELECT id FROM space_options 
  WHERE space_id = %L AND name = %L AND status = %L
  LIMIT 1
', space_id, 'Large Unit', 'occupied')
INTO space_option_id;

-- Create booking for the large unit
INSERT INTO bookings (
    id, space_option_id, renter_id, start_date, end_date, 
    total_price, status, payment_status, created_at, updated_at
)
VALUES (
    gen_random_uuid(), space_option_id, profile_id,
    now_timestamp, now_timestamp + INTERVAL '30 days',
    5400, 'confirmed', 'paid', now_timestamp, now_timestamp
)
RETURNING id INTO booking_id;

-- Create billing transaction
INSERT INTO billing_transactions (
    id, booking_id, host_id, payment_method_id, amount_cents, 
    platform_fee_percentage, platform_fee_cents, host_payout_cents, 
    currency, status, provider, provider_transaction_id, reference, 
    description, payout_status, created_at, updated_at
)
VALUES
(
    gen_random_uuid(), booking_id, host_id, payment_method_id,
    540000, 10.00, 54000, 486000,
    'ZAR', 'success', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Monthly payment for Large Storage Unit',
    'paid', now_timestamp - INTERVAL '5 days', now_timestamp - INTERVAL '5 days'
)
RETURNING id INTO transaction_id;

-- Create deposit transaction
INSERT INTO billing_transactions (
    id, booking_id, host_id, payment_method_id, amount_cents, 
    platform_fee_percentage, platform_fee_cents, host_payout_cents, 
    currency, status, provider, provider_transaction_id, reference, 
    description, payout_status, created_at, updated_at
)
VALUES
(
    gen_random_uuid(), booking_id, host_id, payment_method_id,
    200000, 10.00, 20000, 180000,
    'ZAR', 'success', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Security deposit for Large Storage Unit',
    'paid', now_timestamp - INTERVAL '30 days', now_timestamp - INTERVAL '30 days'
);

-- Create review
INSERT INTO reviews (
    booking_id, reviewer_id, rating, comment, created_at, updated_at
)
VALUES (
    booking_id, profile_id, 4.5, 
    'Great storage space, clean and secure. The staff was helpful and the location is convenient.',
    now_timestamp - INTERVAL '15 days', now_timestamp - INTERVAL '15 days'
);

-- Create message
INSERT INTO messages (
    booking_id, sender_id, receiver_id, content, created_at, read_at
)
VALUES (
    booking_id, profile_id, profile_id, 
    'Hello, I was wondering if I could access my storage unit after hours tomorrow?',
    now_timestamp - INTERVAL '10 days', now_timestamp - INTERVAL '10 days'
);

-- Create additional spaces
INSERT INTO spaces (
    id, host_id, name, slug, description, address, city, state, postal_code, country,
    space_type, amenities, climate_controlled, security_features, access_hours, status,
    lat, long, created_at, updated_at
)
VALUES
(
    gen_random_uuid(), host_id, 'Johannesburg Secure Storage', 'joburg-secure-storage', 
    'Secure and modern storage facility in Johannesburg with climate control.',
    '123 Main Road', 'Johannesburg', 'Gauteng', '2000', 'South Africa',
    'warehouse', 
    jsonb_build_object(
        'parking', true, 
        'loading_dock', true, 
        'elevators', true, 
        'restrooms', true, 
        'wifi', true
    ),
    true, 
    ARRAY['security_cameras', 'alarm_system', 'gated_access', 'on_site_staff', '24hr_monitoring'],
    jsonb_build_object(
        'monday', jsonb_build_object('open', '06:00', 'close', '22:00'),
        'tuesday', jsonb_build_object('open', '06:00', 'close', '22:00'),
        'wednesday', jsonb_build_object('open', '06:00', 'close', '22:00'),
        'thursday', jsonb_build_object('open', '06:00', 'close', '22:00'),
        'friday', jsonb_build_object('open', '06:00', 'close', '22:00'),
        'saturday', jsonb_build_object('open', '08:00', 'close', '20:00'),
        'sunday', jsonb_build_object('open', '08:00', 'close', '18:00')
    ),
    'active',
    -26.2041, 28.0473,
    now_timestamp, now_timestamp
);

-- Add more dummy transactions
INSERT INTO billing_transactions (
    booking_id, host_id, payment_method_id, amount_cents, 
    platform_fee_percentage, platform_fee_cents, host_payout_cents, 
    currency, status, provider, provider_transaction_id, reference, 
    description, payout_status, created_at, updated_at
)
VALUES
(
    booking_id, host_id, payment_method_id,
    360000, 10.00, 36000, 324000,
    'ZAR', 'success', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Monthly payment for Medium Storage Unit',
    'paid', now_timestamp - INTERVAL '2 days', now_timestamp - INTERVAL '2 days'
),
(
    booking_id, host_id, payment_method_id,
    360000, 10.00, 36000, 324000,
    'ZAR', 'success', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Monthly payment for Medium Storage Unit',
    'paid', now_timestamp - INTERVAL '32 days', now_timestamp - INTERVAL '32 days'
),
(
    booking_id, host_id, payment_method_id,
    250000, 10.00, 25000, 225000,
    'ZAR', 'success', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Monthly payment for Small Storage Unit',
    'paid', now_timestamp - INTERVAL '15 days', now_timestamp - INTERVAL '15 days'
),
(
    booking_id, host_id, payment_method_id,
    150000, 10.00, 15000, 135000,
    'ZAR', 'pending', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Weekly payment for Large Storage Unit',
    'pending', now_timestamp - INTERVAL '1 day', now_timestamp - INTERVAL '1 day'
),
(
    booking_id, host_id, payment_method_id,
    250000, 10.00, 25000, 225000,
    'ZAR', 'failed', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Monthly payment for Small Storage Unit',
    'failed', now_timestamp - INTERVAL '10 days', now_timestamp - INTERVAL '10 days'
),
(
    booking_id, host_id, payment_method_id,
    100000, 10.00, 10000, 90000,
    'ZAR', 'refunded', 'stripe', 'txn_' || floor(random() * 1000000)::text,
    'TXNZAR' || floor(random() * 1000000)::text,
    'Partial payment for Medium Storage Unit',
    'paid', now_timestamp - INTERVAL '45 days', now_timestamp - INTERVAL '45 days'
);

-- Create damage claim
INSERT INTO damage_claims (
    booking_id, reported_by_id, amount, description, status, 
    evidence_urls, created_at, updated_at
)
VALUES (
    booking_id, profile_id, 500.00,
    'Scratch marks on the wall of the storage unit and broken door handle',
    'pending',
    ARRAY['https://example.com/evidence1.jpg', 'https://example.com/evidence2.jpg'],
    now_timestamp - INTERVAL '3 days', now_timestamp - INTERVAL '3 days'
);

END $$;

-- Instructions to use:
-- 1. Run this script against your Supabase PostgreSQL database
-- 2. The script will create:
--    - 1 profile
--    - 1 host with owner membership
--    - 2 spaces with different types and features
--    - 3 space options (small, medium, large)
--    - 1 booking for the large unit
--    - 8 billing transactions with various statuses
--    - 1 review
--    - 1 message
--    - 1 damage claim
-- 3. All dummy data uses South African Rand (ZAR) currency
-- 4. To delete all dummy data, run:
--    DELETE FROM damage_claims WHERE booking_id IN (SELECT id FROM bookings WHERE renter_id IN (SELECT id FROM profiles WHERE email = 'renter@example.com'));
--    DELETE FROM messages WHERE booking_id IN (SELECT id FROM bookings WHERE renter_id IN (SELECT id FROM profiles WHERE email = 'renter@example.com'));
--    DELETE FROM reviews WHERE booking_id IN (SELECT id FROM bookings WHERE renter_id IN (SELECT id FROM profiles WHERE email = 'renter@example.com'));
--    DELETE FROM billing_transactions WHERE booking_id IN (SELECT id FROM bookings WHERE renter_id IN (SELECT id FROM profiles WHERE email = 'renter@example.com'));
--    DELETE FROM bookings WHERE renter_id IN (SELECT id FROM profiles WHERE email = 'renter@example.com');
--    DELETE FROM space_options WHERE space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM hosts WHERE slug = 'prime-storage'));
--    DELETE FROM space_images WHERE space_id IN (SELECT id FROM spaces WHERE host_id IN (SELECT id FROM hosts WHERE slug = 'prime-storage'));
--    DELETE FROM spaces WHERE host_id IN (SELECT id FROM hosts WHERE slug = 'prime-storage');
--    DELETE FROM billing_payment_methods WHERE host_id IN (SELECT id FROM hosts WHERE slug = 'prime-storage');
--    DELETE FROM host_members WHERE host_id IN (SELECT id FROM hosts WHERE slug = 'prime-storage');
--    DELETE FROM hosts WHERE slug = 'prime-storage';
--    DELETE FROM profiles WHERE email = 'renter@example.com';
