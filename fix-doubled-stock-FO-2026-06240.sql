-- ============================================================
-- FIX: Reverse doubled stock application for order FO-2026-06240
-- Run in Supabase SQL Editor
--
-- INSTRUCTIONS:
--   1. Run the verification SELECT at the bottom FIRST
--   2. Review "stock_apres_correction" — confirm it looks right
--   3. Then run the full script (BEGIN … COMMIT block)
-- ============================================================


-- ══════════════════════════════════════════════════════════════
-- STEP 0 — VERIFY BEFORE RUNNING (run this SELECT first)
-- Shows current state and what would change
-- ══════════════════════════════════════════════════════════════

SELECT
  fol.product_name,
  fol.product_ref,
  COALESCE(fol.color, '— (sans variante)') AS couleur,
  fol.qty_ordered                           AS qte_commandee,

  -- Current state
  p.stock                                   AS stock_produit_actuel,
  pcs.quantity                              AS stock_variante_actuel,

  -- What the fix would produce
  CASE
    WHEN fol.color IS NOT NULL AND fol.color <> '' AND pcs.id IS NOT NULL
      THEN
        CASE WHEN pcs.quantity >= fol.qty_ordered * 2
          THEN pcs.quantity - fol.qty_ordered
          ELSE pcs.quantity  -- safety skipped
        END
    ELSE NULL
  END AS stock_variante_apres_correction,

  CASE
    WHEN fol.color IS NOT NULL AND fol.color <> '' AND pcs.id IS NOT NULL
      THEN 'product_color_stock'
    WHEN (fol.color IS NULL OR fol.color = '') AND p.stock >= fol.qty_ordered * 2
      THEN 'products.stock direct'
    WHEN (fol.color IS NULL OR fol.color = '')
      THEN 'SKIP (stock < qty*2 — safety)'
    ELSE 'variante non trouvée — vérifier color_name'
  END AS action,

  CASE
    WHEN fol.color IS NOT NULL AND fol.color <> '' AND pcs.id IS NOT NULL
         AND pcs.quantity < fol.qty_ordered * 2
      THEN 'ATTENTION: stock < qte*2 — déjà corrigé ?'
    WHEN fol.color IS NOT NULL AND fol.color <> '' AND pcs.id IS NULL
      THEN 'ATTENTION: variante introuvable (color_name mismatch ?)'
    ELSE 'OK'
  END AS warning

FROM fo_orders fo
JOIN fo_order_lines fol ON fol.order_id = fo.id
LEFT JOIN products p ON p.ref = fol.product_ref
LEFT JOIN product_color_stock pcs
       ON pcs.product_id = p.id
      AND pcs.color_name ILIKE fol.color
WHERE fo.order_number = 'FO-2026-06240'
ORDER BY fol.product_name, fol.color;


-- ══════════════════════════════════════════════════════════════
-- STEPS 1-4 — APPLY THE FIX (run after verifying step 0)
-- ══════════════════════════════════════════════════════════════

BEGIN;

-- ── Step 1: Fix product_color_stock for all color-variant lines ───────────────
-- Subtracts qty_ordered once (reverses the extra application).
-- Safety guard: only runs if current quantity >= qty_ordered * 2.
-- This means the row looks doubled; if already corrected it is skipped.

UPDATE product_color_stock pcs
SET    quantity = pcs.quantity - fol.qty_ordered
FROM   fo_order_lines fol
JOIN   fo_orders fo ON fo.id = fol.order_id
JOIN   products  p  ON p.ref = fol.product_ref
WHERE  fo.order_number  = 'FO-2026-06240'
  AND  fol.color       IS NOT NULL
  AND  fol.color       <> ''
  AND  pcs.product_id   = p.id
  AND  pcs.color_name   ILIKE fol.color
  AND  pcs.quantity    >= fol.qty_ordered * 2;   -- safety: only if doubled


-- ── Step 2: Recalculate products.stock = SUM(variants) for variant products ──
-- After step 1 fixed the variant rows, recompute the aggregate.
-- Only touches products that appear in the order and have color variants.

UPDATE products p
SET    stock      = (
         SELECT COALESCE(SUM(pcs2.quantity), 0)
         FROM   product_color_stock pcs2
         WHERE  pcs2.product_id = p.id
       ),
       updated_at = NOW()
FROM (
  SELECT DISTINCT p2.id
  FROM   fo_order_lines fol
  JOIN   fo_orders fo ON fo.id = fol.order_id
  JOIN   products  p2 ON p2.ref = fol.product_ref
  WHERE  fo.order_number = 'FO-2026-06240'
    AND  fol.color IS NOT NULL
    AND  fol.color <> ''
) affected
WHERE p.id = affected.id;


-- ── Step 3: Fix products.stock for non-variant lines (no color recorded) ─────
-- Subtracts qty_ordered directly from products.stock.
-- Safety guard: only runs if current stock >= qty_ordered * 2.

UPDATE products p
SET    stock      = p.stock - fol.qty_ordered,
       updated_at = NOW()
FROM   fo_order_lines fol
JOIN   fo_orders fo ON fo.id = fol.order_id
WHERE  fo.order_number  = 'FO-2026-06240'
  AND  (fol.color IS NULL OR fol.color = '')
  AND  p.ref = fol.product_ref
  AND  p.stock >= fol.qty_ordered * 2;           -- safety: only if doubled


-- ── Step 4: Mark order as stock_updated to block future re-application ────────

UPDATE fo_orders
SET    stock_updated = TRUE
WHERE  order_number = 'FO-2026-06240';


COMMIT;


-- ══════════════════════════════════════════════════════════════
-- STEP 5 — POST-FIX VERIFICATION
-- Run after commit to confirm corrected values
-- ══════════════════════════════════════════════════════════════

SELECT
  fol.product_name,
  fol.product_ref,
  COALESCE(fol.color, '— (sans variante)') AS couleur,
  fol.qty_ordered                           AS qte_commandee,
  p.stock                                   AS stock_produit_final,
  pcs.quantity                              AS stock_variante_final,
  fo.stock_updated                          AS commande_marquee_ok
FROM   fo_orders fo
JOIN   fo_order_lines fol ON fol.order_id = fo.id
LEFT   JOIN products p  ON p.ref = fol.product_ref
LEFT   JOIN product_color_stock pcs
         ON pcs.product_id = p.id
        AND pcs.color_name ILIKE fol.color
WHERE  fo.order_number = 'FO-2026-06240'
ORDER  BY fol.product_name, fol.color;
