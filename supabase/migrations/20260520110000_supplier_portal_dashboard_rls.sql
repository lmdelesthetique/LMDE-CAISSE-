-- ============================================================
-- SUPPLIER PORTAL DASHBOARD — SECURITY DEFINER functions
-- Allows PIN-authenticated (anon) suppliers to read their own data
-- without being blocked by authenticated-only RLS policies
-- ============================================================

-- Orders: returns fo_orders for a given supplier_id
CREATE OR REPLACE FUNCTION public.get_supplier_portal_orders(p_supplier_id UUID)
RETURNS TABLE (
  id UUID,
  order_number TEXT,
  created_at TIMESTAMPTZ,
  total_real_cost NUMERIC,
  order_status TEXT,
  notes TEXT
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
    fo.notes
  FROM public.fo_orders fo
  WHERE fo.supplier_id = p_supplier_id
  ORDER BY fo.created_at DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_portal_orders(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_portal_orders(UUID) TO authenticated;

-- Message threads: returns threads + messages for a given supplier_id
CREATE OR REPLACE FUNCTION public.get_supplier_portal_threads(p_supplier_id UUID)
RETURNS SETOF json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', t.id,
    'subject', t.subject,
    'updated_at', t.updated_at,
    'messages', COALESCE(
      (SELECT json_agg(json_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'content', m.content,
        'sender_type', m.sender_type,
        'is_read', m.is_read
      ) ORDER BY m.created_at ASC)
      FROM public.supplier_messages m WHERE m.thread_id = t.id),
      '[]'::json
    )
  )
  FROM public.supplier_message_threads t
  WHERE t.supplier_id = p_supplier_id
  ORDER BY t.updated_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_supplier_portal_threads(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_supplier_portal_threads(UUID) TO authenticated;

-- Mark messages as read for a given thread (supplier side)
CREATE OR REPLACE FUNCTION public.mark_supplier_thread_read(p_thread_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.supplier_messages
  SET is_read = true
  WHERE thread_id = p_thread_id
    AND sender_type = 'admin'
    AND is_read = false;
$$;

GRANT EXECUTE ON FUNCTION public.mark_supplier_thread_read(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.mark_supplier_thread_read(UUID) TO authenticated;

-- Insert supplier message (bypasses RLS for PIN-auth suppliers)
CREATE OR REPLACE FUNCTION public.insert_supplier_message(
  p_thread_id UUID,
  p_supplier_id UUID,
  p_content TEXT
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.supplier_messages (thread_id, supplier_id, content, sender_type, is_read)
  VALUES (p_thread_id, p_supplier_id, p_content, 'supplier', false);

  UPDATE public.supplier_message_threads
  SET updated_at = now()
  WHERE id = p_thread_id;
$$;

GRANT EXECUTE ON FUNCTION public.insert_supplier_message(UUID, UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.insert_supplier_message(UUID, UUID, TEXT) TO authenticated;
