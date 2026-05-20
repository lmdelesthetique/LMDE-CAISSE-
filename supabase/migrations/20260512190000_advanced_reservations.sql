-- Advanced Reservations: tags, recovery mode, delivery info, deposit percent, variant info
-- Migration: 20260512190000_advanced_reservations.sql

-- Add new columns to reservations table
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS reservation_type TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recovery_mode TEXT DEFAULT 'sur_place',
  ADD COLUMN IF NOT EXISTS delivery_address TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_phone TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_contact TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS seller_comment TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS client_comment TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS estimated_arrival_date DATE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deposit_percent INTEGER DEFAULT NULL;

-- Index for filtering by type and recovery mode
CREATE INDEX IF NOT EXISTS idx_reservations_type ON public.reservations(reservation_type);
CREATE INDEX IF NOT EXISTS idx_reservations_recovery_mode ON public.reservations(recovery_mode);
