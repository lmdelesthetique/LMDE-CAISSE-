import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { subscriptionId } = await req.json();
  if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId required' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: sub, error } = await supabase
    .from('client_subscriptions')
    .select('id, portal_phone, pin_code, client:client_id(first_name, last_name, email), plan:plan_id(name, price)')
    .eq('id', subscriptionId)
    .single();

  if (error || !sub) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });

  const client = Array.isArray(sub.client) ? sub.client[0] : sub.client as any;
  const plan = Array.isArray(sub.plan) ? sub.plan[0] : sub.plan as any;

  const email = client?.email;
  if (!email) return NextResponse.json({ error: 'Client email not found' }, { status: 400 });

  const firstName = client?.first_name ?? 'Abonnée';
  const phone = sub.portal_phone ?? '—';
  const pin = sub.pin_code ?? '—';
  const planName = plan?.name ?? 'Box Beauté';
  const portalUrl = 'https://www.lmdecaisse.com/client-portal/login';

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Votre accès Portail Beauté</title>
</head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
  <div style="max-width:520px;margin:32px auto;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
    <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:32px 36px;">
      <p style="margin:0 0 6px;color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">Votre Portail Beauté</h1>
      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Abonnement ${planName}</p>
    </div>
    <div style="padding:32px 36px;">
      <p style="font-size:15px;color:#44403c;margin:0 0 24px;">Bonjour ${firstName} 💅</p>
      <p style="font-size:14px;color:#57534e;margin:0 0 24px;">Votre espace abonnement personnel est prêt ! Retrouvez ci-dessous vos identifiants de connexion.</p>

      <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:20px 24px;margin-bottom:28px;">
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #fce7f3;font-size:13px;">
          <span style="color:#9ca3af;">Lien de connexion</span>
          <a href="${portalUrl}" style="font-weight:600;color:#ec4899;text-decoration:none;">${portalUrl}</a>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #fce7f3;font-size:13px;">
          <span style="color:#9ca3af;">Téléphone</span>
          <span style="font-weight:600;color:#1c1917;font-family:monospace;">${phone}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;">
          <span style="color:#9ca3af;">Code PIN</span>
          <span style="font-weight:700;color:#ec4899;font-family:monospace;letter-spacing:4px;">${pin}</span>
        </div>
      </div>

      <a href="${portalUrl}" style="display:block;text-align:center;background:#ec4899;color:#fff;font-size:14px;font-weight:700;padding:14px 24px;border-radius:12px;text-decoration:none;">
        Accéder à mon portail →
      </a>

      <p style="font-size:12px;color:#a8a29e;text-align:center;margin:20px 0 0;">
        Gardez ce code PIN confidentiel. En cas de problème, contactez votre conseillère.
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
      subject: `Votre accès au Portail Beauté — ${planName}`,
      htmlContent: html,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: (data as any).message ?? `Brevo ${res.status}` }, { status: 500 });

  return NextResponse.json({ ok: true });
}
