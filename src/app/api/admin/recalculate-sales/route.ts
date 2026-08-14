import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function POST() {
  const supabase = getSupabase();
  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch all sale movements in last 30 days
  const { data: movements, error: mvErr } = await supabase
    .from('stock_movements_log')
    .select('product_id, quantity_change, created_at')
    .eq('movement_type', 'sale')
    .gte('created_at', since30d);

  if (mvErr) return NextResponse.json({ error: mvErr.message }, { status: 500 });

  // Aggregate per product
  const counters: Record<string, { s7: number; s30: number }> = {};
  for (const m of movements ?? []) {
    const id = m.product_id as string;
    if (!counters[id]) counters[id] = { s7: 0, s30: 0 };
    const qty = Math.abs(Number(m.quantity_change) || 0);
    counters[id].s30 += qty;
    if ((m.created_at as string) >= since7d) counters[id].s7 += qty;
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

  // Also zero out products with no sales in last 30 days
  const { error: zeroErr } = await supabase
    .from('products')
    .update({ sales_7d: 0, sales_30d: 0 })
    .not('id', 'in', `(${productIds.map(id => `"${id}"`).join(',')})`.replace(/"/g, "'"));

  return NextResponse.json({
    success: true,
    updated,
    zeroed: !zeroErr,
    message: `${updated} produits mis à jour avec les compteurs de ventes recalculés`,
  });
}
