import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// PUT — full line sync: delete removed, update existing, insert new, then update order totals
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { lines, originalLineIds, subtotal, totalRealCost, notes, transportCost, customsCost } = body;
  if (!Array.isArray(lines)) return NextResponse.json({ error: 'lines must be an array' }, { status: 400 });

  const supabase = makeAdminClient();

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
    // Fetch image_url from products table if not provided
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
      weight_kg: 0,
      volume_m3: 0,
      unit_transport: 0, unit_customs: 0, unit_vat_import: 0,
      unit_freight: 0, unit_other: 0,
      unit_real_cost: 0, gross_margin: 0, margin_rate: 0,
      previous_cost: 0, qty_missing: 0, qty_damaged: 0,
      custom_cost_share: 0,
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
