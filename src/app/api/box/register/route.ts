import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const RESEND_KEY = process.env.RESEND_API_KEY ?? '';
const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
const ADMIN_EMAIL = 'lm.delesthetique@gmail.com';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { firstName, lastName, email, phone, address, island, plan: planKey } = body;

    if (!firstName || !lastName || !email || !phone || !planKey) {
      return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // 1. Find plan_id from subscription_plans by key name
    const { data: plans } = await supabase
      .from('subscription_plans')
      .select('id, name, price, quota_amount')
      .eq('is_active', true)
      .order('price');

    // Exact match first, then partial — avoids "Pro Étendu" matching key "pro" before "Pro"
    const plan = plans?.find((p: any) => p.name.toLowerCase() === planKey.toLowerCase())
      ?? plans?.find((p: any) => p.name.toLowerCase().includes(planKey.toLowerCase()));
    if (!plan) {
      return NextResponse.json({ error: `Formule "${planKey}" introuvable. Vérifiez les noms dans subscription_plans.` }, { status: 400 });
    }

    // 2. Find or create client (match by email OR phone)
    const { data: existingByEmail } = await supabase
      .from('clients')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    const { data: existingByPhone } = !existingByEmail
      ? await supabase.from('clients').select('id').eq('phone', phone.trim()).maybeSingle()
      : { data: null };

    let clientId: string;

    if (existingByEmail?.id || existingByPhone?.id) {
      clientId = (existingByEmail?.id ?? existingByPhone?.id)!;
    } else {
      const { data: newClient, error: clientErr } = await supabase
        .from('clients')
        .insert({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim(),
          address: address?.trim() || null,
          notes: island ? `Île/Zone: ${island}` : null,
        })
        .select('id')
        .single();

      if (clientErr || !newClient) {
        console.error('[box/register] client insert:', clientErr?.message);
        return NextResponse.json({ error: clientErr?.message ?? 'Erreur création client' }, { status: 500 });
      }
      clientId = newClient.id;
    }

    // 3. If subscription already exists (pending or active), return existing credentials
    const { data: existingSub } = await supabase
      .from('client_subscriptions')
      .select('id, portal_phone, pin_code')
      .eq('client_id', clientId)
      .in('status', ['pending', 'active'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSub) {
      return NextResponse.json({
        ok: true,
        subscriptionId: existingSub.id,
        phone: existingSub.portal_phone,
        pin: existingSub.pin_code,
      });
    }

    // 4. Generate 4-digit PIN
    const pin = String(Math.floor(1000 + Math.random() * 9000));

    // 5. Create subscription with status pending
    const { data: sub, error: subErr } = await supabase
      .from('client_subscriptions')
      .insert({
        client_id: clientId,
        plan_id: plan.id,
        status: 'pending',
        portal_phone: phone.trim(),
        pin_code: pin,
        payment_email: email.trim(),
      })
      .select('id')
      .single();

    if (subErr || !sub) {
      console.error('[box/register] subscription insert:', subErr?.message);
      return NextResponse.json({ error: subErr?.message ?? 'Erreur création abonnement' }, { status: 500 });
    }

    // 6. Admin notification email (fire-and-forget)
    if (RESEND_KEY) {
      const planLabel = `${plan.name} — ${plan.price}€/mois (quota ${plan.quota_amount}€)`;
      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:28px 32px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.8);font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">🎉 Nouvelle abonnée — Box Beauté</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:13px;">Inscription via le tunnel /box</p>
  </div>
  <div style="padding:28px 32px;">
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Prénom</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${firstName}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Nom</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${lastName}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Email</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${email}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Téléphone</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${phone}</td></tr>
      ${address ? `<tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Adresse</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${address}</td></tr>` : ''}
      <tr><td style="padding:10px 0;color:#71717a;border-bottom:1px solid #fce7f3;">Île / Zone</td><td style="font-weight:600;padding:10px 0;border-bottom:1px solid #fce7f3;">${island ?? '—'}</td></tr>
      <tr><td style="padding:10px 0;color:#71717a;">Formule</td><td style="font-weight:700;color:#ec4899;padding:10px 0;">${planLabel}</td></tr>
    </table>
    <div style="background:#fdf2f8;border-radius:12px;padding:14px 16px;margin-top:20px;">
      <p style="margin:0;font-size:12px;color:#9ca3af;">Statut : <strong>En attente de paiement</strong>. Le compte sera activé automatiquement après paiement Stripe.</p>
    </div>
  </div>
</div>`;

      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [ADMIN_EMAIL],
          subject: `🎉 Nouvelle abonnée ${plan.name} — ${firstName} ${lastName}`,
          html,
        }),
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      subscriptionId: sub.id,
      phone: phone.trim(),
      pin,
    });

  } catch (err: any) {
    console.error('[box/register] unhandled:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
