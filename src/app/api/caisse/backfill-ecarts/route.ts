import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const MTQ_OFFSET = '-04:00';
const dayStart = (d: string) => `${d}T00:00:00${MTQ_OFFSET}`;
const dayEnd   = (d: string) => `${d}T23:59:59${MTQ_OFFSET}`;

function cashPortionOfReceipt(paymentMethod: string, totalAmount: number): number {
  const pm = String(paymentMethod ?? '').trim().toLowerCase();
  if (pm === 'espèces' || pm === 'especes' || pm === 'cash' || pm.startsWith('espèces|') || pm.startsWith('especes|')) return totalAmount;
  if (pm === 'mixte' || pm === 'mixed') return totalAmount;
  if (pm.startsWith('mixte|')) {
    const parts = String(paymentMethod ?? '').trim().split('|');
    return parseFloat(parts[2] ?? '0') || 0;
  }
  return 0;
}

// Fetches all rows from receipts by paginating to bypass Supabase max_rows cap (default 1000).
async function fetchAllReceipts(
  supabase: ReturnType<typeof createAdminClient>,
  oldest: string,
  newest: string,
): Promise<any[]> {
  const PAGE = 1000;
  const all: any[] = [];
  let start = 0;
  while (true) {
    const { data: page, error } = await supabase
      .from('receipts')
      .select('created_at, total_amount, payment_method, client_name')
      .eq('status', 'completed')
      .neq('is_demo', true)
      .gte('created_at', dayStart(oldest))
      .lte('created_at', dayEnd(newest))
      .order('created_at', { ascending: true })
      .range(start, start + PAGE - 1);

    if (error || !page || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
    start += PAGE;
  }
  return all;
}

// POST /api/caisse/backfill-ecarts
// Recomputes fond_theorique and ecart for all closed sessions that have fond_compte set.
export async function POST() {
  const supabase = createAdminClient();

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

  // Paginated fetch — bypasses Supabase default max_rows cap of 1000 rows per request
  const allReceipts = await fetchAllReceipts(supabase, oldest, newest);

  // Fetch all cash expenses in range
  const { data: allExpenses } = await supabase
    .from('daily_expenses')
    .select('expense_date, amount, payment_method')
    .gte('expense_date', oldest)
    .lte('expense_date', newest)
    .in('payment_method', ['cash', 'Espèces']);

  // Group receipts by Martinique local date
  const cashInByDate: Record<string, number> = {};
  for (const r of allReceipts) {
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (cn === 'CHRISTY LHOMME') continue;
    // Convert UTC created_at to local Martinique date
    const d = new Date(r.created_at as string).toLocaleDateString('en-CA', { timeZone: 'America/Martinique' });
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
  const results: { date: string; cash_in: number; old_ecart: number | null; new_ecart: number; fond_theorique: number }[] = [];

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
        cash_in: cashIn,
        old_ecart: current?.ecart ?? null,
        new_ecart: newEcart,
        fond_theorique: fondTheorique,
      });
    } else {
      console.error(`[backfill-ecarts] update error for ${session.date}`, updErr);
    }
  }

  return NextResponse.json({
    updated,
    total: sessions.length,
    receipts_fetched: allReceipts.length,
    results,
  });
}
