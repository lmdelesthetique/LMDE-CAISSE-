import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'Missing supplierId' }, { status: 400 });

  const supabase = makeAdminClient();
  const now = Date.now();
  const since90d = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d  = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. All products for this supplier
  const { data: products, error: prodError } = await supabase
    .from('products')
    .select('id, name, ref, image_url, stock, min_stock, buy_price')
    .eq('supplier_id', supplierId)
    .neq('is_suspended', true)
    .order('stock', { ascending: true })
    .limit(300);

  if (prodError) {
    console.error('[api/products/restock]', prodError.message);
    return NextResponse.json({ error: prodError.message }, { status: 500 });
  }

  if (!products || products.length === 0) return NextResponse.json({ items: [] });

  const productIds = products.map(p => p.id);

  // 2. POS receipts + Shopify movements over 90 days (same sources as stock page)
  const [{ data: receiptRows }, { data: shopifyMoves }] = await Promise.all([
    supabase
      .from('receipts')
      .select('items, created_at')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .neq('payment_type', 'avoir')
      .limit(200000),
    supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .eq('movement_type', 'sale')
      .gte('created_at', since90d)
      .in('product_id', productIds)
      .limit(100000),
  ]);

  // 3. Aggregate per product over 7/30/90d windows
  const idSet = new Set(productIds);
  const salesMap: Record<string, { s7: number; s30: number; s90: number }> = {};

  for (const receipt of receiptRows ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const pid = item.product_id as string;
      if (!pid || !idSet.has(pid) || item.is_free_price) continue;
      if (!salesMap[pid]) salesMap[pid] = { s7: 0, s30: 0, s90: 0 };
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      salesMap[pid].s90 += qty;
      if (createdAt >= since30d) salesMap[pid].s30 += qty;
      if (createdAt >= since7d)  salesMap[pid].s7  += qty;
    }
  }

  for (const m of shopifyMoves ?? []) {
    const pid = m.product_id as string;
    if (!pid || !idSet.has(pid)) continue;
    if (!salesMap[pid]) salesMap[pid] = { s7: 0, s30: 0, s90: 0 };
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    salesMap[pid].s90 += qty;
    if (createdAt >= since30d) salesMap[pid].s30 += qty;
    if (createdAt >= since7d)  salesMap[pid].s7  += qty;
  }

  // 4. Filter to low/zero stock, attach real sales, compute smart suggested qty
  const items = products
    .filter(p => p.stock === 0 || (p.min_stock != null && p.min_stock > 0 && p.stock < p.min_stock))
    .map(p => {
      const s = salesMap[p.id] ?? { s7: 0, s30: 0, s90: 0 };
      const deficit = Math.max(0, (p.min_stock ?? 0) - (p.stock ?? 0));
      // Suggested qty = fill back to min_stock + 1 week of sales buffer (based on 90d avg)
      const weeklyAvg = Math.ceil(s.s90 / 13);
      const suggestedQty = Math.max(1, deficit + weeklyAvg);
      return {
        id: p.id,
        productName: p.name,
        productRef: p.ref,
        productImageUrl: p.image_url,
        currentStock: p.stock ?? 0,
        minStock: p.min_stock ?? 0,
        buyPrice: p.buy_price ?? 0,
        sales7d: s.s7,
        sales30d: s.s30,
        sales90d: s.s90,
        suggestedQty,
      };
    })
    .sort((a, b) => {
      const ua = a.currentStock === 0 ? 0 : 1;
      const ub = b.currentStock === 0 ? 0 : 1;
      return ua !== ub ? ua - ub : b.sales90d - a.sales90d;
    });

  return NextResponse.json({ items });
}
