import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — admin validates confirmed prices → updates products.buy_price + order status
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

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

  const { error: orderErr } = await supabase
    .from('fo_orders')
    .update({ order_status: 'validated', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

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
