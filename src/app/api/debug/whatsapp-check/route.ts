import { NextRequest, NextResponse } from 'next/server';
import { sendNotifLivreurNouvelleLivraison } from '@/lib/whatsappService';

async function fetchMetaPhoneInfo() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return null;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,verified_name,quality_rating,status`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json().catch(() => null);
}

async function fetchMetaTemplates() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const wabaId = process.env.WHATSAPP_BUSINESS_ID;
  if (!token || !wabaId) return null;
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=name,status,language&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.json().catch(() => null);
}

export async function GET() {
  const hasBrevo = !!process.env.BREVO_API_KEY;
  const hasMeta = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasResend = !!process.env.RESEND_API_KEY;

  const [phoneInfo, templatesData] = await Promise.all([
    fetchMetaPhoneInfo(),
    fetchMetaTemplates(),
  ]);

  const templates = (templatesData?.data ?? []).map((t: any) => ({
    name: t.name,
    status: t.status,
    language: t.language,
  }));

  return NextResponse.json({
    activeProvider: hasMeta ? 'Meta WhatsApp API ✅' : hasBrevo ? 'Brevo WhatsApp ✅' : hasResend ? 'Resend Email (fallback) ✅' : 'Aucun ❌',
    meta: {
      configured: hasMeta,
      phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? 'manquant',
      phoneNumber: phoneInfo?.display_phone_number ?? 'N/A',
      verifiedName: phoneInfo?.verified_name ?? 'N/A',
      qualityRating: phoneInfo?.quality_rating ?? 'N/A',
      phoneStatus: phoneInfo?.status ?? 'N/A',
      phoneError: phoneInfo?.error?.message ?? null,
    },
    templates: {
      count: templates.length,
      approved: templates.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.name),
      pending: templates.filter((t: any) => t.status !== 'APPROVED').map((t: any) => `${t.name} (${t.status})`),
    },
    important: 'Meta NEVER delivers free-text messages for business-initiated conversations. Only APPROVED templates work.',
    instructions: 'POST { phone, driverName? } pour tester le template livreur_nouvelle_livraison',
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  const { phone, driverName } = body as { phone?: string; driverName?: string };
  if (!phone) return NextResponse.json({ error: 'Paramètre phone requis' }, { status: 400 });

  // Test with a real approved template (livreur_nouvelle_livraison)
  const result = await sendNotifLivreurNouvelleLivraison(
    phone,
    driverName ?? 'Test Livreur',
    'Cliente Test',
    'Adresse Test, Martinique'
  );

  return NextResponse.json({
    phone,
    ok: result.ok,
    provider: result.provider,
    error: result.error ?? null,
    note: result.ok
      ? 'Template envoyé via Meta — vous devriez recevoir le message WhatsApp dans quelques secondes'
      : 'Échec — vérifiez que le template est APPROVED dans Meta WhatsApp Manager',
  }, { status: result.ok ? 200 : 502 });
}
