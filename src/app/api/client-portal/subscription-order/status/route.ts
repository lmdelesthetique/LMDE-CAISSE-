import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export const runtime = 'nodejs';

// PATCH /api/client-portal/subscription-order/status
// Body: { orderId: string, subscriptionId: string, status?: 'cancelled' | 'open' | 'confirmed', shipping_mode?: 'delivery' | 'pickup' }
export async function PATCH(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { orderId, subscriptionId, status, shipping_mode, total_products_cost, total_sell_price, benefit_amount, shipping_cost } = body;
  if (!orderId) return NextResponse.json({ error: 'orderId required' }, { status: 400 });

  const authErr = await verifyClientSession(subscriptionId, request.headers.get('x-session-token'));
  if (authErr) return authErr;

  const supabase = createAdminClient();

  // Fetch the order (needed for ownership check and to know previous status for stock logic)
  const { data: orderRow } = await supabase
    .from('subscription_orders')
    .select('id, subscription_id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (!orderRow) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  if (subscriptionId) {
    if (orderRow.subscription_id !== subscriptionId) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

    // Guard status transitions: can't cancel/reopen orders already in preparation or shipped
    if (status && ['preparing', 'shipped', 'en_livraison'].includes(orderRow.status)) {
      return NextResponse.json({ error: 'Impossible de modifier une commande en cours de préparation ou expédiée.' }, { status: 409 });
    }
  }

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

      // If the order was previously confirmed, restore stock for each item
      if (orderRow.status === 'confirmed') {
        const { data: items } = await supabase
          .from('subscription_order_items')
          .select('product_id, quantity')
          .eq('order_id', orderId);
        if (items && items.length > 0) {
          await Promise.all(
            items.map((item: any) =>
              supabase.rpc('increment_product_stock', {
                p_product_id: item.product_id,
                p_qty: item.quantity,
              }).then(({ error: rpcErr }) => {
                if (rpcErr) {
                  // Fallback: manual increment if RPC not available
                  return supabase
                    .from('products')
                    .select('stock')
                    .eq('id', item.product_id)
                    .maybeSingle()
                    .then(({ data: prod }) => {
                      if (prod) {
                        return supabase
                          .from('products')
                          .update({ stock: (prod.stock ?? 0) + item.quantity })
                          .eq('id', item.product_id);
                      }
                    });
                }
              })
            )
          );
        }
      }
    } else if (status === 'confirmed') {
      if (total_products_cost !== undefined) updates.total_products_cost = total_products_cost;
      if (total_sell_price !== undefined) updates.total_sell_price = total_sell_price;
      if (benefit_amount !== undefined) updates.benefit_amount = benefit_amount;
      if (shipping_cost !== undefined) updates.shipping_cost = shipping_cost;

      // Fetch all items with current product stock
      const { data: items, error: itemsErr } = await supabase
        .from('subscription_order_items')
        .select('product_id, quantity, product:products(id, name, stock)')
        .eq('order_id', orderId);

      if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
      if (!items || items.length === 0) {
        return NextResponse.json({ error: 'Votre commande est vide. Ajoutez des produits avant de confirmer.' }, { status: 422 });
      }

      // Check stock availability for every item
      const outOfStock = items.filter((i: any) => {
        const available = i.product?.stock ?? 0;
        return available < i.quantity;
      });

      if (outOfStock.length > 0) {
        const names = outOfStock
          .map((i: any) => `${i.product?.name ?? 'Produit inconnu'} (stock: ${i.product?.stock ?? 0}, demandé: ${i.quantity})`)
          .join(', ');
        return NextResponse.json(
          {
            error: `Stock insuffisant pour : ${names}. Retirez ces produits de votre box avant de confirmer.`,
            outOfStockProducts: outOfStock.map((i: any) => ({ productId: i.product_id, name: i.product?.name })),
          },
          { status: 422 }
        );
      }

      // Decrement stock for each item using conditional update (atomic: only decrements if stock >= qty)
      const stockResults = await Promise.all(
        items.map(async (item: any) => {
          const { data: updated } = await supabase
            .from('products')
            .update({ stock: (item.product?.stock ?? 0) - item.quantity })
            .eq('id', item.product_id)
            .gte('stock', item.quantity)
            .select('id');
          return { productId: item.product_id, name: item.product?.name, decremented: (updated?.length ?? 0) > 0 };
        })
      );

      const failedDecrements = stockResults.filter((r) => !r.decremented);
      if (failedDecrements.length > 0) {
        // Another sale beat us to the stock — rollback any decrements that did succeed
        const succeededIds = stockResults.filter((r) => r.decremented).map((r) => r.productId);
        if (succeededIds.length > 0) {
          const itemMap = new Map(items.map((i: any) => [i.product_id, i.quantity]));
          await Promise.all(
            succeededIds.map((pid) =>
              supabase
                .from('products')
                .select('stock')
                .eq('id', pid)
                .maybeSingle()
                .then(({ data: prod }) => {
                  if (prod) {
                    return supabase
                      .from('products')
                      .update({ stock: (prod.stock ?? 0) + (itemMap.get(pid) ?? 0) })
                      .eq('id', pid);
                  }
                })
            )
          );
        }
        const failedNames = failedDecrements.map((r) => r.name ?? 'Produit inconnu').join(', ');
        return NextResponse.json(
          { error: `Stock épuisé entre-temps pour : ${failedNames}. Retirez ces produits et recommencez.` },
          { status: 422 }
        );
      }
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
