-- Add client portal fields to devis_pro
ALTER TABLE public.devis_pro
  ADD COLUMN IF NOT EXISTS client_token       TEXT,
  ADD COLUMN IF NOT EXISTS client_response    TEXT,
  ADD COLUMN IF NOT EXISTS client_responded_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_devis_pro_client_token
  ON public.devis_pro (client_token)
  WHERE client_token IS NOT NULL;
