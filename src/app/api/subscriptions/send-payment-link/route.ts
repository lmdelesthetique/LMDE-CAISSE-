import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Static Stripe Payment Links
const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  starter: 'https://buy.stripe.com/14A4gAdjtgy3cb89pJ7IY06',
  pro:     'https://buy.stripe.com/aFa28sdjt95B2Ay45p7IY08',
  elite:   'https://buy.stripe.com/6oUdRaa7h3Lh8YWeK37IY07',
};

function resolveStripePaymentLink(planName: string, email?: string | null): string | null {
  const lower = planName.toLowerCase();
  let baseUrl: string | null = null;
  for (const [key, url] of Object.entries(STRIPE_PAYMENT_LINKS)) {
    if (lower.includes(key)) { baseUrl = url; break; }
  }
  if (!baseUrl) return null;
  return email ? `${baseUrl}?prefilled_email=${encodeURIComponent(email)}` : baseUrl;
}

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId requis' }, { status: 400 });

    const supabase = createAdminClient();

    const { data: sub, error: subErr } = await supabase
      .from('client_subscriptions')
      .select('id, client_id, plan_id')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) {
      return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
    }

    const { data: client } = await supabase
      .from('clients')
      .select('first_name, last_name, email')
      .eq('id', sub.client_id)
      .maybeSingle();

    const email = client?.email;
    if (!email) return NextResponse.json({ error: 'Email du client introuvable dans la fiche' }, { status: 400 });

    const firstName = client?.first_name ?? 'Abonnée';

    let planName = 'Box Beauté';
    let planPrice = 0;
    if (sub.plan_id) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('name, price')
        .eq('id', sub.plan_id)
        .maybeSingle();
      if (plan) { planName = plan.name ?? 'Box Beauté'; planPrice = plan.price ?? 0; }
    }

    const amountStr = planPrice > 0 ? planPrice.toFixed(2).replace('.', ',') + ' €' : '—';
    const paymentUrl = resolveStripePaymentLink(planName, email);

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Paiement abonnement</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:32px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Paiement abonnement</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">${planName}</p>
  </div>
  <div style="padding:32px 36px;">
    <p style="font-size:15px;color:#44403c;margin:0 0 16px;">Bonjour ${firstName},</p>
    <p style="font-size:14px;color:#57534e;margin:0 0 24px;">Voici votre lien de paiement sécurisé pour votre abonnement <strong>${planName}</strong>.</p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
      <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Montant mensuel</p>
      <p style="margin:0;font-size:36px;font-weight:700;color:#ec4899;">${amountStr}</p>
      <p style="margin:6px 0 0;font-size:12px;color:#a8a29e;">${planName} - renouvelé chaque mois</p>
    </div>
    ${paymentUrl
      ? `<a href="${paymentUrl}" style="display:block;text-align:center;background:#ec4899;color:#fff;font-size:15px;font-weight:700;padding:16px 24px;border-radius:12px;text-decoration:none;">Payer et activer mon abonnement</a>
         <p style="font-size:11px;color:#a8a29e;text-align:center;margin:10px 0 0;">Paiement sécurisé via Stripe - Renouvellement automatique mensuel</p>`
      : `<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;text-align:center;">
           <p style="margin:0;font-size:13px;color:#92400e;">Pour procéder au paiement, contactez votre conseillère LMDE.</p>
         </div>`
    }
    <p style="font-size:12px;color:#a8a29e;text-align:center;margin:20px 0 0;">
      Une fois votre paiement validé, votre abonnement sera automatiquement activé.
    </p>
  </div>
  <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthetique</p>
  </div>
</div>
</body></html>`;

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY non configurée' }, { status: 500 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `Votre lien de paiement — ${planName}${planPrice > 0 ? ` (${amountStr}/mois)` : ''}`,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: (data as any).message ?? `Erreur envoi (${res.status})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, paymentUrl, sentTo: email });
  } catch (e: any) {
    console.error('[send-payment-link] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
