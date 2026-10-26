import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const isReal = (r: any) => {
  if (r.is_demo === true) return false;
  const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return cn !== 'CHRISTY LHOMME';
};

const sum = (data: any[]) =>
  data.filter(isReal).reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  const prevStart = searchParams.get('prevStart') ?? '';
  const prevEnd = searchParams.get('prevEnd') ?? '';
  const curMonthStart = searchParams.get('curMonthStart') ?? '';
  const curMonthEnd = searchParams.get('curMonthEnd') ?? '';
  const prevMonthStart = searchParams.get('prevMonthStart') ?? '';
  const prevMonthEnd = searchParams.get('prevMonthEnd') ?? '';
  const dayStart = searchParams.get('dayStart') ?? '';
  const dayEnd = searchParams.get('dayEnd') ?? '';
  const prevDayStart = searchParams.get('prevDayStart') ?? '';
  const prevDayEnd = searchParams.get('prevDayEnd') ?? '';
  const employeeId = searchParams.get('employeeId');

  const supabase = createAdminClient();

  const buildQuery = (s: string, e: string) => {
    let q = supabase
      .from('receipts')
      .select('total_amount, items_count, is_demo, client_name')
      .neq('status', 'cancelled')
      .gte('created_at', s)
      .lte('created_at', e)
      .limit(50000);
    if (employeeId) q = (q as any).eq('employee_id', employeeId);
    return q;
  };

  const [current, prev, day, prevDay, curMonth, prevMonth] = await Promise.all([
    buildQuery(start, end),
    buildQuery(prevStart, prevEnd),
    buildQuery(dayStart, dayEnd),
    buildQuery(prevDayStart, prevDayEnd),
    buildQuery(curMonthStart, curMonthEnd),
    buildQuery(prevMonthStart, prevMonthEnd),
  ]);

  const realDay = (day.data ?? []).filter(isReal);
  const realPrevDay = (prevDay.data ?? []).filter(isReal);

  return NextResponse.json({
    caMain: Math.round(sum(current.data ?? []) * 100) / 100,
    caPrev: Math.round(sum(prev.data ?? []) * 100) / 100,
    caDay: Math.round(sum(day.data ?? []) * 100) / 100,
    caDayPrev: Math.round(sum(prevDay.data ?? []) * 100) / 100,
    salesDay: realDay.length,
    salesDayPrev: realPrevDay.length,
    caCurrentMonth: Math.round(sum(curMonth.data ?? []) * 100) / 100,
    caPrevMonth: Math.round(sum(prevMonth.data ?? []) * 100) / 100,
  });
}
