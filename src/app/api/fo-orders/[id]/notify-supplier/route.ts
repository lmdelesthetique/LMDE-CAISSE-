import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function cleanPhone(raw: string): string {
  let p = raw.replace(/[\s\-().+]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.startsWith('0') && p.length === 10) {
    if (/^069[0-9]/.test(p) || /^0596/.test(p)) p = '596' + p.slice(1);
    else p = '33' + p.slice(1);
  }
  return p;
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const supabase = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';

  // Fetch order + supplier in parallel
  const [{ data: order }, ] = await Promise.all([
    supabase.from('fo_orders')
      .select('id, order_number, supplier_id, order_status, subtotal, currency, total_real_cost')
      .eq('id', id)
      .single(),
  ]);

  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  if (!order.supplier_id) return NextResponse.json({ error: 'Pas de fournisseur associé' }, { status: 422 });

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('company_name, whatsapp, phone, portal_login')
    .eq('id', order.supplier_id)
    .single();

  if (!supplier) return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });

  const phone = supplier.whatsapp || supplier.phone;

  // Build portal link (token-based if available, fallback generic)
  const portalLink = supplier.portal_login
    ? `${siteUrl}/supplier-portal/${supplier.portal_login}`
    : `${siteUrl}/supplier-portal/login`;

  // Post a system message in the supplier's chat thread
  const orderCardContent = [
    `📦 Nouvelle commande : ${order.order_number}`,
    `Montant estimé : ${(order.total_real_cost ?? order.subtotal ?? 0).toFixed(2)} ${order.currency ?? 'EUR'}`,
    ``,
    `Merci de consulter votre espace pour valider et déposer votre facture.`,
    `👉 ${portalLink}`,
  ].join('\n');

  await supabase.from('supplier_messages').insert({
    supplier_id: order.supplier_id,
    sender: 'store',
    sender_type: 'admin',
    content: orderCardContent,
    message_type: 'order_card',
    order_id: id,
    is_read: false,
  });

  // Update order status to 'sent' if still draft
  if (order.order_status === 'draft') {
    await supabase.from('fo_orders').update({ order_status: 'sent' }).eq('id', id);
    try {
      await supabase.from('fo_status_history').insert({
        order_id: id,
        old_status: 'draft',
        new_status: 'sent',
        changed_by: 'Admin',
        comment: 'Commande envoyée au fournisseur',
        changed_at: new Date().toISOString(),
      });
    } catch { /* non-blocking */ }
  }

  // Build wa.me link for admin to send manually from their phone
  let waLink: string | null = null;
  if (phone) {
    const cleanedPhone = cleanPhone(phone);
    const waMsg = encodeURIComponent(
      `Bonjour ${supplier.company_name ?? 'Fournisseur'} 👋\n\nNous avons une nouvelle commande pour vous : ${order.order_number}.\n\nMerci de consulter votre espace commandes et de déposer votre facture :\n👉 ${portalLink}\n\nLe Monde de l'Esthétique 💅`
    );
    waLink = `https://wa.me/${cleanedPhone}?text=${waMsg}`;
  }

  return NextResponse.json({ ok: true, waLink, portalLink });
}
