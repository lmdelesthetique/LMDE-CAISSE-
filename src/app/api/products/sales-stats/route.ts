import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function fetchAllPages<T>(
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

// GET /api/products/sales-stats?ids=id1,id2,id3
// Returns { [productId]: { s7, s30, s90 } } — same logic as stockService.ts
export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get('ids');
  if (!idsParam) return NextResponse.json({});

  const ids = idsParam.split(',').filter(Boolean);
  if (ids.length === 0) return NextResponse.json({});

  const supabase = makeAdminClient();
  const now = Date.now();
  const since90d = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d  = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();

  const [receiptRows, shopifyMoves] = await Promise.all([
    fetchAllPages<any>((from, to) =>
      supabase
        .from('receipts')
        .select('items, created_at')
        .gte('created_at', since90d)
        .neq('is_demo', true)
        .neq('payment_type', 'avoir')
        .order('created_at', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages<any>((from, to) =>
      supabase
        .from('stock_movements_log')
        .select('product_id, quantity_change, created_at')
        .eq('movement_type', 'sale')
        .gte('created_at', since90d)
        .in('product_id', ids)
        .order('created_at', { ascending: true })
        .range(from, to)
    ),
  ]);

  // Fetch current stock + min_stock for these products
  const { data: productRows } = await supabase
    .from('products')
    .select('id, stock, min_stock')
    .in('id', ids);
  const stockMap: Record<string, { stock: number; minStock: number }> = {};
  for (const p of productRows ?? []) {
    stockMap[p.id] = { stock: Number(p.stock) || 0, minStock: Number(p.min_stock) || 0 };
  }

  const idSet = new Set(ids);
  const salesMap: Record<string, { s7: number; s30: number; s90: number }> = {};

  // Source 1: POS receipts
  for (const receipt of receiptRows) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const id = item.product_id as string;
      if (!id || !idSet.has(id) || item.is_free_price) continue;
      if (!salesMap[id]) salesMap[id] = { s7: 0, s30: 0, s90: 0 };
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      salesMap[id].s90 += qty;
      if (createdAt >= since30d) salesMap[id].s30 += qty;
      if (createdAt >= since7d)  salesMap[id].s7  += qty;
    }
  }

  // Source 2: Shopify movements
  for (const m of shopifyMoves) {
    const id = m.product_id as string;
    if (!id || !idSet.has(id)) continue;
    if (!salesMap[id]) salesMap[id] = { s7: 0, s30: 0, s90: 0 };
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    salesMap[id].s90 += qty;
    if (createdAt >= since30d) salesMap[id].s30 += qty;
    if (createdAt >= since7d)  salesMap[id].s7  += qty;
  }

  // Merge sales + stock into one response
  const result: Record<string, { s7: number; s30: number; s90: number; stock: number; minStock: number }> = {};
  for (const id of ids) {
    const s = salesMap[id] ?? { s7: 0, s30: 0, s90: 0 };
    const st = stockMap[id] ?? { stock: 0, minStock: 0 };
    result[id] = { ...s, stock: st.stock, minStock: st.minStock };
  }

  return NextResponse.json(result);
}
