import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — add a partial deposit (does NOT complete the reservation)
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

  const currentDepositPaid = Number(existing.deposit_paid ?? 0);
  const balancePaid = Number(existing.balance_paid ?? 0);
  const totalAmount = Number(existing.total_amount ?? 0);
  const newTotal = currentDepositPaid + amt;

  if (newTotal + balancePaid > totalAmount + 0.01) {
    return NextResponse.json({ error: 'Le montant total dépasse le montant de la commande' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];
  const now = new Date().toISOString();

  const existingDeposits: any[] = Array.isArray(existing.deposits) ? existing.deposits : [];
  const newEntry = {
    id: crypto.randomUUID(),
    amount: amt,
    method,
    paid_at: now,
    accounting_date: today,
    cashier_name: cashierName || null,
  };

  const updatePayload: Record<string, any> = {
    deposit_paid: newTotal,
    deposits: [...existingDeposits, newEntry],
    deposit_payment_method: method,
    deposit_paid_at: now,
    updated_at: now,
  };

  // Set accounting date only on first deposit
  if (!existing.deposit_accounting_date) {
    updatePayload.deposit_accounting_date = today;
  }

  // Advance status from pending to deposit_paid on first deposit
  if (existing.reservation_status === 'pending') {
    updatePayload.reservation_status = 'deposit_paid';
  }

  const { data, error } = await supabase
    .from('reservations')
    .update(updatePayload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[add-deposit]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
