-- Run this once in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- Adds missing columns for Devis PRO functionality

ALTER TABLE public.client_pro_profiles
  ADD COLUMN IF NOT EXISTS produits_reassort jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS devis_history     jsonb DEFAULT '[]'::jsonb;
