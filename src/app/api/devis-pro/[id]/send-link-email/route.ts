import { NextRequest, NextResponse } from 'next/server';
import { sendEmailNotification } from '@/lib/whatsappService';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { email, firstName, link, itemLines, amount } = body;
  if (!email || !link) return NextResponse.json({ error: 'email et link requis' }, { status: 400 });

  const fmtMoney = (n: number) => n.toFixed(2).replace('.', ',') + ' €';
  const name = (firstName as string)?.trim() || 'Madame';
  const items = (itemLines as string) || '';
  const total = fmtMoney(Number(amount) || 0);

  const subject = `${name}, votre commande est prête 🌸`;

  const textMessage = [
    `Bonjour ${name},`,
    '',
    `Vos produits habituels sont sélectionnés et prêts à être confirmés.`,
    '',
    `${items}`,
    `Total : ${total}`,
    '',
    `Consultez votre commande, modifiez-la si besoin, et confirmez :`,
    link,
    '',
    `Aucun engagement — vous validez quand vous voulez.`,
    `— Le Monde de l'Esthétique`,
  ].join('\n');

  // Items formatted as HTML list rows
  const itemsHtml = items
    .split('\n')
    .filter(Boolean)
    .map((line) => `<tr><td style="padding:6px 0;font-size:14px;color:#333;border-bottom:1px solid #f5e0ee">${line.replace(/^•\s*/, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</td></tr>`)
    .join('');

  const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#fdf5f9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:580px;margin:0 auto;padding:20px">

  <!-- Header -->
  <div style="background:#e91e8c;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
    <p style="margin:0;font-size:18px;font-weight:bold;color:#fff;letter-spacing:0.3px">Le Monde de l'Esthétique</p>
  </div>

  <!-- Card -->
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;box-shadow:0 2px 10px rgba(0,0,0,0.07)">

    <p style="font-size:17px;font-weight:bold;color:#18181b;margin:0 0 6px">Bonjour ${name} 🌸</p>
    <p style="font-size:14px;color:#555;line-height:1.6;margin:0 0 22px">
      Votre commande est prête. Retrouvez vos produits ci-dessous, modifiez-les si besoin, puis confirmez en un clic.
    </p>

    <!-- CTA en premier, visible immédiatement -->
    <div style="text-align:center;margin-bottom:24px">
      <a href="${link}"
         style="display:inline-block;background:#e91e8c;color:#ffffff;padding:14px 36px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:bold;letter-spacing:0.2px">
        Voir ma commande →
      </a>
    </div>

    <!-- Produits -->
    <div style="background:#fdf5f9;border-radius:8px;padding:16px 18px;margin-bottom:20px">
      <p style="font-size:12px;font-weight:bold;color:#e91e8c;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px">Vos produits</p>
      <table style="width:100%;border-collapse:collapse">
        ${itemsHtml}
      </table>
      <p style="font-size:15px;font-weight:bold;color:#18181b;margin:12px 0 0;border-top:2px solid #e91e8c;padding-top:10px">Total : ${total}</p>
    </div>

    <!-- Note engagement -->
    <p style="font-size:13px;color:#777;line-height:1.5;margin:0 0 6px">
      Aucun engagement — vous confirmez quand vous êtes prête. Vous pouvez aussi modifier vos quantités ou retirer des produits avant de valider.
    </p>
    <p style="font-size:13px;color:#999;margin:0">Une question ? Répondez à cet email.</p>

  </div>

  <!-- Footer -->
  <p style="text-align:center;font-size:11px;color:#bbb;margin:14px 0 0">Le Monde de l'Esthétique · Martinique 🇲🇶</p>
</div>
</body>
</html>`;

  const result = await sendEmailNotification(email, name, subject, textMessage, htmlContent);

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Email non envoyé' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
