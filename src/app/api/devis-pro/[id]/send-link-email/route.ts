import { NextRequest, NextResponse } from 'next/server';
import { sendEmailNotification } from '@/lib/whatsappService';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { email, firstName, link, itemLines, amount, numero } = body;
  if (!email || !link) return NextResponse.json({ error: 'email et link requis' }, { status: 400 });

  const fmtMoney = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  const name = (firstName as string) || 'Madame';

  const subject = `${name}, votre sélection beauté est prête ✨`;

  const textMessage = [
    `Bonjour ${name} 🌸`,
    '',
    `Gérer son réassort entre deux clients, c'est chronophage — alors on s'en occupe pour vous.`,
    '',
    `Votre sélection personnalisée est prête :`,
    (itemLines as string) || '',
    `Total : ${fmtMoney(Number(amount) || 0)} · Sans engagement`,
    '',
    `Consultez, ajustez si besoin et confirmez en 1 clic :`,
    link,
    '',
    `Aucune commande automatique — vous validez quand vous êtes prête.`,
    `— Le Monde de l'Esthétique ✨`,
  ].join('\n');

  const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#fdf5f9;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
  <div style="background:#e91e8c;padding:28px 32px 22px;text-align:center">
    <p style="margin:0;font-size:20px;font-weight:bold;color:#fff">Le Monde de l'Esthétique 💅</p>
  </div>
  <div style="padding:32px">
    <p style="font-size:18px;font-weight:bold;color:#18181b;margin:0 0 12px">Bonjour ${name} 🌸</p>
    <p style="font-size:15px;color:#444;line-height:1.7;margin:0 0 20px">
      Gérer son réassort entre deux clients, c'est chronophage.
      <strong>Alors on s'en occupe pour vous</strong> — votre sélection habituelle est déjà prête, sans engagement. ✨
    </p>
    <div style="background:#fdf5f9;border-radius:8px;padding:16px 20px;margin-bottom:24px">
      <p style="font-size:13px;font-weight:bold;color:#e91e8c;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Votre sélection</p>
      <p style="font-size:14px;color:#333;line-height:1.8;margin:0 0 10px;white-space:pre-line">${(itemLines as string) || ''}</p>
      <p style="font-size:15px;font-weight:bold;color:#18181b;margin:0">Total : ${fmtMoney(Number(amount) || 0)}</p>
    </div>
    <div style="border-left:4px solid #e91e8c;padding:12px 16px;background:#fff0f7;margin-bottom:28px">
      <p style="font-size:14px;color:#444;line-height:1.6;margin:0">
        💡 <strong>Sans engagement.</strong> Vous consultez votre devis, vous ajustez si besoin, et vous confirmez seulement quand vous êtes prête.
        <em>Aucune commande automatique.</em>
      </p>
    </div>
    <div style="text-align:center;margin-bottom:28px">
      <a href="${link}" style="display:inline-block;background:#e91e8c;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:bold">
        ✅ Voir et confirmer mon devis
      </a>
      <p style="font-size:12px;color:#999;margin:10px 0 0">Ou copiez :<br/><a href="${link}" style="color:#e91e8c;word-break:break-all">${link}</a></p>
    </div>
    <p style="font-size:13px;color:#888;margin:0">Des questions ? Répondez simplement à cet email.</p>
  </div>
  <div style="background:#fdf5f9;padding:14px 32px;text-align:center;border-top:1px solid #f0d6e8">
    <p style="font-size:12px;color:#aaa;margin:0">Le Monde de l'Esthétique — Martinique 🇲🇶</p>
  </div>
</div>
</body>
</html>`;

  const result = await sendEmailNotification(email, name, subject, textMessage, htmlContent);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Email non envoyé' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
