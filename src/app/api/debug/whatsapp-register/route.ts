import { NextRequest, NextResponse } from 'next/server';

const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? '';
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN ?? '';

// GET /api/debug/whatsapp-register?action=request   → envoie SMS OTP
// GET /api/debug/whatsapp-register?action=verify&code=XXXXXX → vérifie le code
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const code = searchParams.get('code');

  if (!PHONE_ID || !TOKEN) {
    return NextResponse.json({ error: 'WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant dans Vercel' }, { status: 500 });
  }

  if (action === 'request') {
    // Demande l'envoi du code OTP par SMS sur le numéro
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/request_code`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code_method: 'SMS', language: 'fr' }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ action: 'request_code', ok: res.ok, status: res.status, data });
  }

  if (action === 'verify' && code) {
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/verify_code`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ action: 'verify_code', ok: res.ok, status: res.status, data });
  }

  if (action === 'register') {
    // Enregistrement final du numéro (après vérification OTP)
    const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/register`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', pin: '123456' }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ action: 'register', ok: res.ok, status: res.status, data });
  }

  return NextResponse.json({
    instructions: {
      step1: `GET ?action=request  →  envoie SMS OTP`,
      step2: `GET ?action=verify&code=XXXXXX  →  confirme le code`,
      step3: `GET ?action=register  →  enregistrement final (à faire si le numéro est déjà vérifié)`,
    },
    currentPhoneId: PHONE_ID,
  });
}
