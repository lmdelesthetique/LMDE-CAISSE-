import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function POST() {
  const supabase = getSupabase();
  const now = new Date();
  const since7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all POS receipts (true sales source) + Shopify movements in last 90 days
  const [{ data: receiptRows, error: rcErr }, { data: shopifyMoves }] = await Promise.all([
    supabase
      .from('receipts')
      .select('items, created_at')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .neq('payment_type', 'avoir')
      .limit(200000),
    supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .eq('movement_type', 'sale')
      .gte('created_at', since90d)
      .limit(100000),
  ]);

  if (rcErr) return NextResponse.json({ error: rcErr.message }, { status: 500 });

  // Aggregate per product for 7d and 30d windows
  const counters: Record<string, { s7: number; s30: number }> = {};

  // Source 1: POS receipts — items JSONB contains { product_id, qty }
  for (const receipt of receiptRows ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const id = item.product_id as string;
      if (!id || item.is_free_price) continue;
      if (!counters[id]) counters[id] = { s7: 0, s30: 0 };
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      if (createdAt >= since30d) counters[id].s30 += qty;
      if (createdAt >= since7d)  counters[id].s7  += qty;
    }
  }

  // Source 2: Shopify movements log (sales not captured in POS receipts)
  for (const m of shopifyMoves ?? []) {
    const id = m.product_id as string;
    if (!id) continue;
    if (!counters[id]) counters[id] = { s7: 0, s30: 0 };
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    if (createdAt >= since30d) counters[id].s30 += qty;
    if (createdAt >= since7d)  counters[id].s7  += qty;
  }

  const productIds = Object.keys(counters);
  let updated = 0;

  await Promise.all(
    productIds.map(async id => {
      const { error } = await supabase
        .from('products')
        .update({ sales_7d: counters[id].s7, sales_30d: counters[id].s30 })
        .eq('id', id);
      if (!error) updated++;
    })
  );

  return NextResponse.json({
    success: true,
    updated,
    receipts: receiptRows?.length ?? 0,
    message: `${updated} produits mis à jour — ventes 7j/30j recalculées depuis ${receiptRows?.length ?? 0} tickets de caisse`,
  });
}
