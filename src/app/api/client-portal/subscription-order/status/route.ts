import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// PATCH /api/client-portal/subscription-order/status
// Body: { orderId: string, status: 'cancelled' | 'open' }
export async function PATCH(request: Request) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { orderId, status, shipping_mode, total_products_cost, total_sell_price, benefit_amount, shipping_cost } = body;
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const supabase = createAdminClient();
  const updates: Record<string, any> = {};

  // shipping_mode-only update (no status change required)
  if (shipping_mode !== undefined) {
    if (!['delivery', 'pickup'].includes(shipping_mode)) return NextResponse.json({ error: 'Invalid shipping_mode' }, { status: 400 });
    updates.shipping_mode = shipping_mode;
  }

  if (status !== undefined) {
    if (!['cancelled', 'open', 'confirmed'].includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    updates.status = status;
    if (status === 'cancelled') {
      updates.total_products_cost = null;
      updates.total_sell_price = null;
      updates.benefit_amount = null;
    } else if (status === 'confirmed') {
      if (total_products_cost !== undefined) updates.total_products_cost = total_products_cost;
      if (total_sell_price !== undefined) updates.total_sell_price = total_sell_price;
      if (benefit_amount !== undefined) updates.benefit_amount = benefit_amount;
      if (shipping_cost !== undefined) updates.shipping_cost = shipping_cost;
    }
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { error } = await supabase
    .from('subscription_orders')
    .update(updates)
    .eq('id', orderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
