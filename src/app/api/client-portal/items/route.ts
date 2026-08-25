import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

function getSession(req: NextRequest) {
  return {
    subscriptionId: req.headers.get('x-subscription-id'),
    sessionToken: req.headers.get('x-session-token'),
  };
}

// POST — add item to an order
export async function POST(req: NextRequest) {
  const { subscriptionId, sessionToken } = getSession(req);
  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { orderId, productId, quantity, unitBuyPrice, unitSellPrice, colorVariant } = body;
  if (!orderId || !productId || !quantity) {
    return NextResponse.json({ error: 'orderId, productId, quantity requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the order belongs to this subscription
  const { data: order } = await supabase
    .from('subscription_orders')
    .select('id, status, subscription_id')
    .eq('id', orderId)
    .maybeSingle();

  if (!order || order.subscription_id !== subscriptionId) {
    return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  }
  if (order.status !== 'open') {
    return NextResponse.json({ error: 'Commande déjà confirmée' }, { status: 409 });
  }

  // Server-side quota enforcement
  const [subRes, itemsRes] = await Promise.all([
    supabase
      .from('client_subscriptions')
      .select('subscription_plans!inner(quota_amount)')
      .eq('id', subscriptionId)
      .maybeSingle(),
    supabase
      .from('subscription_order_items')
      .select('quantity, unit_sell_price')
      .eq('order_id', orderId),
  ]);
  const quotaAmount: number = (subRes.data as any)?.subscription_plans?.quota_amount ?? 0;
  if (quotaAmount > 0) {
    const currentTotal = (itemsRes.data ?? []).reduce(
      (s: number, i: any) => s + i.unit_sell_price * i.quantity, 0
    );
    const addedCost = (unitSellPrice ?? 0) * quantity;
    if (currentTotal + addedCost > quotaAmount + 0.01) {
      const remaining = Math.max(0, quotaAmount - currentTotal);
      return NextResponse.json(
        { error: `Quota insuffisant. Reste ${remaining.toFixed(2)} €, produit ${addedCost.toFixed(2)} €.` },
        { status: 422 }
      );
    }
  }

  // Check if item already exists (increment qty) or insert new
  const { data: existing } = await supabase
    .from('subscription_order_items')
    .select('id, quantity, total_sell_price')
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .eq('color_variant', colorVariant ?? null)
    .maybeSingle();

  if (existing) {
    const newQty = existing.quantity + quantity;
    const newTotal = unitSellPrice * newQty;
    const { data: updated, error } = await supabase
      .from('subscription_order_items')
      .update({ quantity: newQty, total_sell_price: newTotal })
      .eq('id', existing.id)
      .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ item: updated });
  }

  const { data: inserted, error } = await supabase
    .from('subscription_order_items')
    .insert({
      order_id: orderId,
      product_id: productId,
      quantity,
      unit_buy_price: unitBuyPrice ?? 0,
      unit_sell_price: unitSellPrice,
      total_sell_price: unitSellPrice * quantity,
      color_variant: colorVariant ?? null,
    })
    .select('*, product:products(id, name, image_url, sell_price_ttc, description)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: inserted }, { status: 201 });
}

// PATCH — update quantity of an existing item
export async function PATCH(req: NextRequest) {
  const { subscriptionId, sessionToken } = getSession(req);
  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { itemId, quantity, unitSellPrice } = body;
  if (!itemId || quantity == null) {
    return NextResponse.json({ error: 'itemId et quantity requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify item belongs to this subscription via order
  const { data: item } = await supabase
    .from('subscription_order_items')
    .select('id, order_id, subscription_orders!inner(subscription_id, status)')
    .eq('id', itemId)
    .maybeSingle();

  const order = (item as any)?.subscription_orders;
  if (!item || order?.subscription_id !== subscriptionId) {
    return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
  }
  if (order?.status !== 'open') {
    return NextResponse.json({ error: 'Commande déjà confirmée' }, { status: 409 });
  }

  const { error } = await supabase
    .from('subscription_order_items')
    .update({ quantity, total_sell_price: (unitSellPrice ?? 0) * quantity })
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — remove an item
export async function DELETE(req: NextRequest) {
  const { subscriptionId, sessionToken } = getSession(req);
  const authErr = await verifyClientSession(subscriptionId, sessionToken);
  if (authErr) return authErr;

  const itemId = req.nextUrl.searchParams.get('itemId');
  if (!itemId) return NextResponse.json({ error: 'itemId requis' }, { status: 400 });

  const supabase = createAdminClient();

  // Verify ownership
  const { data: item } = await supabase
    .from('subscription_order_items')
    .select('id, order_id, subscription_orders!inner(subscription_id, status)')
    .eq('id', itemId)
    .maybeSingle();

  const order = (item as any)?.subscription_orders;
  if (!item || order?.subscription_id !== subscriptionId) {
    return NextResponse.json({ error: 'Article introuvable' }, { status: 404 });
  }
  if (order?.status !== 'open') {
    return NextResponse.json({ error: 'Commande déjà confirmée' }, { status: 409 });
  }

  const { error } = await supabase
    .from('subscription_order_items')
    .delete()
    .eq('id', itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
