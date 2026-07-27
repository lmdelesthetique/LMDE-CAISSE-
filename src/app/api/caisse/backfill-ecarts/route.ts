import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function cashPortionOfReceipt(paymentMethod: string, totalAmount: number): number {
  const pm = String(paymentMethod ?? '').trim();
  if (pm === 'Espèces' || pm === 'cash') return totalAmount;
  if (pm === 'Mixte' || pm === 'mixed') return totalAmount;
  if (pm.startsWith('Mixte|')) {
    const parts = pm.split('|');
    return parseFloat(parts[2] ?? '0') || 0;
  }
  return 0;
}

// POST /api/caisse/backfill-ecarts
// Recomputes fond_theorique and ecart for all closed sessions that have fond_compte set.
export async function POST() {
  const supabase = makeClient();

  // Fetch all closed sessions that have a physical count (fond_compte)
  const { data: sessions, error: sessErr } = await supabase
    .from('caisse_sessions')
    .select('id, date, fond_ouverture, fond_compte')
    .eq('statut', 'cloturee')
    .not('fond_compte', 'is', null)
    .order('date', { ascending: true });

  if (sessErr) {
    console.error('[backfill-ecarts] sessions fetch error', sessErr);
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ updated: 0, message: 'Aucune session à recalculer' });
  }

  const oldest = sessions[0].date;
  const newest = sessions[sessions.length - 1].date;

  // Fetch all receipts in range
  const { data: allReceipts } = await supabase
    .from('receipts')
    .select('created_at, total_amount, payment_method')
    .eq('status', 'completed')
    .gte('created_at', `${oldest}T00:00:00`)
    .lte('created_at', `${newest}T23:59:59`);

  // Fetch all cash expenses in range
  const { data: allExpenses } = await supabase
    .from('daily_expenses')
    .select('expense_date, amount, payment_method')
    .gte('expense_date', oldest)
    .lte('expense_date', newest)
    .in('payment_method', ['cash', 'Espèces']);

  // Group receipts by date
  const cashInByDate: Record<string, number> = {};
  for (const r of allReceipts ?? []) {
    const d = String(r.created_at).slice(0, 10);
    const portion = cashPortionOfReceipt(r.payment_method, parseFloat(String(r.total_amount ?? 0)));
    cashInByDate[d] = (cashInByDate[d] ?? 0) + portion;
  }

  // Group expenses by date
  const cashOutByDate: Record<string, number> = {};
  for (const e of allExpenses ?? []) {
    const d = String(e.expense_date).slice(0, 10);
    cashOutByDate[d] = (cashOutByDate[d] ?? 0) + parseFloat(String(e.amount ?? 0));
  }

  // Recalculate and update each session
  let updated = 0;
  const results: { date: string; old_ecart: number | null; new_ecart: number; fond_theorique: number }[] = [];

  for (const session of sessions) {
    const cashIn = cashInByDate[session.date] ?? 0;
    const cashOut = cashOutByDate[session.date] ?? 0;
    const fondTheorique = (session.fond_ouverture ?? 0) + cashIn - cashOut;
    const newEcart = (session.fond_compte ?? 0) - fondTheorique;

    const { data: current } = await supabase
      .from('caisse_sessions')
      .select('ecart, fond_theorique')
      .eq('id', session.id)
      .single();

    const { error: updErr } = await supabase
      .from('caisse_sessions')
      .update({
        fond_theorique: fondTheorique,
        ecart: newEcart,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (!updErr) {
      updated++;
      results.push({
        date: session.date,
        old_ecart: current?.ecart ?? null,
        new_ecart: newEcart,
        fond_theorique: fondTheorique,
      });
    } else {
      console.error(`[backfill-ecarts] update error for ${session.date}`, updErr);
    }
  }

  return NextResponse.json({ updated, total: sessions.length, results });
}
