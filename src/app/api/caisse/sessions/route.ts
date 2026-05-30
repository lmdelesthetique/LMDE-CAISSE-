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

// ─── GET /api/caisse/sessions?date=YYYY-MM-DD ─────────────────────────────────
// Returns today's open session or null
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
    // Table might not exist yet
    if (error.code === '42P01') return NextResponse.json(null);
    console.error('[api/caisse/sessions GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) return NextResponse.json(null);

  // Compute live cash drawer
  const { data: cashReceipts } = await supabase
    .from('receipts')
    .select('total_amount')
    .gte('created_at', `${date}T00:00:00`)
    .lte('created_at', `${date}T23:59:59`)
    .in('payment_method', ['Espèces', 'cash', 'Mixte', 'mixed'])
    .eq('status', 'completed');

  const cashIn = (cashReceipts ?? []).reduce(
    (s: number, r: { total_amount: number }) => s + parseFloat(String(r.total_amount ?? 0)),
    0
  );

  return NextResponse.json({ ...data, cash_in_today: cashIn });
}

// ─── POST /api/caisse/sessions — open session ─────────────────────────────────
export async function POST(req: NextRequest) {
  let body: { fond_ouverture: number; fond_detail?: Record<string, number>; caissier_name?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = makeClient();
  const date = todayDate();

  // Check if session already exists
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
  const ecart = body.fond_compte - body.fond_theorique;

  const { data, error } = await supabase
    .from('caisse_sessions')
    .update({
      heure_cloture: new Date().toISOString(),
      fond_compte: body.fond_compte,
      fond_theorique: body.fond_theorique,
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
