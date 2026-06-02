-- Add arrived_at timestamp for the new 'arrived' workflow step
-- (driver marks arrival before confirming delivery)
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
