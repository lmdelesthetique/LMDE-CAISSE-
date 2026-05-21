-- ============================================================
-- SUPPLIER PORTAL COMMUNICATION SYSTEM
-- 1. supplier_response on fo_orders
-- 2. supplier_message_threads table (was missing)
-- 3. sender_type + thread_id on supplier_messages + sync trigger
-- 4. Updated/new SECURITY DEFINER functions
-- ============================================================

-- 1. Add supplier_response to fo_orders (supplier_comment already exists)
ALTER TABLE public.fo_orders
  ADD COLUMN IF NOT EXISTS supplier_response TEXT DEFAULT 'pending'
    CHECK (supplier_response IN ('pending', 'accepted', 'refused'));

-- 2. Create supplier_message_threads (was referenced in RPCs but never created)
CREATE TABLE IF NOT EXISTS public.supplier_message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  subject TEXT NOT NULL DEFAULT 'Messagerie principale',
  order_id UUID REFERENCES public.fo_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_smt_supplier_id ON public.supplier_message_threads(supplier_id);
CREATE INDEX IF NOT EXISTS idx_smt_updated_at ON public.supplier_message_threads(updated_at DESC);

ALTER TABLE public.supplier_message_threads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "smt_open_access" ON public.supplier_message_threads;
CREATE POLICY "smt_open_access" ON public.supplier_message_threads FOR ALL USING (true) WITH CHECK (true);

-- 3. Add sender_type and thread_id to supplier_messages
ALTER TABLE public.supplier_messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT,
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.supplier_message_threads(id) ON DELETE SET NULL;

-- 4. Sync existing rows: sender ('store'|'supplier') → sender_type ('admin'|'supplier')
UPDATE public.supplier_messages
  SET sender_type = CASE WHEN sender::text = 'store' THEN 'admin' ELSE 'supplier' END
  WHERE sender_type IS NULL;

-- 5. Trigger to auto-sync sender → sender_type on future inserts (MessagingPanel compat)
CREATE OR REPLACE FUNCTION public.sync_message_sender_type()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.sender_type IS NULL AND NEW.sender IS NOT NULL THEN
    NEW.sender_type := CASE WHEN NEW.sender::text = 'store' THEN 'admin' ELSE 'supplier' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sender_type ON public.supplier_messages;
CREATE TRIGGER trg_sync_sender_type
  BEFORE INSERT OR UPDATE ON public.supplier_messages
  FOR EACH ROW EXECUTE FUNCTION public.sync_message_sender_type();

