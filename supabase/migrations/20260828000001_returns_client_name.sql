-- Add client_name text column to returns so the name persists even without a client_id link
ALTER TABLE public.returns
  ADD COLUMN IF NOT EXISTS client_name TEXT DEFAULT NULL;

-- Backfill from the clients join for existing rows that have client_id
UPDATE public.returns r
SET client_name = c.first_name || ' ' || c.last_name
FROM public.clients c
WHERE r.client_id = c.id
  AND r.client_name IS NULL;
