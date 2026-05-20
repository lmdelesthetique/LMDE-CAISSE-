-- ============================================================
-- SUPPLIER INBOX — BeautyPOS
-- RLS policies so supplier portal users can access fo_orders
-- and fo_order_lines for their own supplier
-- ============================================================

-- Helper function: get supplier_id for the authenticated portal user
CREATE OR REPLACE FUNCTION public.get_portal_supplier_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT spu.supplier_id
  FROM public.supplier_portal_users spu
  WHERE spu.auth_user_id = auth.uid()
    AND spu.is_active = true
  LIMIT 1;
$$;

-- ─── fo_orders: supplier portal read + limited update ────────────────────────

DROP POLICY IF EXISTS "supplier_portal_read_own_fo_orders" ON public.fo_orders;
CREATE POLICY "supplier_portal_read_own_fo_orders"
ON public.fo_orders
FOR SELECT
TO authenticated
USING (supplier_id = public.get_portal_supplier_id());

DROP POLICY IF EXISTS "supplier_portal_update_own_fo_orders" ON public.fo_orders;
CREATE POLICY "supplier_portal_update_own_fo_orders"
ON public.fo_orders
FOR UPDATE
TO authenticated
USING (supplier_id = public.get_portal_supplier_id())
WITH CHECK (supplier_id = public.get_portal_supplier_id());

-- ─── fo_order_lines: supplier portal read ────────────────────────────────────

DROP POLICY IF EXISTS "supplier_portal_read_fo_order_lines" ON public.fo_order_lines;
CREATE POLICY "supplier_portal_read_fo_order_lines"
ON public.fo_order_lines
FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.fo_orders
    WHERE supplier_id = public.get_portal_supplier_id()
  )
);

-- ─── fo_order_status_history: supplier portal read ───────────────────────────

DROP POLICY IF EXISTS "supplier_portal_read_fo_order_status_history" ON public.fo_order_status_history;
CREATE POLICY "supplier_portal_read_fo_order_status_history"
ON public.fo_order_status_history
FOR SELECT
TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.fo_orders
    WHERE supplier_id = public.get_portal_supplier_id()
  )
);

DROP POLICY IF EXISTS "supplier_portal_insert_fo_order_status_history" ON public.fo_order_status_history;
CREATE POLICY "supplier_portal_insert_fo_order_status_history"
ON public.fo_order_status_history
FOR INSERT
TO authenticated
WITH CHECK (
  order_id IN (
    SELECT id FROM public.fo_orders
    WHERE supplier_id = public.get_portal_supplier_id()
  )
);
