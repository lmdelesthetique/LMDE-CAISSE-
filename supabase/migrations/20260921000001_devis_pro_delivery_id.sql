-- Add delivery_id to devis_pro to link back to the deliveries table
ALTER TABLE public.devis_pro
  ADD COLUMN IF NOT EXISTS delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL;
