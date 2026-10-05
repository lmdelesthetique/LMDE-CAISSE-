import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

// GET /api/client-portal/past-orders?subscriptionId=... — past orders with items
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const subscriptionId = searchParams.get('subscriptionId');
  const sessionToken = req.headers.get('x-session-token');

  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  const supabase = createAdminClient();
  const { data: orders, error: ordersErr } = await supabase
    .from('subscription_orders')
    .select('*')
    .eq('subscription_id', subscriptionId)
    .neq('status', 'open')
    .order('order_month', { ascending: false });

  if (ordersErr) return NextResponse.json({ error: ordersErr.message }, { status: 500 });
  if (!orders?.length) return NextResponse.json({ orders: [], items: {} });

  const ids = orders.map((o: any) => o.id);
  const { data: items, error: itemsErr } = await supabase
    .from('subscription_order_items')
    .select('*, product:products(id, name, image_url, sell_price_ttc, buy_price, description)')
    .in('order_id', ids);

  if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });

  const byOrder: Record<string, any[]> = {};
  for (const item of items ?? []) {
    if (!byOrder[item.order_id]) byOrder[item.order_id] = [];
    byOrder[item.order_id].push(item);
  }

  return NextResponse.json({ orders: orders ?? [], items: byOrder });
}
