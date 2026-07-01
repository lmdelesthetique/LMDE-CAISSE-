import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — record the final balance payment, completes the reservation
// Body: { amount: number, method: string, cashierName?: string }
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

  // Deduct stock for sold items (non-blocking, only if not already completed)
  if (existing.reservation_status !== 'completed' && Array.isArray(existing.items)) {
    const stockItems = (existing.items as any[])
      .filter((item: any) => item.productId || item.product_id)
      .map((item: any) => ({
        productId: item.productId || item.product_id,
        qty: Number(item.qty || item.quantity) || 1,
      }));

    for (const item of stockItems) {
      try {
        await supabase.rpc('deduct_stock_on_reservation', {
          p_product_id: item.productId,
          p_qty: item.qty,
        });
      } catch { /* non-blocking */ }
    }
  }

  return NextResponse.json(data);
}
