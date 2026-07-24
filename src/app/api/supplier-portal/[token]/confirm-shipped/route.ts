import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — supplier confirms they have shipped the order
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  // Validate token
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('id, company_name')
    .eq('portal_login', params.token)
    .maybeSingle();

  if (supErr || !supplier) return NextResponse.json({ error: 'Token invalide' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const orderId = body?.orderId;
  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 });

  // Verify the order belongs to this supplier
  const { data: order, error: orderErr } = await supabase
    .from('fo_orders')
    .select('id, order_number, order_status, supplier_id')
    .eq('id', orderId)
    .eq('supplier_id', supplier.id)
    .maybeSingle();

  if (orderErr || !order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

  // Only allow shipping from certain statuses
  const shippableStatuses = ['sent', 'in_preparation', 'in_production', 'ready_to_ship'];
  if (!shippableStatuses.includes(order.order_status)) {
    return NextResponse.json({ error: `Statut actuel "${order.order_status}" ne permet pas de confirmer l'expédition` }, { status: 400 });
  }

  // Update order status to shipped
  const { error: updateErr } = await supabase
    .from('fo_orders')
    .update({ order_status: 'shipped', updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Add history entry (non-blocking)
  supabase.from('fo_order_status_history').insert({
    order_id: orderId,
    status: 'shipped',
    changed_by: supplier.company_name,
    comment: 'Expédition confirmée par le fournisseur via le portail',
    changed_at: new Date().toISOString(),
  });  // eslint-disable-line @typescript-eslint/no-floating-promises

  // Post a message in the supplier chat to notify the admin (non-blocking)
  supabase.from('supplier_messages').insert({
    supplier_id: supplier.id,
    order_id: orderId,
    sender: 'supplier',
    content: `🚢 Commande ${order.order_number} expédiée ! Le fournisseur a confirmé l'expédition depuis le portail.`,
    message_type: 'text',
    is_read: false,
  });  // eslint-disable-line @typescript-eslint/no-floating-promises

  return NextResponse.json({ ok: true, orderNumber: order.order_number });
}
