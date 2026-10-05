import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/inventory/adjust-variant
// Updates a color variant quantity, recalculates parent product stock, logs movement
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.variantId || !body?.productId || typeof body?.countedQty !== 'number') {
    return NextResponse.json({ error: 'Missing variantId, productId, or countedQty' }, { status: 400 });
  }
  const supabase = createAdminClient();

  const { error: varErr } = await supabase
    .from('product_color_stock')
    .update({ quantity: body.countedQty })
    .eq('id', body.variantId);
  if (varErr) return NextResponse.json({ error: varErr.message }, { status: 500 });

  const { data: allV } = await supabase
    .from('product_color_stock')
    .select('quantity')
    .eq('product_id', body.productId);
  const total = (allV ?? []).reduce((s: number, v: any) => s + (Number(v.quantity) || 0), 0);

  await supabase.from('products').update({ stock: total, updated_at: new Date().toISOString() }).eq('id', body.productId);

  await supabase.from('stock_movements_log').insert({
    product_id: body.productId,
    product_name: body.productName ?? '',
    movement_type: 'adjustment',
    quantity_before: body.currentStock ?? 0,
    quantity_after: body.countedQty,
    quantity_change: body.countedQty - (body.currentStock ?? 0),
    reason: body.reason ?? 'Inventaire par scan',
    performed_by: body.performedBy ?? 'Inventaire',
  });

  return NextResponse.json({ ok: true, totalStock: total });
}
