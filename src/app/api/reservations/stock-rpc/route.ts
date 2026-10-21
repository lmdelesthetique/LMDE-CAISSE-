import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/reservations/stock-rpc
// Deducts or reinstates stock for a reservation item, with full audit logging.
// body: { action: 'deduct' | 'reinject', productId: string, qty: number, reservationRef?: string, cashierName?: string }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { action, productId, qty, reservationRef, cashierName } = body as {
    action: 'deduct' | 'reinject';
    productId: string;
    qty: number;
    reservationRef?: string;
    cashierName?: string;
  };
  if (!action || !productId || !qty) return NextResponse.json({ error: 'action, productId, qty requis' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: prod } = await supabase
    .from('products')
    .select('id, name, stock')
    .eq('id', productId)
    .maybeSingle();

  if (!prod) return NextResponse.json({ error: `Produit introuvable: ${productId}` }, { status: 404 });

  const stockBefore = Number(prod.stock ?? 0);
  let stockAfter: number;
  let movementType: string;
  let reason: string;

  if (action === 'deduct') {
    stockAfter = Math.max(0, stockBefore - qty);
    movementType = 'sale';
    reason = `Réservation — décompte${reservationRef ? ` ${reservationRef}` : ''}`;
  } else {
    stockAfter = stockBefore + qty;
    movementType = 'entry';
    reason = `Réservation annulée — restockage${reservationRef ? ` ${reservationRef}` : ''}`;
  }

  await supabase.from('products')
    .update({ stock: stockAfter, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (action === 'deduct' && stockAfter === 0) {
    await supabase.from('products')
      .update({ status: 'rupture', product_status: 'rupture' })
      .eq('id', productId)
      .neq('product_status', 'inactive');
  }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: prod.name,
    movement_type: movementType,
    quantity_before: stockBefore,
    quantity_after: stockAfter,
    quantity_change: action === 'deduct' ? -qty : qty,
    reason,
    performed_by: cashierName || 'Caisse',
    source: 'reservation',
    reference: reservationRef || productId,
  }).then(({ error: le }) => { if (le) console.error('[stock-rpc log]', le.message); });

  return NextResponse.json({ ok: true, stockBefore, stockAfter });
}
