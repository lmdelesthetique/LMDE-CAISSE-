import { NextRequest, NextResponse } from 'next/server';

function buildHtml(subject: string, bodyText: string, prenom: string): string {
  const paragraphs = bodyText
    .split('\n\n')
    .map((p) => p.replace(/\n/g, '<br/>'))
    .map((p) => `<p style="font-size:15px;color:#444;line-height:1.8;margin:0 0 16px">${p}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#fdf5f9;font-family:Georgia,serif">
<div style="max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.07)">
  <div style="background:#e91e8c;padding:24px 32px">
    <p style="margin:0;font-size:13px;font-weight:bold;color:#fff;letter-spacing:1px;text-transform:uppercase">Le Monde de l'Esthétique</p>
  </div>
  <div style="padding:32px">
    ${paragraphs}
  </div>
  <div style="background:#fdf5f9;padding:16px 32px;border-top:1px solid #f0d6e8;text-align:center">
    <p style="font-size:11px;color:#aaa;margin:0">Christy — LMDE Martinique 🇲🇶 · Pour se désabonner, répondre STOP.</p>
  </div>
</div>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { to, sujet, corps, prenom } = body;

  if (!to || !sujet || !corps) {
    return NextResponse.json({ error: 'to, sujet, corps requis' }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY manquante' }, { status: 500 });

  const from = process.env.RESEND_FROM_EMAIL ?? "Christy de LMDE <noreply@lmdecaisse.com>";
  const html = buildHtml(sujet, corps, prenom ?? 'toi');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
    body: JSON.stringify({ from, to: [to], subject: sujet, html }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: (data as any).message ?? `Erreur Resend (${res.status})` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: (data as any).id });
}
