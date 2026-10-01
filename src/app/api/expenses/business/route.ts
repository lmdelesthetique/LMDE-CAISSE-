import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/expenses/business — insert into business_expenses
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('business_expenses').insert({
    category: body.category ?? 'daily',
    expense_type: body.expense_type ?? 'other',
    label: body.label ?? '',
    amount: body.amount,
    expense_date: body.expense_date,
    payment_method: body.payment_method ?? 'other',
    note: body.note ?? null,
    is_recurring: body.is_recurring ?? false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
