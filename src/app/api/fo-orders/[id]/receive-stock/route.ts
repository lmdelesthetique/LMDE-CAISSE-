import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — integrates stock for a received supplier order:
// - Adds qty_received to products.stock
// - Updates products.buy_price with real per-unit cost (proportional fee allocation)
// - Marks fo_orders.stock_updated = true (idempotent)
// Pass force=true in body to bypass the idempotency guard (e.g. if previous run matched 0 products)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const qtysToAdd: Record<string, number> = body.qtysToAdd ?? {};
  const force: boolean = body.force === true;

  const supabase = createAdminClient();

  // Idempotency guard
  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, stock_updated, subtotal, total_real_cost, transport_cost, customs_cost, vat_import, freight_forwarder_cost, bank_fees, exchange_fees, local_delivery, other_costs')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (order.stock_updated && !force) return NextResponse.json({ ok: true, updated: 0, alreadyDone: true });

  const { data: lines } = await supabase
    .from('fo_order_lines')
    .select('id, product_id, product_ref, qty_ordered, unit_price, confirmed_unit_price, color')
    .eq('order_id', id);

  if (!lines?.length) return NextResponse.json({ error: 'No lines found' }, { status: 400 });

  const subtotal = lines.reduce((s, l) => s + Number(l.unit_price || 0) * Number(l.qty_ordered || 0), 0);
  const totalFees = Number(order.total_real_cost || 0) - subtotal;
  const feeRatio = subtotal > 0 ? Math.max(0, totalFees / subtotal) : 0;

  let updated = 0;
  const now = new Date().toISOString();

  for (const line of lines) {
    const qty = qtysToAdd[line.id] ?? Number(line.qty_ordered || 0);
    if (qty <= 0) continue;

    const baseUnitPrice = Number(line.confirmed_unit_price || line.unit_price || 0);
    const realUnitCost = baseUnitPrice > 0 ? baseUnitPrice * (1 + feeRatio) : 0;

    let productId: string | null = line.product_id ?? null;
    let currentStock = 0;

    if (productId) {
      const { data: p } = await supabase.from('products').select('id, stock').eq('id', productId).maybeSingle();
      currentStock = Number(p?.stock || 0);
    } else if (line.product_ref) {
      const { data: rows } = await supabase.from('products').select('id, stock').eq('ref', line.product_ref).limit(1);
      const p = rows?.[0];
      if (p) { productId = p.id; currentStock = Number(p.stock || 0); }
    }

    if (!productId) continue;

    const newStock = currentStock + qty;

    await supabase.from('products').update({ stock: newStock, updated_at: now }).eq('id', productId);

    if (realUnitCost > 0) {
      await supabase
        .from('products')
        .update({ buy_price: realUnitCost, purchase_price_supplier: baseUnitPrice, updated_at: now })
        .eq('id', productId)
        .neq('product_status', 'inactive');
    }

    if (newStock > 0 && currentStock <= 0) {
      await supabase.from('products')
        .update({ status: 'active', product_status: 'active' })
        .eq('id', productId)
        .neq('product_status', 'inactive');
    }

    if (line.color) {
      const { data: varRow } = await supabase
        .from('product_color_stock').select('id, quantity')
        .eq('product_id', productId).ilike('color_name', line.color).maybeSingle();
      if (varRow) {
        await supabase.from('product_color_stock').update({ quantity: Number(varRow.quantity || 0) + qty }).eq('id', varRow.id);
      }
    }

    // Movement log (best-effort)
    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: line.product_ref || '',
      movement_type: 'entry',
      quantity_before: currentStock,
      quantity_after: newStock,
      quantity_change: qty,
      reason: `Réception commande fournisseur ${order.order_number || id}`,
      performed_by: 'Admin',
    }).then(({ error }) => { if (error) console.error('[receive-stock log]', error.message); });

    updated++;
  }

  if (updated > 0) {
    await supabase.from('fo_orders').update({
      stock_updated: true,
      stock_updated_at: now,
      order_status: 'stock_integrated',
      updated_at: now,
    }).eq('id', id);
  }

  return NextResponse.json({ ok: true, updated, notMatched: lines.length - updated });
}
