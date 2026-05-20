-- ============================================================
-- Migration: Enhanced messaging + portal sync
-- ============================================================

-- Add missing columns to supplier_messages if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'attachment_url') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN attachment_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'attachment_type') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN attachment_type TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'attachment_name') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN attachment_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'message_type') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'photo', 'pdf', 'payment_proof', 'claim', 'order_modification', 'other'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'is_read') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'order_id') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN order_id UUID REFERENCES public.fo_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'supplier_messages' AND column_name = 'product_id') THEN
    ALTER TABLE public.supplier_messages ADD COLUMN product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add payment sync columns to fo_orders if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_orders' AND column_name = 'payment_amount') THEN
    ALTER TABLE public.fo_orders ADD COLUMN payment_amount NUMERIC(12,2) DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_orders' AND column_name = 'payment_date') THEN
    ALTER TABLE public.fo_orders ADD COLUMN payment_date DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_orders' AND column_name = 'payment_method') THEN
    ALTER TABLE public.fo_orders ADD COLUMN payment_method TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_orders' AND column_name = 'payment_status') THEN
    ALTER TABLE public.fo_orders ADD COLUMN payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'overdue'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_orders' AND column_name = 'payment_proof_url') THEN
    ALTER TABLE public.fo_orders ADD COLUMN payment_proof_url TEXT;
  END IF;
END $$;

-- Add product image to fo_order_lines if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_order_lines' AND column_name = 'product_image_url') THEN
    ALTER TABLE public.fo_order_lines ADD COLUMN product_image_url TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fo_order_lines' AND column_name = 'variant') THEN
    ALTER TABLE public.fo_order_lines ADD COLUMN variant TEXT;
  END IF;
END $$;

-- Create index for faster message queries
CREATE INDEX IF NOT EXISTS idx_supplier_messages_supplier_id ON public.supplier_messages(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_order_id ON public.supplier_messages(order_id);
CREATE INDEX IF NOT EXISTS idx_supplier_messages_created_at ON public.supplier_messages(created_at DESC);

-- RLS policies for supplier_messages (ensure they exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'supplier_messages' AND policyname = 'supplier_messages_all_access'
  ) THEN
    ALTER TABLE public.supplier_messages ENABLE ROW LEVEL SECURITY;
    CREATE POLICY supplier_messages_all_access ON public.supplier_messages FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
