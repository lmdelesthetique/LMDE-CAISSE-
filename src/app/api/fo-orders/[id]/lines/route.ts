import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — return all lines for an order
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('fo_order_lines').select('*').eq('order_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST — insert a single new line (safe: no deletion, just INSERT + subtotal update)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const { line } = body;
  if (!line) return NextResponse.json({ error: 'line required' }, { status: 400 });

  const supabase = createAdminClient();

  let imageUrl = line.productImageUrl || null;
  if (!imageUrl && (line.productId || line.productRef)) {
    const q = line.productId
      ? supabase.from('products').select('image_url').eq('id', line.productId).maybeSingle()
      : supabase.from('products').select('image_url').eq('ref', line.productRef).maybeSingle();
    const { data: prod } = await q;
    imageUrl = prod?.image_url || null;
  }

  const lineTotal = (line.qtyOrdered || 1) * (line.unitPrice || 0);

  const { data: inserted, error } = await supabase.from('fo_order_lines').insert({
    order_id: id,
    product_id: line.productId || null,
    product_name: line.productName,
    product_ref: line.productRef || null,
    product_image_url: imageUrl,
    variant: line.variant || null,
    color: line.color || null,
    size: line.size || null,
    model: line.model || null,
    qty_ordered: line.qtyOrdered || 1,
    qty_received: 0,
    unit_price: line.unitPrice || 0,
    line_total: lineTotal,
    sale_price: line.salePrice || 0,
    weight_kg: line.weightKg || 0,
    volume_m3: line.volumeM3 || 0,
    note: line.note || null,
    unit_transport: 0, unit_customs: 0, unit_vat_import: 0,
    unit_freight: 0, unit_other: 0,
    unit_real_cost: 0, gross_margin: 0, margin_rate: 0,
    previous_cost: 0, qty_missing: 0, qty_damaged: 0, custom_cost_share: 0,
  }).select('id').single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: allLines } = await supabase.from('fo_order_lines').select('line_total').eq('order_id', id);
  const subtotal = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.line_total || 0), 0);
  await supabase.from('fo_orders').update({ subtotal, updated_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json({ ok: true, id: inserted?.id });
}

// PATCH — update a single line field (?lineId=...) and recalculate order subtotal
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lineId = req.nextUrl.searchParams.get('lineId');
  if (!id || !lineId) return NextResponse.json({ error: 'Missing id or lineId' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  const { data: line } = await supabase.from('fo_order_lines').select('unit_price, qty_ordered').eq('id', lineId).eq('order_id', id).maybeSingle();
  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (body.qtyOrdered !== undefined) {
    const qty = Math.max(1, Math.round(Number(body.qtyOrdered)));
    update.qty_ordered = qty;
    update.line_total = qty * Number(body.unitPrice ?? line.unit_price ?? 0);
  }
  if (body.unitPrice !== undefined) {
    update.unit_price = Number(body.unitPrice);
    update.line_total = Number(body.qtyOrdered ?? line.qty_ordered ?? 1) * Number(body.unitPrice);
  }
  if (body.salePrice !== undefined) update.sale_price = Math.max(0, Number(body.salePrice));
  if (body.qtyReceived !== undefined) update.qty_received = body.qtyReceived;
  if (body.lineTotal !== undefined) update.line_total = body.lineTotal;
  if (body.unitRealCost !== undefined) update.unit_real_cost = body.unitRealCost;
  if (body.unitTransport !== undefined) update.unit_transport = body.unitTransport;
  if (body.unitCustoms !== undefined) update.unit_customs = body.unitCustoms;
  if (body.unitVatImport !== undefined) update.unit_vat_import = body.unitVatImport;
  if (body.unitFreight !== undefined) update.unit_freight = body.unitFreight;
  if (body.unitOther !== undefined) update.unit_other = body.unitOther;
  if (body.grossMargin !== undefined) update.gross_margin = body.grossMargin;
  if (body.marginRate !== undefined) update.margin_rate = body.marginRate;
  if (body.qtyMissing !== undefined) update.qty_missing = body.qtyMissing;
  if (body.qtyDamaged !== undefined) update.qty_damaged = body.qtyDamaged;
  if (body.receptionNote !== undefined) update.reception_note = body.receptionNote;
  if (body.note !== undefined) update.note = body.note;
  if (body.customCostShare !== undefined) update.custom_cost_share = body.customCostShare;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  await supabase.from('fo_order_lines').update(update).eq('id', lineId);

  if (update.line_total !== undefined || update.qty_ordered !== undefined) {
    const { data: allLines } = await supabase.from('fo_order_lines').select('line_total').eq('order_id', id);
    const subtotal = (allLines ?? []).reduce((s: number, l: any) => s + Number(l.line_total || 0), 0);
    await supabase.from('fo_orders').update({ subtotal, updated_at: new Date().toISOString() }).eq('id', id);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove a single line by ?lineId=...
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lineId = req.nextUrl.searchParams.get('lineId');
  if (!id || !lineId) return NextResponse.json({ error: 'Missing id or lineId' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('fo_order_lines').delete().eq('id', lineId).eq('order_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: remaining } = await supabase
    .from('fo_order_lines')
    .select('line_total')
    .eq('order_id', id);
  const subtotal = (remaining ?? []).reduce((s: number, l: any) => s + (l.line_total ?? 0), 0);
  await supabase.from('fo_orders').update({ subtotal, updated_at: new Date().toISOString() }).eq('id', id);

  return NextResponse.json({ ok: true });
}

// PUT — full line sync: delete removed, update existing, insert new, then update order totals
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lines, originalLineIds, subtotal, totalRealCost, notes, transportCost, customsCost } = body;
  if (!Array.isArray(lines)) return NextResponse.json({ error: 'lines must be an array' }, { status: 400 });

  const supabase = createAdminClient();

  // 1. Delete removed lines
  if (Array.isArray(originalLineIds) && originalLineIds.length > 0) {
    const keepIds = lines.filter((l: any) => !String(l.id).startsWith('new-')).map((l: any) => l.id);
    const toDelete = originalLineIds.filter((oid: string) => !keepIds.includes(oid));
    if (toDelete.length > 0) {
      const { error } = await supabase.from('fo_order_lines').delete().in('id', toDelete);
      if (error) console.error('[fo-lines DELETE]', error.message);
    }
  }

  // 2. Update existing lines
  for (const line of lines.filter((l: any) => !String(l.id).startsWith('new-'))) {
    const { error } = await supabase.from('fo_order_lines').update({
      qty_ordered: line.qtyOrdered,
      unit_price: line.unitPrice,
      line_total: line.qtyOrdered * line.unitPrice,
    }).eq('id', line.id);
    if (error) console.error('[fo-lines UPDATE]', line.id, error.message);
  }

  // 3. Insert new lines
  for (const line of lines.filter((l: any) => String(l.id).startsWith('new-'))) {
    let imageUrl = line.productImageUrl || null;
    if (!imageUrl && (line.productId || line.productRef)) {
      const q = line.productId
        ? supabase.from('products').select('image_url').eq('id', line.productId).maybeSingle()
        : supabase.from('products').select('image_url').eq('ref', line.productRef).maybeSingle();
      const { data: prod } = await q;
      imageUrl = prod?.image_url || null;
    }

    const { error } = await supabase.from('fo_order_lines').insert({
      order_id: id,
      product_id: line.productId || null,
      product_name: line.productName,
      product_ref: line.productRef || null,
      product_image_url: imageUrl,
      qty_ordered: line.qtyOrdered,
      qty_received: 0,
      unit_price: line.unitPrice,
      line_total: line.qtyOrdered * line.unitPrice,
      sale_price: line.salePrice || 0,
      weight_kg: 0, volume_m3: 0,
      unit_transport: 0, unit_customs: 0, unit_vat_import: 0,
      unit_freight: 0, unit_other: 0,
      unit_real_cost: 0, gross_margin: 0, margin_rate: 0,
      previous_cost: 0, qty_missing: 0, qty_damaged: 0, custom_cost_share: 0,
    });
    if (error) console.error('[fo-lines INSERT]', error.message);
  }

  // 4. Update order totals + notes/costs
  const orderUpdate: Record<string, unknown> = {
    subtotal: subtotal ?? 0,
    total_real_cost: totalRealCost ?? subtotal ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) orderUpdate.notes = notes;
  if (transportCost !== undefined) orderUpdate.transport_cost = transportCost;
  if (customsCost !== undefined) orderUpdate.customs_cost = customsCost;

  const { error: orderErr } = await supabase.from('fo_orders').update(orderUpdate).eq('id', id);
  if (orderErr) {
    console.error('[fo-lines order update]', orderErr.message);
    return NextResponse.json({ error: orderErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
