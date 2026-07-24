import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — employee saves real unit prices from received supplier invoice
// Updates confirmed_unit_price per line WITHOUT changing order status
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { prices } = body;
  if (!Array.isArray(prices)) {
    return NextResponse.json({ error: 'prices must be an array' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('fo_orders').select('id').eq('id', id).maybeSingle();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  for (const { lineId, confirmedUnitPrice } of prices) {
    if (!lineId || confirmedUnitPrice == null || isNaN(Number(confirmedUnitPrice))) continue;
    const price = Number(confirmedUnitPrice);

    // Update confirmed_unit_price on the order line
    const { error } = await supabase
      .from('fo_order_lines')
      .update({ confirmed_unit_price: price })
      .eq('id', lineId)
      .eq('order_id', id);
    if (error) { console.error('[save-invoice-prices] line', lineId, error.message); continue; }

    // Also update purchase_price_supplier on the product if price > 0
    if (price > 0) {
      const { data: line } = await supabase
        .from('fo_order_lines')
        .select('product_id, product_ref')
        .eq('id', lineId)
        .maybeSingle();
      if (line?.product_id) {
        await supabase
          .from('products')
          .update({ purchase_price_supplier: price })
          .eq('id', line.product_id);
      } else if (line?.product_ref) {
        // Fallback: find product by ref when product_id is not set on the line
        await supabase
          .from('products')
          .update({ purchase_price_supplier: price })
          .eq('ref', line.product_ref);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
