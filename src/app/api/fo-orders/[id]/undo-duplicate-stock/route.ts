import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — reverses one duplicate stock sync application.
// Subtracts qty_ordered from each product's stock (undoes a second accidental force-sync).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

  const { data: lines } = await supabase
    .from('fo_order_lines')
    .select('id, product_id, product_ref, product_name, qty_ordered, color')
    .eq('order_id', id);

  if (!lines?.length) return NextResponse.json({ error: 'No lines found' }, { status: 400 });

  const now = new Date().toISOString();
  let fixed = 0;
  const log: { name: string; removed: number; before: number; after: number }[] = [];

  for (const line of lines) {
    const qtyToRemove = Number(line.qty_ordered || 0);
    if (qtyToRemove <= 0) continue;

    let productId: string | null = line.product_id ?? null;
    let currentStock = 0;
    let productName = line.product_name || line.product_ref || '';

    if (productId) {
      const { data: p } = await supabase.from('products').select('id, stock, name').eq('id', productId).maybeSingle();
      if (p) { currentStock = Number(p.stock || 0); productName = p.name || productName; }
    } else if (line.product_ref) {
      const { data: rows } = await supabase.from('products').select('id, stock, name').eq('ref', line.product_ref).limit(1);
      const p = rows?.[0];
      if (p) { productId = p.id; currentStock = Number(p.stock || 0); productName = p.name || productName; }
    }

    if (!productId) continue;

    const newStock = Math.max(0, currentStock - qtyToRemove);
    await supabase.from('products').update({ stock: newStock, updated_at: now }).eq('id', productId);

    if (newStock <= 0) {
      await supabase.from('products')
        .update({ status: 'rupture', product_status: 'rupture' })
        .eq('id', productId)
        .neq('product_status', 'inactive');
    }

    if (line.color) {
      const { data: varRow } = await supabase
        .from('product_color_stock').select('id, quantity')
        .eq('product_id', productId).ilike('color_name', line.color).maybeSingle();
      if (varRow) {
        const newQty = Math.max(0, Number(varRow.quantity || 0) - qtyToRemove);
        await supabase.from('product_color_stock').update({ quantity: newQty }).eq('id', varRow.id);
      }
    }

    // Audit log (best-effort)
    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: productName,
      movement_type: 'correction',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: -qtyToRemove,
      reason: `Correction doublon sync — commande ${order.order_number || id}`,
      performed_by: 'Admin',
    }).then(({ error }) => { if (error) console.error('[undo-duplicate-stock log]', error.message); });

    log.push({ name: productName, removed: qtyToRemove, before: currentStock, after: newStock });
    fixed++;
  }

  return NextResponse.json({ ok: true, fixed, log });
}
