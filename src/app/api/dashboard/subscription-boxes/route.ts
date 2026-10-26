import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderMonth = searchParams.get('month') ?? new Date().toISOString().slice(0, 7);

  const supabase = createAdminClient();

  // Fetch orders
  const { data: orders, error: ordersErr } = await supabase
    .from('subscription_orders')
    .select('id, subscription_id, status, order_month, total_sell_price, benefit_amount, updated_at')
    .in('status', ['confirmed', 'preparing'])
    .eq('order_month', orderMonth)
    .order('updated_at', { ascending: false })
    .limit(30);

  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json([]);

  const orderIds = orders.map((o) => o.id);
  const subIds = orders.map((o) => o.subscription_id);

  // Fetch subscriptions with client and plan
  const { data: subs } = await supabase
    .from('client_subscriptions')
    .select('id, client:clients(id, first_name, last_name), plan:subscription_plans(name, price)')
    .in('id', subIds);

  // Fetch order items with product info
  const { data: allItems } = await supabase
    .from('subscription_order_items')
    .select('id, order_id, quantity, unit_sell_price, color_variant, product:products(id, name, image_url)')
    .in('order_id', orderIds);

  const subMap = new Map((subs ?? []).map((s: any) => [s.id, s]));
  const itemsByOrder = new Map<string, any[]>();
  for (const item of allItems ?? []) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, []);
    itemsByOrder.get(item.order_id)!.push(item);
  }

  const result = orders.map((o) => ({
    ...o,
    subscription: subMap.get(o.subscription_id) ?? null,
    items: itemsByOrder.get(o.id) ?? [],
  }));

  return NextResponse.json(result);
}
