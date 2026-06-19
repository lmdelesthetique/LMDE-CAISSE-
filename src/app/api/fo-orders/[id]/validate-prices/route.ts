import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// POST — admin validates confirmed prices → updates products.buy_price + order status
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = makeAdminClient();

  // Fetch order + lines with confirmed prices
  const { data: order } = await supabase
    .from('fo_orders').select('order_status, order_number').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: lines, error: linesErr } = await supabase
    .from('fo_order_lines')
    .select('id, product_id, product_ref, confirmed_unit_price, unit_price')
    .eq('order_id', id);

  if (linesErr) return NextResponse.json({ error: linesErr.message }, { status: 500 });

  let updatedCount = 0;
  for (const line of (lines ?? [])) {
    if (!line.confirmed_unit_price || !line.product_id) continue;
    const newPrice = Number(line.confirmed_unit_price);
    if (isNaN(newPrice) || newPrice <= 0) continue;

    const { error } = await supabase
      .from('products')
      .update({ buy_price: newPrice, updated_at: new Date().toISOString() })
      .eq('id', line.product_id);
    if (error) {
      console.error('[validate-prices PRODUCT]', line.product_id, error.message);
    } else {
      updatedCount++;
    }
  }

  // Update order status to validated
  const { error: orderErr } = await supabase
    .from('fo_orders')
    .update({ order_status: 'validated', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  // Insert status history (non-blocking)
  try {
    await supabase.from('fo_status_history').insert({
      order_id: id,
      old_status: order.order_status,
      new_status: 'validated',
      changed_by: 'Admin',
      comment: `Tarifs validés — ${updatedCount} prix achat mis à jour`,
      changed_at: new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true, updatedCount });
}
