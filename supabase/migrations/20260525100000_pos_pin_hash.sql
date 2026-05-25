-- Add POS PIN hash column to app_settings
-- Stores SHA-256 hex hash of the 6-digit caisse PIN
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS pos_pin_hash TEXT DEFAULT NULL;