-- ============================================================
-- UPDATED get_supplier_portal_orders (adds response + payment fields)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_supplier_portal_orders(p_supplier_id UUID)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  created_at TIMESTAMPTZ,
  total_real_cost NUMERIC,
  order_status TEXT,
  notes TEXT,
  supplier_response TEXT,
  supplier_comment TEXT,
  payment_status TEXT,
  payment_amount NUMERIC,
  subtotal NUMERIC,
  transport_cost NUMERIC,
  customs_cost NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fo.id,
    fo.order_number,
    fo.created_at,
    fo.total_real_cost,
    fo.order_status::TEXT,
    fo.notes,
    COALESCE(fo.supplier_response, 'pending'),
    fo.supplier_comment,
    fo.payment_status::TEXT,
    fo.payment_amount,
    fo.subtotal,
    fo.transport_cost,
    fo.customs_cost
  FROM public.fo_orders fo
  WHERE fo.supplier_id = p_supplier_id
  ORDER BY fo.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_portal_orders(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_portal_orders(UUID) TO authenticated;

-- ============================================================
-- NEW: get_supplier_portal_order_lines — order lines with product photos
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_supplier_portal_order_lines(
  p_order_id UUID,
  p_supplier_id UUID
)
RETURNS SETOF json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id',               ol.id,
    'product_id',       ol.product_id,
    'product_name',     ol.product_name,
    'product_ref',      ol.product_ref,
    'product_image_url', COALESCE(NULLIF(ol.product_image_url, ''), p.image_url),
    'variant',          ol.variant,
    'color',            ol.color,
    'qty_ordered',      ol.qty_ordered,
    'qty_received',     ol.qty_received,
    'unit_price',       ol.unit_price,
    'line_total',       ol.line_total,
    'note',             ol.note
  )
  FROM public.fo_order_lines ol
  LEFT JOIN public.products p ON p.id = ol.product_id
  WHERE ol.order_id = p_order_id
    AND EXISTS (
      SELECT 1 FROM public.fo_orders fo
      WHERE fo.id = p_order_id AND fo.supplier_id = p_supplier_id
    )
  ORDER BY ol.created_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_portal_order_lines(UUID, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_portal_order_lines(UUID, UUID) TO authenticated;

-- ============================================================
-- NEW: supplier_respond_to_order — accept or refuse an order
-- ============================================================
CREATE OR REPLACE FUNCTION public.supplier_respond_to_order(
  p_order_id    UUID,
  p_supplier_id UUID,
  p_response    TEXT,
  p_comment     TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.fo_orders
  SET
    supplier_response  = p_response,
    supplier_comment   = p_comment,
    supplier_validated = (p_response = 'accepted'),
    updated_at         = now()
  WHERE id = p_order_id
    AND supplier_id = p_supplier_id;
$$;

GRANT EXECUTE ON FUNCTION public.supplier_respond_to_order(UUID, UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.supplier_respond_to_order(UUID, UUID, TEXT, TEXT) TO authenticated;

-- ============================================================
-- NEW: get_all_supplier_messages — simple flat list, no threads needed
-- Used by supplier portal chat (sees same data as admin MessagingPanel)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_all_supplier_messages(p_supplier_id UUID)
RETURNS TABLE (
  id UUID,
  created_at TIMESTAMPTZ,
  content TEXT,
  sender_type TEXT,
  is_read BOOLEAN,
  order_id UUID,
  order_number TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    sm.id,
    sm.created_at,
    sm.content,
    COALESCE(sm.sender_type, CASE WHEN sm.sender::text = 'store' THEN 'admin' ELSE 'supplier' END),
    sm.is_read,
    sm.order_id,
    fo.order_number
  FROM public.supplier_messages sm
  LEFT JOIN public.fo_orders fo ON fo.id = sm.order_id
  WHERE sm.supplier_id = p_supplier_id
  ORDER BY sm.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_supplier_messages(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_all_supplier_messages(UUID) TO authenticated;

-- ============================================================
-- NEW: send_supplier_portal_message — supplier sends a chat message
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_supplier_portal_message(
  p_supplier_id UUID,
  p_content     TEXT,
  p_order_id    UUID DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.supplier_messages
    (supplier_id, content, sender_type, sender, is_read, order_id)
  VALUES
    (p_supplier_id, p_content, 'supplier', 'supplier', false, p_order_id);
$$;

GRANT EXECUTE ON FUNCTION public.send_supplier_portal_message(UUID, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.send_supplier_portal_message(UUID, TEXT, UUID) TO authenticated;

-- ============================================================
-- NEW: mark_all_supplier_messages_read — mark admin messages as read
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_all_supplier_messages_read(p_supplier_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.supplier_messages
  SET is_read = true
  WHERE supplier_id = p_supplier_id
    AND sender_type = 'admin'
    AND is_read = false;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_supplier_messages_read(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_all_supplier_messages_read(UUID) TO authenticated;

-- ============================================================
-- UPDATED get_supplier_portal_threads — now auto-creates default thread
-- and maps sender correctly (backwards compat for any existing thread users)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_supplier_portal_threads(p_supplier_id UUID)
RETURNS SETOF json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id UUID;
BEGIN
  SELECT id INTO v_thread_id
  FROM public.supplier_message_threads
  WHERE supplier_id = p_supplier_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_thread_id IS NULL THEN
    INSERT INTO public.supplier_message_threads (supplier_id, subject)
    VALUES (p_supplier_id, 'Messagerie principale')
    RETURNING id INTO v_thread_id;
  END IF;

  RETURN QUERY
  SELECT json_build_object(
    'id', t.id,
    'subject', t.subject,
    'updated_at', t.updated_at,
    'messages', COALESCE(
      (SELECT json_agg(json_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'content', m.content,
        'sender_type', COALESCE(m.sender_type, CASE WHEN m.sender::text = 'store' THEN 'admin' ELSE 'supplier' END),
        'is_read', m.is_read
      ) ORDER BY m.created_at ASC)
      FROM public.supplier_messages m WHERE m.thread_id = t.id),
      '[]'::json
    )
  )
  FROM public.supplier_message_threads t
  WHERE t.supplier_id = p_supplier_id
  ORDER BY t.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_portal_threads(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_portal_threads(UUID) TO authenticated;
