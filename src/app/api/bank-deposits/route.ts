import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/bank-deposits?limit=20
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '20'), 100);
  const supabase = makeClient();

  const [{ data: deposits, error }, { data: monthData }] = await Promise.all([
    supabase
      .from('bank_deposits')
      .select('id, amount, date, reference, notes, cash_before, cash_after, created_by, created_at')
      .order('date', { ascending: false })
      .limit(limit),
    supabase
      .from('bank_deposits')
      .select('amount')
      .gte('date', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)),
  ]);

  if (error) {
    if (error.code === '42P01') {
      // Table doesn't exist yet — remind user to run migration
      return NextResponse.json({ deposits: [], monthTotal: 0, needsMigration: true });
    }
    console.error('[api/bank-deposits GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const monthTotal = (monthData ?? []).reduce((s, r) => s + parseFloat(String(r.amount ?? 0)), 0);

  return NextResponse.json({ deposits: deposits ?? [], monthTotal });
}

// POST /api/bank-deposits
export async function POST(req: NextRequest) {
  let body: {
    amount: number;
    date: string;
    reference?: string;
    notes?: string;
    cash_before?: number;
    cash_after?: number;
    created_by?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.amount || body.amount <= 0) {
    return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
  }

  const supabase = makeClient();

  console.log('=== SAVING BANK DEPOSIT ===', JSON.stringify(body));

  const { data, error } = await supabase
    .from('bank_deposits')
    .insert({
      amount: body.amount,
      date: body.date ?? new Date().toISOString().slice(0, 10),
      reference: body.reference || null,
      notes: body.notes || null,
      cash_before: body.cash_before ?? null,
      cash_after: body.cash_after ?? null,
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) {
    console.error('SAVE ERROR:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log('SAVED:', data);
  return NextResponse.json(data, { status: 201 });
}
