import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — Add stock with idempotency guard by invoice reference.
// If `reference` is provided and already exists for this product+movement_type,
// the request is rejected as a duplicate.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { productId, productName, currentStock, qty, reason, reference, performedBy = 'Admin' } = body;
  if (!productId || typeof qty !== 'number' || qty <= 0) {
    return NextResponse.json({ error: 'productId et qty (>0) requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: reject if same reference already processed for this product
  if (reference?.trim()) {
    const ref = reference.trim();
    const { data: existing } = await supabase
      .from('stock_movements_log')
      .select('id, created_at')
      .eq('product_id', productId)
      .eq('movement_type', 'entry')
      .eq('reference', ref)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({
        ok: false,
        duplicate: true,
        message: `Ce stock a déjà été enregistré pour la référence "${ref}". Doublon bloqué.`,
      });
    }
  }

  // Fetch fresh stock to avoid stale cache
  const { data: product } = await supabase
    .from('products')
    .select('id, stock, product_status')
    .eq('id', productId)
    .maybeSingle();

  if (!product) return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 });

  const freshStock = Number(product.stock) || 0;
  const newStock = freshStock + qty;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: newStock, updated_at: now })
    .eq('id', productId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (newStock > 0 && freshStock <= 0 && product.product_status !== 'inactive') {
    await supabase.from('products')
      .update({ status: 'active', product_status: 'active' })
      .eq('id', productId);
  }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName ?? '',
    movement_type: 'entry',
    quantity_before: freshStock,
    quantity_after: newStock,
    quantity_change: qty,
    reason: reason ?? '',
    reference: reference?.trim() ?? null,
    performed_by: performedBy,
  });

  // Non-blocking Shopify sync
  fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/shopify/sync-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ productId, delta: qty, newStock }] }),
  }).catch(() => {});

  return NextResponse.json({ ok: true, stockBefore: freshStock, stockAfter: newStock });
}
