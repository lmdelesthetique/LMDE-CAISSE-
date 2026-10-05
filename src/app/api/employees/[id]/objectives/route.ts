import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const year = req.nextUrl.searchParams.get('year');
  const month = req.nextUrl.searchParams.get('month');
  const supabase = createAdminClient();

  let q = supabase
    .from('employee_objectives')
    .select('*')
    .eq('employee_id', id)
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  if (year) q = q.eq('year', parseInt(year));
  if (month) q = q.eq('month', parseInt(month));

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('employee_objectives')
    .upsert(
      {
        employee_id: id,
        year: body.year,
        month: body.month,
        target_revenue: body.targetRevenue ?? body.target_revenue ?? 0,
        target_tickets: body.targetTickets ?? body.target_tickets ?? 0,
        notes: body.notes ?? null,
      },
      { onConflict: 'employee_id,year,month' }
    )
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
