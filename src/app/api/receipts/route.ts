import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SESSION_COOKIE = 'app_session';

function isSessionValid(req: NextRequest): boolean {
  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value) return false;
  try {
    const { exp } = JSON.parse(atob(value)) as { exp: number };
    return Date.now() < exp;
  } catch {
    return false;
  }
}

// ─── GET /api/receipts — list with filters ────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isSessionValid(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const to = searchParams.get('to') ?? new Date().toISOString();
  const method = searchParams.get('method') ?? 'all';
  const status = searchParams.get('status') ?? 'all';
  const page = parseInt(searchParams.get('page') ?? '0', 10);
  const PAGE_SIZE = 50;

  const supabase = createAdminClient();
  let query = supabase
    .from('receipts')
    .select('id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status, cashier_name, discount_amount')
    .gte('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (method !== 'all') query = query.eq('payment_method', method);
  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[api/receipts GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}

// ─── POST /api/receipts — create receipt ──────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isSessionValid(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('receipts')
    .insert(body)
    .select('id, ticket_number')
    .single();

  if (error) {
    console.error('[api/receipts POST]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, ticket_number: data.ticket_number }, { status: 201 });
}
