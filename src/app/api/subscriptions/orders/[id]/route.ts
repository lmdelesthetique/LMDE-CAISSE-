import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = createAdminClient();

    const allowed = [
      'status', 'delivery_destination', 'delivery_address',
      'delivery_payment_sent', 'linked_expedition_id', 'linked_delivery_id', 'notified_at',
      'statut_livraison', 'shipping_mode',
    ];
    const updateData: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updateData[key] = body[key];
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    // If admin cancels an order that was confirmed, restore stock
    if (body.status === 'cancelled') {
      const { data: currentOrder } = await supabase
        .from('subscription_orders')
        .select('status')
        .eq('id', id)
        .maybeSingle();

      if (currentOrder?.status === 'confirmed') {
        const { data: items } = await supabase
          .from('subscription_order_items')
          .select('product_id, quantity, product:products(stock)')
          .eq('order_id', id);

        if (items && items.length > 0) {
          await Promise.all(
            items.map(async (item: any) => {
              const currentStock = item.product?.stock ?? 0;
              return supabase
                .from('products')
                .update({ stock: currentStock + item.quantity })
                .eq('id', item.product_id);
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
