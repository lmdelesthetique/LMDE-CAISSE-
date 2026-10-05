import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH /api/fo-order-lines/[lineId] — update any line fields and recalculate order subtotal
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const u: any = {};
  if (body.qty_ordered !== undefined) u.qty_ordered = body.qty_ordered;
  if (body.qty_received !== undefined) u.qty_received = body.qty_received;
  if (body.unit_price !== undefined) u.unit_price = body.unit_price;
  if (body.line_total !== undefined) u.line_total = body.line_total;
  if (body.unit_real_cost !== undefined) u.unit_real_cost = body.unit_real_cost;
  if (body.unit_transport !== undefined) u.unit_transport = body.unit_transport;
  if (body.unit_customs !== undefined) u.unit_customs = body.unit_customs;
  if (body.unit_vat_import !== undefined) u.unit_vat_import = body.unit_vat_import;
  if (body.unit_freight !== undefined) u.unit_freight = body.unit_freight;
  if (body.unit_other !== undefined) u.unit_other = body.unit_other;
  if (body.sale_price !== undefined) u.sale_price = body.sale_price;
  if (body.gross_margin !== undefined) u.gross_margin = body.gross_margin;
  if (body.margin_rate !== undefined) u.margin_rate = body.margin_rate;
  if (body.qty_missing !== undefined) u.qty_missing = body.qty_missing;
  if (body.qty_damaged !== undefined) u.qty_damaged = body.qty_damaged;
  if (body.reception_note !== undefined) u.reception_note = body.reception_note;
  if (body.note !== undefined) u.note = body.note;
  if (body.custom_cost_share !== undefined) u.custom_cost_share = body.custom_cost_share;
  if (body.confirmed_unit_price !== undefined) u.confirmed_unit_price = body.confirmed_unit_price;

  if (Object.keys(u).length === 0) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  // Auto-compute line_total when qty and price are given
  if (u.qty_ordered !== undefined && u.unit_price !== undefined && u.line_total === undefined) {
    u.line_total = Number(u.qty_ordered) * Number(u.unit_price);
  }

  const { data: line, error: lineErr } = await supabase
    .from('fo_order_lines')
    .update(u)
    .eq('id', lineId)
    .select('order_id')
    .single();
  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 });

  // Recalculate order subtotal if line_total changed
  if (u.line_total !== undefined || u.qty_ordered !== undefined) {
    const orderId = line?.order_id;
    if (orderId) {
      const { data: allLines } = await supabase
        .from('fo_order_lines')
        .select('line_total')
        .eq('order_id', orderId);
      const subtotal = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.line_total || 0), 0);
      await supabase.from('fo_orders').update({ subtotal, updated_at: new Date().toISOString() }).eq('id', orderId);
    }
  }

  return NextResponse.json({ ok: true });
}

// DELETE /api/fo-order-lines/[lineId]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ lineId: string }> }) {
  const { lineId } = await params;
  const supabase = createAdminClient();

  const { data: line } = await supabase
    .from('fo_order_lines')
    .select('order_id')
    .eq('id', lineId)
    .maybeSingle();

  const { error } = await supabase.from('fo_order_lines').delete().eq('id', lineId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (line?.order_id) {
    const { data: remaining } = await supabase
      .from('fo_order_lines')
      .select('line_total')
      .eq('order_id', line.order_id);
    const subtotal = (remaining ?? []).reduce((s: number, l: any) => s + Number(l.line_total || 0), 0);
    await supabase.from('fo_orders').update({ subtotal, updated_at: new Date().toISOString() }).eq('id', line.order_id);
  }

  return NextResponse.json({ ok: true });
}
