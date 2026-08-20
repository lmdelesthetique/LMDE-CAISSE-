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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. All products for this supplier (low stock OR zero stock OR all, to compute sales for all)
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

  // 2. Receipts from last 30 days — only fetch items JSONB (avoid large payload)
  const { data: receipts } = await supabase
    .from('receipts')
    .select('items')
    .gte('created_at', thirtyDaysAgo)
    .neq('status', 'cancelled');

  // 3. Aggregate sold qty per product_id from receipts items JSONB
  const salesMap: Record<string, number> = {};
  (receipts || []).forEach((r: any) => {
    if (!Array.isArray(r.items)) return;
    r.items.forEach((item: any) => {
      const pid = item.product_id || item.productId;
      if (!pid) return;
      // skip demo items (no is_demo flag on individual items, so we trust receipt-level filter)
      salesMap[pid] = (salesMap[pid] || 0) + (Number(item.qty) || Number(item.quantity) || 1);
    });
  });

  // 4. Filter to only low/zero stock, attach real sales data and compute smart suggested qty
  const items = products
    .filter(p => p.stock === 0 || (p.min_stock != null && p.min_stock > 0 && p.stock < p.min_stock))
    .map(p => {
      const sales30d = salesMap[p.id] ?? 0;
      const deficit = Math.max(0, (p.min_stock ?? 0) - (p.stock ?? 0));
      // Suggested qty = fill back to min_stock + 1 week of sales buffer
      const weeklyAvg = Math.ceil(sales30d / 4);
      const suggestedQty = Math.max(1, deficit + weeklyAvg);
      return {
        id: p.id,
        productName: p.name,
        productRef: p.ref,
        productImageUrl: p.image_url,
        currentStock: p.stock ?? 0,
        minStock: p.min_stock ?? 0,
        buyPrice: p.buy_price ?? 0,
        recentSales: sales30d,
        suggestedQty,
      };
    })
    .sort((a, b) => {
      // Rupture first, then low stock — within each group sort by sales desc
      const ua = a.currentStock === 0 ? 0 : 1;
      const ub = b.currentStock === 0 ? 0 : 1;
      return ua !== ub ? ua - ub : b.recentSales - a.recentSales;
    });

  return NextResponse.json({ items });
}
