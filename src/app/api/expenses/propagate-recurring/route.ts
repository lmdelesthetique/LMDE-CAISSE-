import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  // Target months to propagate to — defaults to current + next month
  const targetMonths: string[] = body.months ?? ['2026-08', '2026-09'];

  const supabase = makeAdminClient();

  // Fetch all recurring fixed expenses
  const { data: recurring, error: fetchErr } = await supabase
    .from('business_expenses')
    .select('*')
    .eq('is_recurring', true)
    .eq('category', 'fixed_monthly');

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!recurring || recurring.length === 0) {
    return NextResponse.json({ created: 0, skipped: 0, message: 'Aucun frais fixe récurrent trouvé.' });
  }

  // Fetch all existing expenses for the target months to check duplicates
  const firstMonth = targetMonths[0];
  const lastMonth = targetMonths[targetMonths.length - 1];
  const { data: existing } = await supabase
    .from('business_expenses')
    .select('label, expense_date')
    .gte('expense_date', `${firstMonth}-01`)
    .lte('expense_date', `${lastMonth}-31`);

  // Build a Set of "month|label" pairs that already exist
  const existingSet = new Set<string>();
  (existing || []).forEach((e: { label: string; expense_date: string }) => {
    const month = e.expense_date.slice(0, 7);
    existingSet.add(`${month}|${e.label}`);
  });

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const month of targetMonths) {
    for (const expense of recurring) {
      const key = `${month}|${expense.label}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      const day = String(expense.recurrence_day || 1).padStart(2, '0');
      toInsert.push({
        category: expense.category,
        expense_type: expense.expense_type,
        label: expense.label,
        amount: expense.amount,
        expense_date: `${month}-${day}`,
        payment_method: expense.payment_method,
        note: expense.note ?? null,
        is_recurring: true,
        recurrence_day: expense.recurrence_day ?? null,
      });
      existingSet.add(key); // prevent duplication within the same run
    }
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ created: 0, skipped, message: 'Toutes les dépenses existent déjà.' });
  }

  const { data: inserted, error: insertErr } = await supabase
    .from('business_expenses')
    .insert(toInsert)
    .select('id');

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  return NextResponse.json({
    created: inserted?.length ?? 0,
    skipped,
    months: targetMonths,
  });
}
