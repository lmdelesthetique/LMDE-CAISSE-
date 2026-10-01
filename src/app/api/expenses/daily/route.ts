import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET  /api/expenses/daily?date=YYYY-MM-DD
// POST /api/expenses/daily            — insert
// PATCH /api/expenses/daily?id=xxx    — update
// DELETE /api/expenses/daily?id=xxx   — delete

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');
  const supabase = createAdminClient();
  let q = supabase.from('daily_expenses').select('*').order('created_at', { ascending: true });
  if (date) q = q.eq('expense_date', date);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('daily_expenses').insert({
    expense_date: body.expense_date,
    amount: body.amount,
    category: body.category,
    payment_method: body.payment_method,
    note: body.note ?? null,
    performed_by: body.performed_by ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('daily_expenses').update({
    expense_date: body.expense_date,
    amount: body.amount,
    category: body.category,
    payment_method: body.payment_method,
    note: body.note ?? null,
    performed_by: body.performed_by ?? null,
  }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('daily_expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
