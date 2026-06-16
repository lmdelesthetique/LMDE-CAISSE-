import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();
    if (!subscriptionId) return NextResponse.json({ error: 'subscriptionId requis' }, { status: 400 });

    const supabase = createAdminClient();

    // Separate queries — avoids FK join issues
    const { data: sub, error: subErr } = await supabase
      .from('client_subscriptions')
      .select('id, client_id, plan_id, portal_phone, pin_code')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (subErr || !sub) {
      console.error('[send-access] subscription not found', subErr?.message);
      return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });
    }

    // Get client
    const { data: client } = await supabase
      .from('clients')
      .select('first_name, last_name, email')
      .eq('id', sub.client_id)
      .maybeSingle();

    const email = client?.email;
    if (!email) return NextResponse.json({ error: 'Email du client introuvable dans la fiche' }, { status: 400 });

    const firstName = client?.first_name ?? 'Abonnée';

    // Get plan (optional)
    let planName = 'Box Beauté';
    if (sub.plan_id) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('name')
        .eq('id', sub.plan_id)
        .maybeSingle();
      if (plan?.name) planName = plan.name;
    }

    const phone  = sub.portal_phone ?? '—';
    const pin    = sub.pin_code    ?? '—';
    const portalUrl = 'https://www.lmdecaisse.com/client-portal/login';

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Votre accès Portail Beauté</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:32px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Votre Portail Beauté ✨</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">Abonnement ${planName}</p>
  </div>
  <div style="padding:32px 36px;">
    <p style="font-size:15px;color:#44403c;margin:0 0 20px;">Bonjour ${firstName} 💅</p>
    <p style="font-size:14px;color:#57534e;margin:0 0 24px;">Votre espace abonnement personnel est prêt ! Retrouvez ci-dessous vos identifiants de connexion.</p>
    <div style="background:#fdf2f8;border:1px solid #fbcfe8;border-radius:14px;padding:4px 20px;margin-bottom:28px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #fce7f3;">
        <span style="font-size:13px;color:#9ca3af;">🌐 Lien de connexion</span>
        <a href="${portalUrl}" style="font-size:13px;font-weight:600;color:#ec4899;text-decoration:none;">${portalUrl}</a>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid #fce7f3;">
        <span style="font-size:13px;color:#9ca3af;">📱 Téléphone</span>
        <span style="font-size:14px;font-weight:600;color:#1c1917;font-family:monospace;">${phone}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 0;">
        <span style="font-size:13px;color:#9ca3af;">🔑 Code PIN</span>
        <span style="font-size:22px;font-weight:800;color:#ec4899;font-family:monospace;letter-spacing:6px;">${pin}</span>
      </div>
    </div>
    <a href="${portalUrl}" style="display:block;text-align:center;background:#ec4899;color:#fff;font-size:15px;font-weight:700;padding:16px 24px;border-radius:12px;text-decoration:none;">
      Accéder à mon portail →
    </a>
    <p style="font-size:11px;color:#a8a29e;text-align:center;margin:14px 0 0;">
      Gardez ce code PIN confidentiel. En cas de problème, contactez votre conseillère.
    </p>
  </div>
  <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthétique 💅</p>
  </div>
</div>
</body></html>`;

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY non configurée' }, { status: 500 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: `Vos accès au Portail Beauté — ${planName}`,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[send-access] Resend error:', data);
      return NextResponse.json({ error: (data as any).message ?? `Erreur envoi (${res.status})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentTo: email });
  } catch (e: any) {
    console.error('[send-access] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
