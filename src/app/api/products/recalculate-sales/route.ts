import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/products/recalculate-sales
// Recomputes sales_7d and sales_30d for a set of product IDs.
// Uses admin client to bypass RLS on receipts and products tables.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const productIds: string[] = body?.productIds ?? [];
  if (productIds.length === 0) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();
  const now = new Date();
  const since7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: receiptRows }, { data: shopifyMoves }] = await Promise.all([
    supabase
      .from('receipts')
      .select('items, created_at')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .limit(200000),
    supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .in('product_id', productIds)
      .eq('movement_type', 'sale')
      .gte('created_at', since90d),
  ]);

  const counters: Record<string, { s7: number; s30: number }> = {};
  for (const id of productIds) counters[id] = { s7: 0, s30: 0 };

  for (const receipt of receiptRows ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const id = item.product_id as string;
      if (!id || !counters[id] || item.is_free_price) continue;
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      if (createdAt >= since30d) counters[id].s30 += qty;
      if (createdAt >= since7d)  counters[id].s7  += qty;
    }
  }

  for (const m of shopifyMoves ?? []) {
    const id = m.product_id as string;
    if (!counters[id]) continue;
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    if (createdAt >= since30d) counters[id].s30 += qty;
    if (createdAt >= since7d)  counters[id].s7  += qty;
  }

  await Promise.all(
    productIds.map(id =>
      supabase.from('products')
        .update({ sales_7d: counters[id].s7, sales_30d: counters[id].s30 })
        .eq('id', id)
    )
  );

  return NextResponse.json({ ok: true });
}
