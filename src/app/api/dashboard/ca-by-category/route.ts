import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function fetchAll<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? 'month';

  // Use Martinique timezone (UTC-4) for correct month boundaries on Vercel
  const MTQ = '-04:00';
  const mtqNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Martinique' }));
  const yr = mtqNow.getFullYear(), mo = mtqNow.getMonth();
  let startDate: string;
  if (period === 'month') {
    startDate = `${yr}-${String(mo + 1).padStart(2, '0')}-01T00:00:00${MTQ}`;
  } else if (period === '3months') {
    const d = new Date(yr, mo - 3, 1);
    startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00${MTQ}`;
  } else {
    startDate = `${yr}-01-01T00:00:00${MTQ}`;
  }

  const supabase = makeClient();

  const [receipts, products] = await Promise.all([
    fetchAll<any>((from, to) =>
      supabase
        .from('receipts')
        .select('items, is_demo, client_name, total_amount')
        .eq('status', 'completed')
        .gte('created_at', startDate)
        .range(from, to)
    ),
    fetchAll<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name, category')
        .range(from, to)
    ),
  ]);

  const productMap = new Map<string, string>();
  for (const p of products) {
    if (p.id) productMap.set(String(p.id), p.category ?? 'Non catégorisé');
  }
  const productNameMap = new Map<string, string>();
  for (const p of products) {
    if (p.name) productNameMap.set(p.name.trim().toLowerCase(), p.category ?? 'Non catégorisé');
  }

  const categoryMap: Record<string, { revenue: number; qty: number }> = {};
  let grandTotal = 0;

  for (const receipt of receipts) {
    if (receipt.is_demo === true) continue;
    const cn = (receipt.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (cn === 'CHRISTY LHOMME') continue;

    const items = Array.isArray(receipt.items) ? receipt.items : [];

    if (items.length === 0) {
      // No item detail — count total under "Non ventilé"
      const amt = parseFloat(String(receipt.total_amount ?? 0));
      if (!categoryMap['Non ventilé']) categoryMap['Non ventilé'] = { revenue: 0, qty: 0 };
      categoryMap['Non ventilé'].revenue += amt;
      grandTotal += amt;
      continue;
    }

    // item.total is pre-discount; scale to match actual receipt.total_amount
    const rawItemTotal = items.reduce((s: number, i: any) => {
      const qty = Number(i?.qty ?? i?.quantity ?? 1);
      return s + (Number(i?.total ?? 0) || (Number(i?.price ?? 0) * qty));
    }, 0);
    const receiptTotal = parseFloat(String(receipt.total_amount ?? 0));
    const scaleFactor = rawItemTotal > 0 ? receiptTotal / rawItemTotal : 1;

    for (const item of items) {
      const pid = item?.product_id ?? item?.id;
      let cat: string = item?.category ?? '';

      if (!cat && pid) cat = productMap.get(String(pid)) ?? '';
      if (!cat && item?.name) cat = productNameMap.get(item.name.trim().toLowerCase()) ?? '';
      if (!cat) cat = 'Non catégorisé';

      const qty = Number(item?.qty ?? item?.quantity ?? 1);
      const rawLine = Number(item?.total ?? 0) || (Number(item?.price ?? 0) * qty);
      const lineTotal = rawLine * scaleFactor;

      if (!categoryMap[cat]) categoryMap[cat] = { revenue: 0, qty: 0 };
      categoryMap[cat].revenue += lineTotal;
      categoryMap[cat].qty += qty;
      grandTotal += lineTotal;
    }
  }

  const categories = Object.entries(categoryMap)
    .map(([name, { revenue, qty }]) => ({
      name,
      revenue: Math.round(revenue * 100) / 100,
      qty,
      pct: grandTotal > 0 ? Math.round((revenue / grandTotal) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json({ categories, total: Math.round(grandTotal * 100) / 100 });
}
