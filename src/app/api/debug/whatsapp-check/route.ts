import { NextRequest, NextResponse } from 'next/server';
import {
  sendNotifLivreurNouvelleLivraison,
  sendNotifClientBoxPreteRetrait,
  sendNotifAmbassadriceBoxPrete,
  sendNotifFournisseurNouvelleCommande,
  sendNotifCampagneSite,
} from '@/lib/whatsappService';

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

async function validateToken() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { valid: false, error: 'Token absent' };
  const res = await fetch(
    `https://graph.facebook.com/debug_token?input_token=${token}&access_token=${token}`,
    { cache: 'no-store' }
  );
  const data = await res.json().catch(() => ({}));
  const info = data?.data;
  if (!info) return { valid: false, error: data?.error?.message ?? 'Réponse invalide' };
  if (info.error) return { valid: false, error: info.error.message };
  const expiresAt = info.expires_at ? new Date(info.expires_at * 1000).toISOString() : 'jamais (permanent)';
  const isExpired = info.expires_at && info.expires_at < Date.now() / 1000;
  return {
    valid: info.is_valid === true && !isExpired,
    appName: info.app ?? 'N/A',
    expiresAt,
    isExpired: !!isExpired,
    scopes: info.scopes ?? [],
  };
}

export async function GET() {
  const hasBrevo = !!process.env.BREVO_API_KEY;
  const hasMeta = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasResend = !!process.env.RESEND_API_KEY;

  const [phoneInfo, templatesData, tokenInfo] = await Promise.all([
    fetchMetaPhoneInfo(),
    fetchMetaTemplates(),
    validateToken(),
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
      wabaId: process.env.WHATSAPP_BUSINESS_ID ?? 'manquant',
      phoneNumber: phoneInfo?.display_phone_number ?? 'N/A',
      verifiedName: phoneInfo?.verified_name ?? 'N/A',
      qualityRating: phoneInfo?.quality_rating ?? 'N/A',
      phoneStatus: phoneInfo?.status ?? 'N/A',
      phoneError: phoneInfo?.error?.message ?? null,
    },
    token: tokenInfo,
    brevo: { configured: hasBrevo },
    resend: { configured: hasResend },
    templates: {
      count: templates.length,
      approved: templates.filter((t: any) => t.status === 'APPROVED').map((t: any) => t.name),
      pending: templates.filter((t: any) => t.status !== 'APPROVED').map((t: any) => `${t.name} (${t.status})`),
    },
  });
}

// POST { phone, flowKey } — test the right template per flow
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  const { phone, flowKey } = body as { phone?: string; flowKey?: string };
  if (!phone) return NextResponse.json({ error: 'Paramètre phone requis' }, { status: 400 });

  let result;
  switch (flowKey) {
    case 'livreur':
      result = await sendNotifLivreurNouvelleLivraison(phone, 'Test Livreur', 'Cliente Test', 'Martinique, Test Adresse');
      break;
    case 'ambassadrice':
      result = await sendNotifAmbassadriceBoxPrete(phone, 'Christy');
      break;
    case 'fournisseur':
      result = await sendNotifFournisseurNouvelleCommande(phone, 'Fournisseur Test', 'CMD-TEST-001');
      break;
    case 'client':
    default:
      result = await sendNotifCampagneSite(phone, 'Cliente', 'Ceci est un test de notification. Tout fonctionne correctement ! 🌸');
      break;
  }

  return NextResponse.json({
    phone,
    flowKey: flowKey ?? 'client',
    ok: result.ok,
    provider: result.provider,
    error: result.error ?? null,
    note: result.ok
      ? '✅ Message envoyé via Meta — vérifiez WhatsApp dans quelques secondes'
      : '❌ Échec — vérifiez que le template est APPROVED dans Meta Business Manager',
  }, { status: result.ok ? 200 : 502 });
}
