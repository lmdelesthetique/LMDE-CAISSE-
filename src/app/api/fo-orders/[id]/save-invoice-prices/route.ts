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
    const { error } = await supabase
      .from('fo_order_lines')
      .update({ confirmed_unit_price: Number(confirmedUnitPrice) })
      .eq('id', lineId)
      .eq('order_id', id);
    if (error) console.error('[save-invoice-prices]', lineId, error.message);
  }

  return NextResponse.json({ ok: true });
}
