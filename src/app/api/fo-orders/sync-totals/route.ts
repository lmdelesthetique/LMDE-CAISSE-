import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST — recalculate each order's subtotal from fo_order_lines and fix total_real_cost
export async function POST() {
  const supabase = makeAdminClient();

  // 1. Fetch all orders with their subtotal and total_real_cost
  const { data: orders, error } = await supabase
    .from('fo_orders')
    .select('id, subtotal, total_real_cost');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ fixed: 0 });

  // 2. For each order, recalculate subtotal from lines and fix if mismatched
  let fixed = 0;
  for (const order of orders) {
    const { data: lines } = await supabase
      .from('fo_order_lines')
      .select('qty_ordered, unit_price')
      .eq('order_id', order.id);

    if (!lines?.length) continue;

    const realSubtotal = lines.reduce((s, l) => s + (Number(l.qty_ordered) * Number(l.unit_price)), 0);

    const currentSubtotal = Number(order.subtotal || 0);
    const currentTotal = Number(order.total_real_cost || 0);

    const needsUpdate = Math.abs(realSubtotal - currentSubtotal) > 0.01 || currentTotal < realSubtotal;

    if (needsUpdate) {
      const newTotal = currentTotal > realSubtotal ? currentTotal : realSubtotal;
      await supabase
        .from('fo_orders')
        .update({
          subtotal: realSubtotal,
          total_real_cost: newTotal,
          updated_at: new Date().toISOString(),
        })
        .eq('id', order.id);
      fixed++;
    }
  }

  return NextResponse.json({ fixed, total: orders.length });
}
