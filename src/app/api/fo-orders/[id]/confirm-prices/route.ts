import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET — return confirmed prices map { lineId: confirmedPrice } for an order
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = makeAdminClient();

  // Verify supplier owns this order if supplierId provided
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
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { supplierId, lineConfirmations } = body;
  if (!Array.isArray(lineConfirmations)) {
    return NextResponse.json({ error: 'lineConfirmations must be an array' }, { status: 400 });
  }

  const supabase = makeAdminClient();

  // Verify supplier owns this order
  const { data: order } = await supabase
    .from('fo_orders').select('supplier_id, order_status').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (supplierId && order.supplier_id !== supplierId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Update confirmed_unit_price per line
  for (const { lineId, confirmedPrice } of lineConfirmations) {
    if (!lineId || confirmedPrice == null || isNaN(Number(confirmedPrice))) continue;
    const { error } = await supabase
      .from('fo_order_lines')
      .update({ confirmed_unit_price: Number(confirmedPrice) })
      .eq('id', lineId)
      .eq('order_id', id);
    if (error) console.error('[confirm-prices LINE]', lineId, error.message);
  }

  // Move order to awaiting_validation
  const { error: orderErr } = await supabase
    .from('fo_orders')
    .update({ order_status: 'awaiting_validation', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (orderErr) {
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  // Insert status history entry (non-blocking)
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
