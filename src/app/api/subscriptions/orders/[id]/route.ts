import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncColorStocksToTotal } from '@/lib/utils/syncColorStock';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createAdminClient();

    const allowed = [
      'status', 'delivery_destination', 'delivery_address',
      'delivery_payment_sent', 'linked_expedition_id', 'linked_delivery_id', 'notified_at',
      'statut_livraison', 'shipping_mode', 'delivery_id',
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    // If admin cancels a confirmed order, restore stock with logging
    if (body.status === 'cancelled') {
      const { data: currentOrder } = await supabase
        .from('subscription_orders')
        .select('status')
        .eq('id', id)
        .maybeSingle();

      if (currentOrder?.status === 'confirmed') {
        const { data: items } = await supabase
          .from('subscription_order_items')
          .select('product_id, quantity, product:products(id, name, stock)')
          .eq('order_id', id);

        if (items && items.length > 0) {
          await Promise.all(
            items.map(async (item: any) => {
              const prod = item.product;
              if (!prod) return;
              const stockBefore = Number(prod.stock ?? 0);
              const newStock = stockBefore + item.quantity;
              await supabase.from('products')
                .update({ stock: newStock, updated_at: new Date().toISOString() })
                .eq('id', item.product_id);
              await syncColorStocksToTotal(supabase, item.product_id, newStock);
              await supabase.from('stock_movements_log').insert({
                product_id: item.product_id,
                product_name: prod.name,
                movement_type: 'entry',
                quantity_before: stockBefore,
                quantity_after: newStock,
                quantity_change: item.quantity,
                reason: `Annulation box admin — commande ${id}`,
                performed_by: 'Admin',
                source: 'subscription',
                reference: `box_admin_cancel_${id}`,
              }).then(({ error: le }) => { if (le) console.error('[sub-orders admin cancel]', le.message); });
            })
          );
        }
      }
    }

    const { error } = await supabase
      .from('subscription_orders')
      .update(updateData)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
