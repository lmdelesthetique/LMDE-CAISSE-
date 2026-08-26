import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// ─── GET /api/receipts — list with filters ────────────────────────────────────
export async function GET(req: NextRequest) {
  console.log('[api/receipts GET] called');

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[api/receipts GET] client creation failed:', msg);
    return NextResponse.json({ error: msg, code: 'CLIENT_INIT_FAILED' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const from =
    searchParams.get('from') ??
    new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const to = searchParams.get('to') ?? new Date().toISOString();
  const method = searchParams.get('method') ?? 'all';
  const status = searchParams.get('status') ?? 'all';
  // all=true bypasses pagination — used for KPI aggregations
  const allMode = searchParams.get('all') === 'true';
  const page = parseInt(searchParams.get('page') ?? '0', 10);
  const PAGE_SIZE = 2000; // high enough for any realistic period

  console.log('[api/receipts GET] querying from:', from, 'to:', to, 'allMode:', allMode);

  const baseSelect = 'id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status, cashier_name, discount_amount, is_demo';
  const fallbackSelect = 'id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status, cashier_name, discount_amount';

  const buildQuery = (selectCols: string) => {
    let q = supabase
      .from('receipts')
      .select(selectCols)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE);
    if (!allMode) q = q.range(page * 50, (page + 1) * 50 - 1);
    if (method !== 'all') q = q.eq('payment_method', method);
    if (status !== 'all') q = q.eq('status', status);
    return q;
  };

  let { data, error } = await buildQuery(baseSelect);

  // If is_demo column doesn't exist yet (migration pending), retry without it
  if (error?.code === '42703' || (error && error.message?.includes('is_demo'))) {
    console.warn('[api/receipts GET] is_demo column missing, falling back');
    ({ data, error } = await buildQuery(fallbackSelect));
  }

  if (error) {
    console.error('[api/receipts GET] Supabase error:', error.code, error.message, error.details);
    return NextResponse.json(
      {
        error: error.message,
        code: error.code || 'QUERY_ERROR',
        details: error.details,
        hint: error.hint,
      },
      { status: 500 }
    );
  }

  console.log('[api/receipts GET] returned', data?.length ?? 0, 'rows');
  return NextResponse.json(data ?? []);
}

// ─── POST /api/receipts — create receipt ──────────────────────────────────────
export async function POST(req: NextRequest) {
  console.log('[api/receipts POST] called');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, code: 'CLIENT_INIT_FAILED' }, { status: 500 });
  }

  // Validation : un ticket doit avoir un montant positif
  const totalAmount = Number(body.total_amount ?? body.totalAmount ?? 0);
  if (!totalAmount || totalAmount < 0) {
    return NextResponse.json({ error: 'total_amount requis et doit être ≥ 0' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('receipts')
    .insert(body)
    .select('id, ticket_number')
    .single();

  if (error) {
    console.error('[api/receipts POST] Supabase error:', error.code, error.message);
    return NextResponse.json(
      { error: error.message, code: error.code || 'INSERT_ERROR', details: error.details },
      { status: 500 }
    );
  }

  console.log('[api/receipts POST] saved receipt id:', data.id, 'ticket:', data.ticket_number);
  return NextResponse.json({ id: data.id, ticket_number: data.ticket_number }, { status: 201 });
}
