-- Add payment failure tracking columns to firms table
ALTER TABLE firms 
ADD COLUMN IF NOT EXISTS payment_failed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_failed_at TIMESTAMP WITH TIME ZONE;

-- Add comment explaining the purpose of these columns
COMMENT ON COLUMN firms.payment_failed IS 'Indicates if the firm has a failed payment';
COMMENT ON COLUMN firms.payment_failed_at IS 'Timestamp when the most recent payment failed'; 