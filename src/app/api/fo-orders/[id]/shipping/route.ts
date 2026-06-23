import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const orderId = params.id;
  try {
    const { supplierId, shippingCarrier, shippingCost } = await req.json();
    if (!supplierId || shippingCost === undefined) {
      return NextResponse.json({ error: 'supplierId et shippingCost requis' }, { status: 400 });
    }

    const supabase = makeAdminClient();

    // Verify order belongs to this supplier
    const { data: order, error: orderError } = await supabase
      .from('fo_orders')
      .select('id, order_status, supplier_id')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    }

    if (order.supplier_id !== supplierId) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });
    }

    await supabase
      .from('fo_orders')
      .update({
        transport_cost: Number(shippingCost),
        transport_method: shippingCarrier || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    try {
      await supabase.from('fo_order_history').insert({
        order_id: orderId,
        action: 'shipping_updated',
        notes: `Frais d'expédition: ${Number(shippingCost).toFixed(2)} € via ${shippingCarrier || 'non spécifié'}`,
        created_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
