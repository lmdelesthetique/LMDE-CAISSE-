import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — return confirmed prices map { lineId: confirmedPrice } for an order
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  if (supplierId) {
    const { data: order } = await supabase
      .from('fo_orders').select('supplier_id').eq('id', id).single();
    if (!order || order.supplier_id !== supplierId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const { data: lines, error } = await supabase
    .from('fo_order_lines')
    .select('id, confirmed_unit_price')
    .eq('order_id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const result: Record<string, number | null> = {};
  (lines ?? []).forEach((l: any) => {
    result[l.id] = l.confirmed_unit_price != null ? Number(l.confirmed_unit_price) : null;
  });

  return NextResponse.json(result);
}

// POST — supplier submits price confirmations
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { supplierId, lineConfirmations } = body;
  if (!Array.isArray(lineConfirmations)) {
    return NextResponse.json({ error: 'lineConfirmations must be an array' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('fo_orders').select('supplier_id, order_status').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (supplierId && order.supplier_id !== supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  for (const { lineId, confirmedPrice } of lineConfirmations) {
    if (!lineId || confirmedPrice == null || isNaN(Number(confirmedPrice))) continue;
    const { error } = await supabase
      .from('fo_order_lines')
      .update({ confirmed_unit_price: Number(confirmedPrice) })
      .eq('id', lineId)
      .eq('order_id', id);
    if (error) console.error('[confirm-prices LINE]', lineId, error.message);
  }

  const { error: orderErr } = await supabase
    .from('fo_orders')
    .update({ order_status: 'awaiting_validation', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  try {
    await supabase.from('fo_status_history').insert({
      order_id: id,
      old_status: order.order_status,
      new_status: 'awaiting_validation',
      changed_by: 'Fournisseur',
      comment: 'Tarifs confirmés par le fournisseur',
      changed_at: new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return NextResponse.json({ ok: true });
}
