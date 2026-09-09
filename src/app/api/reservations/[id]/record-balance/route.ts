import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — record the final balance payment, completes the reservation
// Body: { amount: number, method: string, cashierName?: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { amount, method, cashierName } = body;
  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }
  const amt = Number(amount);

  const supabase = createAdminClient();

  const { data: existing, error: fetchErr } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !existing) {
    return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const existingDeposits: any[] = Array.isArray(existing.deposits) ? existing.deposits : [];
  const balanceEntry = {
    id: crypto.randomUUID(),
    amount: amt,
    method,
    paid_at: now,
    accounting_date: today,
    cashier_name: cashierName || null,
    is_balance: true,
  };

  // STEP 1: Deduct stock FIRST (before marking complete)
  // Payment is already received — stock must be deducted before we commit the sale.
  const stockErrors: string[] = [];
  if (existing.reservation_status !== 'completed' && Array.isArray(existing.items)) {
    const stockItems = (existing.items as any[])
      .filter((item: any) => item.productId || item.product_id)
      .map((item: any) => ({
        productId: item.productId || item.product_id,
        qty: Number(item.qty || item.quantity) || 1,
        isKit: Boolean(item.isKit),
        kitComponents: Array.isArray(item.kitComponents) ? item.kitComponents : [],
      }));

    for (const item of stockItems) {
      try {
        if (item.isKit || item.kitComponents.length > 0) {
          let components: Array<{ componentId?: string; component_id?: string; quantity: number }> = item.kitComponents;
          if (components.length === 0) {
            const { data: kitRows } = await supabase
              .from('product_kits')
              .select('component_id, quantity')
              .eq('product_id', item.productId);
            components = (kitRows ?? []) as any[];
          }
          for (const comp of components) {
            const compId = (comp as any).componentId ?? (comp as any).component_id;
            const compQty = Number((comp as any).quantity ?? 1) * item.qty;
            if (compId) {
              const { error: stockErr } = await supabase.rpc('deduct_stock_on_reservation', { p_product_id: compId, p_qty: compQty });
              if (stockErr) {
                console.error('[record-balance] kit component stock deduction failed:', compId, stockErr.message);
                stockErrors.push(`Composant ${compId}: ${stockErr.message}`);
              }
            }
          }
        } else {
          const { error: stockErr } = await supabase.rpc('deduct_stock_on_reservation', { p_product_id: item.productId, p_qty: item.qty });
          if (stockErr) {
            console.error('[record-balance] stock deduction failed:', item.productId, stockErr.message);
            stockErrors.push(`Produit ${item.productId}: ${stockErr.message}`);
          }
        }
      } catch (e: any) {
        console.error('[record-balance] stock deduction exception:', e.message);
        stockErrors.push(e.message);
      }
    }
  }

  // STEP 2: Mark as completed (payment received — must commit regardless of stock errors)
  const { data, error } = await supabase
    .from('reservations')
    .update({
      balance_paid: amt,
      balance_payment_method: method,
      balance_paid_at: now,
      balance_accounting_date: today,
      reservation_status: 'completed',
      completed_at: now,
      deposits: [...existingDeposits, balanceEntry],
      updated_at: now,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[record-balance]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (stockErrors.length > 0) {
    console.warn('[record-balance] completed with stock errors (investigate manually):', stockErrors);
  }

  return NextResponse.json({ ...data, stockErrors: stockErrors.length > 0 ? stockErrors : undefined });
}
