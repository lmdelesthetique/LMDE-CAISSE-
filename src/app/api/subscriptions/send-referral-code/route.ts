import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const { clientId } = await req.json();
    if (!clientId) return NextResponse.json({ error: 'clientId requis' }, { status: 400 });

    const supabase = createAdminClient();

    const { data: client, error } = await supabase
      .from('clients')
      .select('first_name, last_name, email, referral_code')
      .eq('id', clientId)
      .maybeSingle();

    if (error || !client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });

    const email = client.email;
    if (!email) return NextResponse.json({ error: 'Email du client introuvable dans la fiche' }, { status: 400 });

    const code = client.referral_code;
    if (!code) return NextResponse.json({ error: 'Code parrainage non encore généré' }, { status: 400 });

    const firstName = client.first_name ?? 'Chère cliente';
    const shopLink = `https://mondedelesthetique.fr/?ref=${code}`;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Votre code parrainage LMDE</title></head>
<body style="margin:0;padding:0;background:#fdf2f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1c1917;">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
  <div style="background:linear-gradient(135deg,#ec4899 0%,#f472b6 100%);padding:32px 36px;">
    <p style="margin:0 0 4px;color:rgba(255,255,255,.85);font-size:12px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Le Monde de l'Esthétique</p>
    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;">Votre code parrainage 🎁</h1>
    <p style="margin:6px 0 0;color:rgba(255,255,255,.8);font-size:14px;">Partagez et faites gagner vos proches !</p>
  </div>
  <div style="padding:32px 36px;">
    <p style="font-size:15px;color:#44403c;margin:0 0 20px;">Bonjour ${firstName} 💅</p>
    <p style="font-size:14px;color:#57534e;margin:0 0 24px;">
      Merci d'être une cliente fidèle de <strong>Le Monde de l'Esthétique</strong> !<br/>
      Partagez votre code parrainage à votre entourage — chaque amie bénéficiera d'une réduction sur sa première commande, et vous serez récompensée en points fidélité.
    </p>

    <!-- Code block -->
    <div style="background:#fdf2f8;border:2px solid #ec4899;border-radius:16px;padding:24px;margin-bottom:24px;text-align:center;">
      <p style="margin:0 0 6px;font-size:12px;color:#9ca3af;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">Votre code parrainage</p>
      <p style="margin:0;font-size:42px;font-weight:900;color:#ec4899;font-family:monospace;letter-spacing:8px;">${code}</p>
      <p style="margin:12px 0 0;font-size:12px;color:#a8a29e;">Ou partagez directement ce lien :</p>
      <a href="${shopLink}" style="display:inline-block;margin-top:6px;font-size:13px;color:#ec4899;font-weight:600;word-break:break-all;">${shopLink}</a>
    </div>

    <!-- How it works -->
    <div style="background:#f9fafb;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1c1917;">Comment ça marche ?</p>
      <div style="font-size:13px;color:#57534e;line-height:1.8;">
        <p style="margin:0;">🎀 <strong>Votre amie</strong> utilise votre code à la caisse ou en ligne</p>
        <p style="margin:4px 0;">💅 <strong>Elle bénéficie</strong> de <strong>-10%</strong> sur sa première commande</p>
        <p style="margin:0;">⭐ <strong>Vous recevez</strong> des points fidélité en récompense</p>
      </div>
    </div>

    <a href="https://wa.me/?text=${encodeURIComponent(`Bonjour ! 👋\n\nJe te recommande *Le Monde de l'Esthétique* pour tes produits beauté ! 💅\n\nUtilise mon code parrainage *${code}* ou commande directement ici 👉 ${shopLink}\n\n🎁 -10% sur ta première commande !`)}"
       style="display:block;text-align:center;background:#25d366;color:#fff;font-size:14px;font-weight:700;padding:14px 24px;border-radius:12px;text-decoration:none;margin-bottom:12px;">
      📲 Partager sur WhatsApp
    </a>
  </div>
  <div style="background:#fdf2f8;padding:16px 36px;text-align:center;">
    <p style="margin:0;font-size:12px;color:#c084fc;">Le Monde de l'Esthétique 💅</p>
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
        subject: `Votre code parrainage LMDE : ${code} 🎁`,
        html,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[send-referral-code] Resend error:', data);
      return NextResponse.json({ error: (data as any).message ?? `Erreur envoi (${res.status})` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentTo: email });
  } catch (e: any) {
    console.error('[send-referral-code] unhandled:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
