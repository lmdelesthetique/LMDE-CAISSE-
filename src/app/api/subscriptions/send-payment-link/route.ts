import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { subscriptionId } = await req.json();
  if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .select('id, client:client_id(first_name, last_name, email), plan:plan_id(name, price)')
    .eq('id', subscriptionId)
    .single();

  if (error || !sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  const client = Array.isArray(sub.client) ? sub.client[0] : sub.client as any;
  const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan as any;

  const email = client?.email;
  if (!email) return NextResponse.json({ error: 'Client email not found' }, { status: 400 });

  const firstName = client?.first_name ?? 'Abonnée';
  const planName = plan?.name ?? 'Box Beauté';
  const planPrice = (plan?.price ?? 0) as number;

  // Create Stripe payment link if key is configured
  let paymentUrl: string | null = null;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (stripeKey && !stripeKey.startsWith('your-')) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(stripeKey);

      const product = await stripe.products.create({ name: planName });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: Math.round(planPrice * 100),
        currency: 'eur',
      });
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
      });
      paymentUrl = link.url;
    } catch (err: any) {
      console.error('[send-payment-link] Stripe error:', err.message);
    }
  }

  const amountStr = planPrice.toFixed(2).replace('.', ',') + ' €';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Paiement de votre abonnement</title>
</head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:32px 36px;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">Paiement abonnement</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${planName}</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#44403c;margin:0 0 16px;">Bonjour ${firstName} 💅</p>
      <p style="font-size:14px;color:#57534e;margin:0 0 24px;">Voici votre lien de paiement pour renouveler votre abonnement <strong>${planName}</strong>.</p>

      <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:20px 24px;margin-bottom:28px;text-align:center;">
        <p style="margin:0 0 4px;font-size:13px;color:#9ca3af;">Montant à régler</p>
        <p style="margin:0;font-size:32px;font-weight:700;color:#ec4899;">${amountStr}</p>
        <p style="margin:6px 0 0;font-size:12px;color:#a8a29e;">${planName}</p>
      </div>

      ${paymentUrl ? `
      <a href="${paymentUrl}" style="display:block;text-align:center;background:#ec4899;color:#fff;font-size:14px;font-weight:700;padding:14px 24px;border-radius:12px;text-decoration:none;">
        💳 Payer maintenant →
      </a>
      ` : `
      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:16px 20px;text-align:center;">
        <p style="margin:0;font-size:13px;color:#92400e;">Pour procéder au paiement, contactez votre conseillère LMDE.</p>
      </div>
      `}

      <p style="font-size:12px;color:#a8a29e;text-align:center;margin:20px 0 0;">
        Ce lien est valable pour un usage unique. Contactez-nous en cas de problème.
      </p>
    </div>
    <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
      <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthétique 💅</p>
    </div>
  </div>
</body>
</html>`;

  const brevoKey = process.env.BREVO_API_KEY;
  if (!brevoKey) return NextResponse.json({ error: 'BREVO_API_KEY not configured' }, { status: 500 });

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: { name: 'Le Monde de l\'Esthétique', email: 'noreply@lmdecaisse.com' },
      to: [{ email, name: `${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() }],
      subject: `Votre lien de paiement — ${planName} (${amountStr})`,
      htmlContent: html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: (data as any).message ?? `Brevo ${res.status}` }, { status: 500 });

  return NextResponse.json({ ok: true, paymentUrl });
}
