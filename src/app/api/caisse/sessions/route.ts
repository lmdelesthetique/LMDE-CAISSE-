import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function todayDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Calcule la portion espèces reçue d'une vente selon son mode de paiement.
 * - "Espèces" / "cash" → montant total
 * - "Mixte|CB|cash"    → uniquement la partie cash (3e segment)
 * - "Mixte" / "mixed"  → montant total (tout en espèces)
 * - Autres             → 0
 */
function cashPortionOfReceipt(paymentMethod: string, totalAmount: number): number {
  const pm = String(paymentMethod ?? '').trim();
  if (pm === 'Espèces' || pm === 'cash') return totalAmount;
  if (pm === 'Mixte' || pm === 'mixed') return totalAmount;
  if (pm.startsWith('Mixte|')) {
    // Format : Mixte|<montant_cb>|<montant_cash>
    const parts = pm.split('|');
    return parseFloat(parts[2] ?? '0') || 0;
  }
  return 0;
}

// ─── GET /api/caisse/sessions?date=YYYY-MM-DD ─────────────────────────────────
// Returns the open session for the date, with correct cash_in_today
export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date') ?? todayDate();
  const supabase = makeClient();

  const { data, error } = await supabase
    .from('caisse_sessions')
    .select('*')
    .eq('date', date)
    .eq('statut', 'ouverte')
    .maybeSingle();

  if (error) {
    if (error.code === '42P01') return NextResponse.json(null);
    console.error('[api/caisse/sessions GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json(null);

  // Fetch ALL receipts of the day (no payment_method filter — we parse ourselves)
  const { data: allReceipts } = await supabase
    .from('receipts')
    .select('total_amount, payment_method')
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .eq('status', 'completed');

  const cashIn = (allReceipts ?? []).reduce((sum, r) => {
    const amount = parseFloat(String(r.total_amount ?? 0));
    return sum + cashPortionOfReceipt(r.payment_method, amount);
  }, 0);

  // Subtract cash expenses paid from the drawer
  const { data: cashExpenses } = await supabase
    .from('daily_expenses')
    .select('amount')
    .eq('expense_date', date)
    .in('payment_method', ['cash', 'Espèces']);

  const cashOut = (cashExpenses ?? []).reduce(
    (sum, e) => sum + parseFloat(String(e.amount ?? 0)),
    0
  );

  return NextResponse.json({
    ...data,
    cash_in_today: cashIn,
    cash_expenses_today: cashOut,
  });
}

// ─── POST /api/caisse/sessions — open session ─────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { fond_ouverture: number; fond_detail?: Record<string, number>; caissier_name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = makeClient();
  const date = todayDate();

  const { data: existing } = await supabase
    .from('caisse_sessions')
    .select('id')
    .eq('date', date)
    .eq('statut', 'ouverte')
    .maybeSingle();

  if (existing) return NextResponse.json(existing);

  const { data, error } = await supabase
    .from('caisse_sessions')
    .insert({
      date,
      caissier_name: body.caissier_name ?? 'Caisse',
      fond_ouverture: body.fond_ouverture,
      fond_detail_ouverture: body.fond_detail ?? null,
      statut: 'ouverte',
    })
    .select()
    .single();

  if (error) {
    console.error('[api/caisse/sessions POST]', error);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// ─── PATCH /api/caisse/sessions — close session ───────────────────────────────
export async function PATCH(req: NextRequest) {
  let body: {
    date?: string;
    fond_compte: number;
    fond_theorique: number;
    fond_demain: number;
    montant_a_deposer: number;
  };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = makeClient();
  const date = body.date ?? todayDate();

  // Retrieve session to get fond_ouverture
  const { data: session } = await supabase
    .from('caisse_sessions')
    .select('fond_ouverture')
    .eq('date', date)
    .eq('statut', 'ouverte')
    .maybeSingle();

  // Recompute fond_theorique server-side for reliability
  let fondTheorique = body.fond_theorique;
  if (session?.fond_ouverture != null) {
    const { data: allReceipts } = await supabase
      .from('receipts')
      .select('total_amount, payment_method')
      .gte('created_at', `${date}T00:00:00`)
      .lte('created_at', `${date}T23:59:59`)
      .eq('status', 'completed');

    const cashIn = (allReceipts ?? []).reduce((sum, r) => {
      const amount = parseFloat(String(r.total_amount ?? 0));
      return sum + cashPortionOfReceipt(r.payment_method, amount);
    }, 0);

    const { data: cashExpenses } = await supabase
      .from('daily_expenses')
      .select('amount')
      .eq('expense_date', date)
      .in('payment_method', ['cash', 'Espèces']);

    const cashOut = (cashExpenses ?? []).reduce(
      (sum, e) => sum + parseFloat(String(e.amount ?? 0)),
      0
    );

    fondTheorique = session.fond_ouverture + cashIn - cashOut;
  }

  const ecart = body.fond_compte - fondTheorique;

  const { data, error } = await supabase
    .from('caisse_sessions')
    .update({
      heure_cloture: new Date().toISOString(),
      fond_compte: body.fond_compte,
      fond_theorique: fondTheorique,
      ecart,
      fond_demain: body.fond_demain,
      montant_a_deposer: body.montant_a_deposer,
      statut: 'cloturee',
      updated_at: new Date().toISOString(),
    })
    .eq('date', date)
    .eq('statut', 'ouverte')
    .select()
    .single();

  if (error) {
    console.error('[api/caisse/sessions PATCH]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
