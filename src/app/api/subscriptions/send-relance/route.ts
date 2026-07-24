import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STRIPE_PAYMENT_LINKS: Record<string, string> = {
  starter: 'https://buy.stripe.com/14A4gAdjtgy3cb89pJ7IY06',
  pro:     'https://buy.stripe.com/aFa28sdjt95B2Ay45p7IY08',
  elite:   'https://buy.stripe.com/6oUdRaa7h3Lh8YWeK37IY07',
};

function getStripePaymentLink(planName: string, email?: string | null): string | null {
  const lower = (planName ?? '').toLowerCase();
  for (const [key, url] of Object.entries(STRIPE_PAYMENT_LINKS)) {
    if (lower.includes(key)) return email ? `${url}?prefilled_email=${encodeURIComponent(email)}` : url;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId requis' }, { status: 400 });

    const supabase = createAdminClient();

    const { data: sub } = await supabase
      .from('client_subscriptions')
      .select('id, client_id, plan_id, status')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });

    const { data: client } = await supabase
      .from('clients')
      .select('first_name, email')
      .eq('id', sub.client_id)
      .maybeSingle();

    if (!client?.email) return NextResponse.json({ error: 'Email client manquant' }, { status: 400 });

    let planName = 'Box Beauté';
    let planPrice = 89;
    if (sub.plan_id) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('name, price')
        .eq('id', sub.plan_id)
        .maybeSingle();
      if (plan) { planName = plan.name ?? planName; planPrice = plan.price ?? planPrice; }
    }

    const firstName = client.first_name ?? 'toi';
    const paymentLink = getStripePaymentLink(planName, client.email) ?? '#';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Ton abonnement t'attend</title>
</head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1c1917;">
<div style="max-width:480px;margin:0 auto;padding:40px 24px;">

  <p style="font-size:13px;color:#9ca3af;margin:0 0 32px;text-transform:uppercase;letter-spacing:1px;">Le Monde de l'Esthetique</p>

  <h1 style="font-size:26px;font-weight:800;color:#1c1917;margin:0 0 8px;line-height:1.2;">
    ${firstName}, tu perds de l'argent.
  </h1>

  <p style="font-size:15px;color:#57534e;margin:0 0 28px;line-height:1.6;">
    Tu avais commencé ton inscription. Tu n'as pas encore finalisé.<br/>
    On comprend — la vie va vite. Mais voila ce que ca te coute :
  </p>

  <div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;padding:20px 24px;margin-bottom:28px;">
    <p style="margin:0 0 8px;font-size:14px;color:#7f1d1d;font-weight:700;">Sans abonnement, ce mois-ci :</p>
    <p style="margin:0 0 6px;font-size:14px;color:#991b1b;">3 commandes → 45 € de livraison partis.</p>
    <p style="margin:0 0 6px;font-size:14px;color:#991b1b;">1 cliente repoussée → 60 € de perdus.</p>
    <p style="margin:0;font-size:14px;color:#991b1b;font-weight:700;">Total : jusqu'a 105 € perdus ce mois.</p>
  </div>

  <div style="background:#f0fdf4;border-left:4px solid #22c55e;border-radius:4px;padding:20px 24px;margin-bottom:32px;">
    <p style="margin:0 0 8px;font-size:14px;color:#14532d;font-weight:700;">Avec ton abonnement ${planName} :</p>
    <p style="margin:0 0 6px;font-size:15px;color:#166534;font-weight:800;">${planPrice} €/mois → tu recois ${Math.round(planPrice * 1.24)} € de produits.</p>
    <p style="margin:0 0 6px;font-size:14px;color:#166534;">Tu choisis tout. On livre. C'est tout.</p>
    <p style="margin:0;font-size:13px;color:#4ade80;">Offre de lancement — places limitees.</p>
  </div>

  <div style="text-align:center;margin-bottom:32px;">
    <a href="${paymentLink}"
      style="display:inline-block;background:#ec4899;color:#fff;font-size:16px;font-weight:800;padding:18px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">
      Je finalise mon inscription maintenant
    </a>
    <p style="margin:10px 0 0;font-size:11px;color:#a8a29e;">Paiement securise — 2 minutes — resiliable a tout moment</p>
  </div>

  <div style="border-top:1px solid #f3f4f6;padding-top:20px;text-align:center;">
    <p style="font-size:13px;color:#78716c;margin:0 0 8px;">Une question ? Je reponds personnellement.</p>
    <a href="https://wa.me/262692000000"
      style="display:inline-block;background:#25D366;color:#fff;font-size:13px;font-weight:700;padding:10px 24px;border-radius:8px;text-decoration:none;">
      Ecrire a Christy sur WhatsApp
    </a>
    <p style="font-size:12px;color:#a8a29e;margin:16px 0 0;">Christy — Le Monde de l'Esthetique</p>
  </div>

</div>
</body>
</html>`;

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Christy - LMDE <noreply@lmdecaisse.com>";
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY manquante' }, { status: 500 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [client.email],
        subject: `${firstName}, ton abonnement te coute de l'argent`,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: (data as any).message ?? `Erreur envoi (${res.status})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentTo: client.email });
  } catch (e: any) {
    console.error('[send-relance]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
