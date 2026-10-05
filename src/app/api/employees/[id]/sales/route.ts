import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const supabase = createAdminClient();

  // Get employee name for cashier_name fallback
  const { data: emp } = await supabase
    .from('employees')
    .select('first_name, last_name')
    .eq('id', id)
    .maybeSingle();
  const fullName = emp ? `${emp.first_name ?? ''} ${emp.last_name ?? ''}`.trim() : null;

  let q = supabase
    .from('receipts')
    .select('id, employee_id, ticket_number, total_amount, discount_amount, items_count, payment_method, status, client_id, created_at, cashier_name')
    .order('created_at', { ascending: false });

  if (fullName) {
    q = q.or(`employee_id.eq.${id},cashier_name.eq.${fullName}`);
  } else {
    q = q.eq('employee_id', id);
  }
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
