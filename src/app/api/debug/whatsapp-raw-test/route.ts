import { NextRequest, NextResponse } from 'next/server';

function cleanPhone(raw: string): string {
  let phone = raw.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (phone.startsWith('00')) phone = phone.slice(2);
  if (phone.startsWith('0') && phone.length === 10) {
    const local = phone.slice(1);
    if (phone.startsWith('0590') || phone.startsWith('0690') || phone.startsWith('0691')) {
      phone = '590' + local;
    } else if (phone.startsWith('069') || phone.startsWith('0596')) {
      phone = '596' + local;
    } else if (phone.startsWith('0692') || phone.startsWith('0693')) {
      phone = '262' + local;
    } else {
      phone = '33' + local;
    }
  } else if (phone.length === 9 && /^[67]/.test(phone)) {
    phone = '596' + phone;
  }
  return phone;
}

// POST { phone, templateName?, language?, variables? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { phone: rawPhone, templateName = 'hello_world', language = 'en', variables = [] } = body;

  if (!rawPhone) return NextResponse.json({ error: 'phone requis' }, { status: 400 });

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return NextResponse.json({ error: 'WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID manquant sur Vercel' }, { status: 500 });
  }

  const cleanedPhone = cleanPhone(rawPhone);

  const requestBody = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanedPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language },
      ...(variables.length ? {
        components: [{ type: 'body', parameters: variables.map((v: string) => ({ type: 'text', text: v })) }],
      } : {}),
    },
  };

  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const metaData = await metaRes.json().catch(() => ({}));

  return NextResponse.json({
    input: {
      rawPhone,
      cleanedPhone,
      templateName,
      language,
    },
    request: requestBody,
    metaStatus: metaRes.status,
    metaResponse: metaData,
    ok: metaRes.ok,
    diagnosis: metaRes.ok
      ? `✅ Meta a accepté — le message est en route vers ${cleanedPhone}`
      : `❌ Meta a refusé (${metaRes.status}) : ${(metaData as any)?.error?.message ?? JSON.stringify(metaData)}`,
  });
}
