import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/products
// Returns all products + last 90 days of receipts + stock_movements_log
// using admin client (bypasses RLS).
export async function GET() {
  const supabase = createAdminClient();
  const now = Date.now();
  const since90d = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();

  const PAGE = 1000;

  // Fetch all products
  const products: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .order('name')
      .range(from, from + PAGE - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) break;
    products.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Fetch receipts last 90d
  const receipts: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('receipts')
      .select('items, created_at, is_demo, payment_type')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break; // non-fatal: sales data becomes 0
    if (!data?.length) break;
    receipts.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Fetch Shopify-originated sales from movements log last 90d
  const movements: any[] = [];
  from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .eq('movement_type', 'sale')
      .gte('created_at', since90d)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) break;
    if (!data?.length) break;
    movements.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json({ products, receipts, movements, since90d });
}
