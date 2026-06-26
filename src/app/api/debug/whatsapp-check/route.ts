import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/whatsappService';

export async function GET() {
  const hasBrevo = !!process.env.BREVO_API_KEY;
  const hasMeta = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasResend = !!process.env.RESEND_API_KEY;

  const activeProvider = hasMeta ? 'Meta WhatsApp API ✅' : hasBrevo ? 'Brevo WhatsApp ✅' : hasResend ? 'Resend Email (fallback) ✅' : 'Aucun ❌';

  return NextResponse.json({
    brevo: {
      configured: hasBrevo,
      keyPrefix: hasBrevo ? process.env.BREVO_API_KEY!.substring(0, 12) + '...' : 'manquante',
    },
    meta: {
      configured: hasMeta,
      phoneId: hasMeta ? process.env.WHATSAPP_PHONE_NUMBER_ID : 'manquant',
    },
    resend: {
      configured: hasResend,
      note: 'Utilisé comme fallback email quand WhatsApp non configuré',
    },
    activeProvider,
    campagnesChannel: hasMeta ? 'WhatsApp (Meta)' : hasBrevo ? 'WhatsApp (Brevo)' : hasResend ? 'Email (Resend) — clients avec email seulement' : 'Aucun canal actif ❌',
    instructions: 'POST /api/debug/whatsapp-check avec { phone } pour tester WhatsApp',
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  const { phone, message } = body as { phone?: string; message?: string };
  if (!phone) return NextResponse.json({ error: 'Paramètre phone requis' }, { status: 400 });

  const result = await sendWhatsApp({
    to: phone,
    message: message ?? `✅ Test WhatsApp — Le Monde de l'Esthétique\n\nCe message confirme que l'envoi WhatsApp fonctionne correctement.\n\n${new Date().toLocaleString('fr-FR')}`,
  });

  return NextResponse.json({
    phone,
    ok: result.ok,
    provider: result.provider,
    error: result.error ?? null,
    waLink: result.waLink,
  }, { status: result.ok ? 200 : 502 });
}
