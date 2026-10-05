import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

// POST /api/client-portal/reorder — batch insert order items from reorder
// Body: { orderId, items: [{ product_id, quantity, unit_buy_price, unit_sell_price, color_variant }] }
export async function POST(req: NextRequest) {
  const subscriptionId = req.headers.get('x-subscription-id');
  const sessionToken = req.headers.get('x-session-token');

  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  const body = await req.json().catch(() => null);
  if (!body?.orderId || !Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: 'orderId and items required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify order belongs to this subscription
  const { data: order } = await supabase
    .from('subscription_orders')
    .select('id, status, subscription_id')
    .eq('id', body.orderId)
    .maybeSingle();

  if (!order || order.subscription_id !== subscriptionId) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }
  if (order.status !== 'open') {
    return NextResponse.json({ error: 'Commande déjà confirmée' }, { status: 409 });
  }

  // Quota check
  const [subRes, existingRes] = await Promise.all([
    supabase
      .from('client_subscriptions')
      .select('subscription_plans!inner(quota_amount)')
      .eq('id', subscriptionId)
      .maybeSingle(),
    supabase
      .from('subscription_order_items')
      .select('product_id, quantity, unit_sell_price')
      .eq('order_id', body.orderId),
  ]);

  const quotaAmount: number = (subRes.data as any)?.subscription_plans?.quota_amount ?? 0;
  const existingSet = new Set((existingRes.data ?? []).map((i: any) => i.product_id));
  const currentTotal = (existingRes.data ?? []).reduce(
    (s: number, i: any) => s + i.unit_sell_price * i.quantity, 0
  );

  let remaining = quotaAmount > 0 ? quotaAmount - currentTotal : Infinity;
  const toInsert: any[] = [];

  for (const item of body.items) {
    if (!item.product_id) continue;
    if (existingSet.has(item.product_id)) continue;
    const price = item.unit_sell_price ?? 0;
    const qty = quotaAmount > 0 ? Math.min(item.quantity, Math.floor(remaining / price)) : item.quantity;
    if (qty < 1) continue;
    toInsert.push({
      order_id: body.orderId,
      product_id: item.product_id,
      quantity: qty,
      unit_buy_price: item.unit_buy_price ?? 0,
      unit_sell_price: price,
      total_sell_price: price * qty,
      color_variant: item.color_variant ?? null,
    });
    remaining -= price * qty;
  }

  if (toInsert.length === 0) {
    return NextResponse.json({ error: 'Quota insuffisant ou produits déjà dans la box.' }, { status: 422 });
  }

  const { data: inserted, error } = await supabase
    .from('subscription_order_items')
    .insert(toInsert)
    .select('*, product:products(id, name, image_url, sell_price_ttc, buy_price, description)');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ inserted: inserted ?? [] }, { status: 201 });
}
