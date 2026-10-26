import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const PAGE = 1000;

async function fetchAllReceipts(supabase: any, start: string, end: string, employeeId?: string | null) {
  const all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from('receipts')
      .select('payment_method, total_amount, is_demo, client_name')
      .neq('status', 'cancelled')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (employeeId) q = q.eq('employee_id', employeeId);
    const { data, error } = await q;
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  const employeeId = searchParams.get('employeeId');

  const supabase = createAdminClient();
  const rawData = await fetchAllReceipts(supabase, start, end, employeeId);

  const data = rawData.filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });

  const normalizePM = (raw: string): string => {
    if (!raw) return 'Autre';
    const lower = raw.toLowerCase();
    if (lower.startsWith('mixte') || lower === 'mixed') return 'Mixte';
    if (lower.startsWith('espèces|') || lower.startsWith('especes|') || lower === 'espèces' || lower === 'especes' || lower === 'cash') return 'Espèces';
    if (lower === 'sumup (cb)' || lower === 'cb' || lower === 'card' || lower === 'sumup') return 'SumUp (CB)';
    if (lower === 'transfer' || lower === 'virement') return 'Virement';
    if (lower.startsWith('alma')) return 'Alma (3x/4x)';
    if (lower === 'paypal') return 'PayPal';
    if (lower === 'store_credit' || lower === 'avoir') return 'Avoir';
    return raw;
  };

  const byMethod: Record<string, number> = {};
  data.forEach((r: any) => {
    const m = normalizePM(r.payment_method ?? 'Autre');
    byMethod[m] = (byMethod[m] ?? 0) + (Number(r.total_amount) || 0);
  });

  const colors: Record<string, string> = {
    'SumUp (CB)': '#C4837A',
    'Espèces': '#D4A0A0',
    'Virement': '#8B6F6A',
    'Acompte': '#E8C4BE',
    'Mixte': '#BFA09C',
    'Alma (3x/4x)': '#A8C4D4',
    'PayPal': '#7B9EBF',
    'Avoir': '#B8CFA0',
    'Autre': '#C4A0A0',
  };

  const result = Object.entries(byMethod)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value, color: colors[name] ?? '#C4A0A0' }));

  return NextResponse.json(result);
}
