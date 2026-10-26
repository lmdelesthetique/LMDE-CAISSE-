import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  const employeeId = searchParams.get('employeeId');

  const supabase = createAdminClient();

  let query = supabase
    .from('receipts')
    .select('total_amount, created_at, is_demo, client_name')
    .neq('status', 'cancelled')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true })
    .limit(50000);

  if (employeeId) query = (query as any).eq('employee_id', employeeId);

  const { data: rawData } = await query;
  const data = (rawData ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });

  const byDay: Record<string, { revenue: number; transactions: number }> = {};
  data.forEach((r: any) => {
    const d = new Date(r.created_at);
    const key = `${d.getDate()} ${d.toLocaleString('fr-FR', { month: 'short' })}`;
    if (!byDay[key]) byDay[key] = { revenue: 0, transactions: 0 };
    byDay[key].revenue += Number(r.total_amount) || 0;
    byDay[key].transactions += 1;
  });

  const points = Object.entries(byDay).map(([date, v]) => ({ date, ...v }));
  return NextResponse.json(points);
}
