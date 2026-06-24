import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/whatsappService';

export async function GET() {
  const hasBrevo = !!process.env.BREVO_API_KEY;
  const hasMeta = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

  return NextResponse.json({
    brevo: {
      configured: hasBrevo,
      keyPrefix: hasBrevo ? process.env.BREVO_API_KEY!.substring(0, 12) + '...' : 'manquante',
    },
    meta: {
      configured: hasMeta,
      phoneId: hasMeta ? process.env.WHATSAPP_PHONE_NUMBER_ID : 'manquant',
    },
    activeProvider: hasMeta ? 'Meta API' : hasBrevo ? 'Brevo' : 'Aucun ❌',
    instructions: 'Appelez GET /api/debug/whatsapp-check?test=0696XXXXXX pour envoyer un message test',
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  const { phone } = body as { phone?: string };
  if (!phone) return NextResponse.json({ error: 'Paramètre phone requis' }, { status: 400 });

  const result = await sendWhatsApp({
    to: phone,
    message: `✅ Test WhatsApp — Le Monde de l'Esthétique\n\nCe message confirme que l'envoi WhatsApp fonctionne correctement.\n\n${new Date().toLocaleString('fr-FR')}`,
  });

  return NextResponse.json({
    phone,
    ok: result.ok,
    provider: result.provider,
    error: result.error ?? null,
    waLink: result.waLink,
  }, { status: result.ok ? 200 : 502 });
}
