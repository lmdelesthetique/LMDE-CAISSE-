import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type NotifType =
  | 'selection_reminder'
  | 'box_ready'
  | 'box_preparing'
  | 'box_shipped'
  | 'box_delivered'
  | 'payment_reminder'
  | 'welcome';

interface EmailContent { subject: string; headline: string; body: string; cta?: { href: string; label: string } }

function buildContent(type: NotifType, firstName: string, planName: string, quota: number, portalUrl: string): EmailContent {
  switch (type) {
    case 'selection_reminder':
      return {
        subject: `Abonnement ${planName} — Personnalisez votre box du mois`,
        headline: `Votre box vous attend ! 🎁`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Le moment est venu de personnaliser votre box beauté du mois !<br/><br/>
Vous disposez encore de <strong>${quota.toFixed(0)} €</strong> de quota pour choisir vos produits préférés.<br/><br/>
⏰ <strong>Date limite : avant le 25 du mois</strong><br/><br/>
Connectez-vous à votre espace personnel pour faire votre sélection :`,
        cta: { href: portalUrl, label: '✨ Faire ma sélection' },
      };
    case 'box_ready':
      return {
        subject: `Abonnement ${planName} — Votre box est prête`,
        headline: `Votre box est prête ! 🎉`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Bonne nouvelle ! Votre box beauté du mois est prête et attend votre confirmation.<br/><br/>
Connectez-vous à votre espace pour valider votre commande :`,
        cta: { href: portalUrl, label: '📦 Voir ma box' },
      };
    case 'box_preparing':
      return {
        subject: `Abonnement ${planName} — Preparation de votre box en cours`,
        headline: `Votre box est en préparation ✨`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Notre équipe s'occupe en ce moment de préparer votre box beauté du mois avec soin.<br/><br/>
Vous recevrez une notification dès qu'elle sera prête ou expédiée.<br/><br/>
Restez à l'affût, de belles surprises vous attendent ! 🌸`,
      };
    case 'box_shipped':
      return {
        subject: `Abonnement ${planName} — Votre box a ete expediee`,
        headline: `Votre box est expédiée ! 🚀`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Votre box beauté du mois a été expédiée et est en route vers vous !<br/><br/>
Vous la recevrez dans les prochains jours.<br/><br/>
Merci de votre fidélité et à très vite 💖`,
      };
    case 'box_delivered':
      return {
        subject: `Abonnement ${planName} — Votre box a ete livree`,
        headline: `Votre box est livrée ! ✅`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Votre box beauté du mois a bien été livrée. Nous espérons qu'elle vous fait plaisir !<br/><br/>
N'hésitez pas à nous partager votre avis ou à passer nous voir en boutique.<br/><br/>
A le mois prochain 🌸`,
      };
    case 'payment_reminder':
      return {
        subject: `Abonnement ${planName} — Rappel prelevement mensuel`,
        headline: `Rappel paiement mensuel 💳`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Ceci est un rappel concernant votre abonnement <strong>${planName}</strong>.<br/><br/>
Votre prélèvement mensuel est prévu prochainement. Veuillez vous assurer que votre moyen de paiement est à jour.<br/><br/>
En cas de question, n'hésitez pas à contacter votre conseillère.`,
        cta: { href: portalUrl, label: '💳 Mon espace' },
      };
    case 'welcome':
      return {
        subject: `Bienvenue dans votre abonnement ${planName}`,
        headline: `Bienvenue chez nous ! 🌸`,
        body: `Bonjour ${firstName} 💅<br/><br/>
Nous sommes ravies de vous accueillir dans la famille Le Monde de l'Esthétique !<br/><br/>
Votre abonnement <strong>${planName}</strong> est maintenant actif.<br/><br/>
Chaque mois, personnalisez votre box beauté avec les produits de votre choix depuis votre espace personnel :`,
        cta: { href: portalUrl, label: '✨ Accéder à mon espace →' },
      };
  }
}

function buildHtml(content: EmailContent, planName: string): string {
  const ctaBlock = content.cta
    ? `<a href="${content.cta.href}" style="display:block;text-align:center;background:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);color:#fff;font-size:15px;font-weight:700;padding:16px 24px;border-radius:12px;text-decoration:none;margin-top:24px;">
        ${content.cta.label}
      </a>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${content.subject}</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#a855f7 0%,#ec4899 100%);padding:32px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">${content.headline}</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">Abonnement ${planName}</p>
  </div>
  <div style="padding:32px 36px;">
    <p style="font-size:15px;color:#44403c;margin:0;line-height:1.7;">${content.body}</p>
    ${ctaBlock}
    <p style="font-size:11px;color:#a8a29e;text-align:center;margin:24px 0 0;">
      Pour toute question, contactez votre conseillère en boutique.
    </p>
  </div>
  <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthetique 💅 — Votre salon beaute en Martinique</p>
  </div>
</div>
</body></html>`;
}

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId, notificationType } = await req.json() as { subscriptionId: string; notificationType: NotifType };
    if (!subscriptionId || !notificationType) {
      return NextResponse.json({ error: 'subscriptionId et notificationType requis' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: sub } = await supabase
      .from('client_subscriptions')
      .select('id, client_id, plan_id')
      .eq('id', subscriptionId)
      .maybeSingle();

    if (!sub) return NextResponse.json({ error: 'Abonnement introuvable' }, { status: 404 });

    const { data: client } = await supabase
      .from('clients')
      .select('first_name, email')
      .eq('id', sub.client_id)
      .maybeSingle();

    if (!client?.email) return NextResponse.json({ error: 'Email du client introuvable dans la fiche' }, { status: 400 });

    let planName = 'Box Beauté';
    let quota = 0;
    if (sub.plan_id) {
      const { data: plan } = await supabase
        .from('subscription_plans')
        .select('name, quota_amount')
        .eq('id', sub.plan_id)
        .maybeSingle();
      if (plan?.name) planName = plan.name;
      if (plan?.quota_amount) quota = plan.quota_amount;
    }

    // Check if there's a current order to get remaining quota
    const currentMonth = new Date().toISOString().slice(0, 7);
    const { data: order } = await supabase
      .from('subscription_orders')
      .select('id, total_sell_price, notified_at')
      .eq('subscription_id', subscriptionId)
      .eq('order_month', currentMonth)
      .maybeSingle();

    const remaining = order ? Math.max(0, quota - (order.total_sell_price ?? 0)) : quota;
    const portalUrl = `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com'}/client-portal/login`;

    const content = buildContent(notificationType, client.first_name ?? 'Abonnée', planName, remaining, portalUrl);
    const html = buildHtml(content, planName);

    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY non configurée' }, { status: 500 });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: fromEmail, to: [client.email], subject: content.subject, html }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[send-notification] Resend error:', data);
      return NextResponse.json({ error: (data as any).message ?? `Erreur envoi (${res.status})` }, { status: 500 });
    }

    // Record notification time
    const nowIso = new Date().toISOString();
    if (order) {
      await supabase.from('subscription_orders').update({ notified_at: nowIso }).eq('id', order.id);
    } else {
      const { data: plan2 } = await supabase.from('subscription_plans').select('shipping_free, shipping_cost').eq('id', sub.plan_id ?? '').maybeSingle();
      await supabase.from('subscription_orders').insert({
        subscription_id: subscriptionId,
        order_month: currentMonth,
        status: 'open',
        shipping_cost: plan2?.shipping_free ? 0 : (plan2?.shipping_cost ?? 0),
        notified_at: nowIso,
      });
    }

    return NextResponse.json({ ok: true, sentTo: client.email });
  } catch (e: any) {
    console.error('[send-notification] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
