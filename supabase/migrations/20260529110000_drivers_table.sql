-- Standalone drivers table (independent from employees)
CREATE TABLE IF NOT EXISTS drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  pin_code TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  driver_status TEXT DEFAULT 'off',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE drivers DISABLE ROW LEVEL SECURITY;

-- Swap deliveries.assigned_to → assigned_to_driver referencing drivers
ALTER TABLE deliveries
DROP COLUMN IF EXISTS assigned_to;

ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS assigned_to_driver UUID REFERENCES drivers(id);

CREATE INDEX IF NOT EXISTS idx_deliveries_assigned_to_driver ON deliveries(assigned_to_driver);
