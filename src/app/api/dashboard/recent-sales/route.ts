import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const start = searchParams.get('start') ?? '';

  const supabase = createAdminClient();

  const { data: rawRecent } = await supabase
    .from('receipts')
    .select('id, total_amount, payment_method, client_name, items_count, created_at, ticket_number, is_demo')
    .not('status', 'eq', 'cancelled')
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(30);

  const data = (rawRecent ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  }).slice(0, 8);

  const sales = data.map((r: any) => {
    const d = new Date(r.created_at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      id: r.ticket_number ?? r.id,
      time: `${hh}:${mm}`,
      client: r.client_name || 'Client',
      amount: Number(r.total_amount) || 0,
      method: r.payment_method || '',
      items: Number(r.items_count) || 0,
    };
  });

  return NextResponse.json(sales);
}
