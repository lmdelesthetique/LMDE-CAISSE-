import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateInvoiceToken } from '@/lib/utils/invoiceToken';
import { sendNotifFournisseurLienFacture, getWhatsAppLink } from '@/lib/whatsappService';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, supplier_id')
    .eq('id', id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
  if (!order.supplier_id) return NextResponse.json({ error: 'Pas de fournisseur associé à cette commande' }, { status: 422 });

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('company_name, whatsapp, phone, email')
    .eq('id', order.supplier_id)
    .single();

  if (!supplier) return NextResponse.json({ error: 'Fournisseur introuvable' }, { status: 404 });

  const phone = supplier.whatsapp || supplier.phone;
  if (!phone) {
    return NextResponse.json({
      error: 'Aucun numéro WhatsApp/téléphone enregistré pour ce fournisseur',
    }, { status: 422 });
  }

  const token = await generateInvoiceToken(id);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';
  const depositLink = `${siteUrl}/depot-facture/${token}`;

  const result = await sendNotifFournisseurLienFacture(
    phone,
    supplier.company_name ?? 'Fournisseur',
    order.order_number ?? id,
    depositLink,
    supplier.email ?? undefined
  );

  // Always return the wa.me fallback link so the UI can offer manual sending
  const waLink = getWhatsAppLink(
    phone,
    `Hello ${supplier.company_name ?? 'Fournisseur'},\n\nPlease upload your invoice for order ${order.order_number} via this link:\n${depositLink}\n\nLe Monde de l'Esthétique`
  );

  if (!result.ok) {
    // Return 200 with waLink so the UI can open it as manual fallback
    return NextResponse.json({
      ok: false,
      error: result.error,
      waLink,
      phone,
    });
  }

  return NextResponse.json({ ok: true, provider: result.provider, waLink, phone });
}
