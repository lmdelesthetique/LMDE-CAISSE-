import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const key = serviceKey || anonKey;
  if (!key) throw new Error('No Supabase key configured');

  if (!serviceKey) {
    console.warn('[api/receipts] SUPABASE_SERVICE_ROLE_KEY missing — falling back to anon key');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── GET /api/receipts — list with filters ────────────────────────────────────
export async function GET(req: NextRequest) {
  console.log('[api/receipts GET] called');

  let supabase;
  try {
    supabase = makeClient();
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
  const page = parseInt(searchParams.get('page') ?? '0', 10);
  const PAGE_SIZE = 50;

  console.log('[api/receipts GET] querying from:', from, 'to:', to);

  let query = supabase
    .from('receipts')
    .select(
      'id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status, cashier_name, discount_amount'
    )
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (method !== 'all') query = query.eq('payment_method', method);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;

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
    supabase = makeClient();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, code: 'CLIENT_INIT_FAILED' }, { status: 500 });
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
