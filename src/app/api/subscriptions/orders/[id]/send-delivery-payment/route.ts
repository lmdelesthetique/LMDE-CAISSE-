import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsApp } from '@/lib/whatsappService';

const STRIPE_DELIVERY_LINK = 'https://buy.stripe.com/00wfZi5R16Xt4IGeK37IY09';

const DEST_LABEL: Record<string, string> = {
  martinique: 'Martinique',
  guadeloupe: 'Guadeloupe',
  guyane: 'Guyane',
  france: 'France métropolitaine',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createAdminClient();

    const { data: order } = await supabase
      .from('subscription_orders')
      .select('id, subscription_id, delivery_destination, delivery_address, delivery_payment_sent')
      .eq('id', params.id)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });
    if (order.delivery_payment_sent) return NextResponse.json({ ok: true, alreadySent: true });

    const { data: sub } = await supabase
      .from('client_subscriptions')
      .select('id, client_id, portal_phone, launch_offer, plan:subscription_plans(shipping_free)')
      .eq('id', order.subscription_id)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });

    const plan = Array.isArray((sub as any).plan) ? (sub as any).plan[0] : (sub as any).plan;
    if (plan?.shipping_free || (sub as any).launch_offer) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('first_name, email')
      .eq('id', (sub as any).client_id)
      .maybeSingle();

    const firstName = (client as any)?.first_name ?? 'Abonnée';
    const phone = (sub as any).portal_phone as string | null;
    const dest = DEST_LABEL[order.delivery_destination ?? ''] ?? order.delivery_destination ?? 'votre adresse';

    // WhatsApp
    if (phone) {
      const waMsg = `Bonjour ${firstName} ! 📦\n\nVotre box beauté LMDE est prête pour expédition vers ${dest}.\n\nPour finaliser votre commande, veuillez régler les frais de livraison (8€) via ce lien sécurisé :\n${STRIPE_DELIVERY_LINK}\n\nMerci et à très vite 💅`;
      await sendWhatsApp({ to: phone, message: waMsg }).catch(() => {});
    }

    // Email
    const email = (client as any)?.email as string | null;
    if (email) {
      const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><title>Frais de livraison</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);padding:32px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Frais de livraison 📦</h1>
  </div>
  <div style="padding:32px 36px;">
    <p style="font-size:15px;color:#44403c;margin:0 0 16px;">Bonjour ${firstName} 💅</p>
    <p style="font-size:14px;color:#57534e;margin:0 0 24px;">Votre box beauté est en préparation pour expédition vers <strong>${dest}</strong>.</p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Frais de livraison (unique)</p>
      <p style="margin:0;font-size:36px;font-weight:700;color:#ec4899;">8,00 €</p>
    </div>
    <a href="${STRIPE_DELIVERY_LINK}" style="display:block;text-align:center;background:#ec4899;color:#fff;font-size:15px;font-weight:700;padding:16px 24px;border-radius:12px;text-decoration:none;">💳 Payer les frais de livraison →</a>
    <p style="font-size:11px;color:#a8a29e;text-align:center;margin:10px 0 0;">Paiement sécurisé via Stripe</p>
  </div>
  <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthétique 💅</p>
  </div>
</div>
</body></html>`;

      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: 'Frais de livraison de votre box LMDE — 8 €',
            html,
          }),
        }).catch(() => {});
      }
    }

    await supabase.from('subscription_orders').update({ delivery_payment_sent: true }).eq('id', params.id);

    return NextResponse.json({ ok: true, sent: true });
  } catch (e: any) {
    console.error('[send-delivery-payment]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
