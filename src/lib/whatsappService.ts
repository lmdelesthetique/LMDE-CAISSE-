export interface WhatsAppMessage {
  to: string;
  message: string;
  email?: string; // fallback email when no WhatsApp provider is configured
}

export interface WhatsAppResult {
  ok: boolean;
  error?: string;
  waLink: string;
  provider?: 'meta' | 'brevo' | 'email' | 'manual';
}

function cleanPhone(raw: string): string {
  // Strip spaces, dashes, dots, parentheses, then remove leading +
  let phone = raw.replace(/[\s\-().]/g, '').replace(/^\+/, '');

  // International dialing prefix 00xx → remove the 00
  if (phone.startsWith('00')) phone = phone.slice(2);

  // 10-digit local format starting with 0
  if (phone.startsWith('0') && phone.length === 10) {
    const local = phone.slice(1);
    // Martinique/Guadeloupe mobiles: 0696, 0694, 0690-0693, 0692, 0693
    if (/^069[0-9]/.test(phone) || /^059[0-9]/.test(phone)) {
      phone = phone.startsWith('059') ? '590' + local : '596' + local;
    } else {
      // French metropolitan (06, 07, landlines starting with 01-05, 08, 09)
      phone = '33' + local;
    }
  }
  // 9-digit number without any country code prefix → assume Martinique local
  else if (phone.length === 9 && /^[67]/.test(phone)) {
    phone = '596' + phone;
  }
  // Anything else: already has country code (33xxxxxxxxx, 86xxxxxxxxxx, 1xxxxxxxxxx, etc.)

  return phone;
}

async function sendViaMeta(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: 'Meta API not configured' };

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) { console.log('[WhatsApp] ✅ sent via Meta'); return { ok: true }; }
  const errMsg = (data as any).error?.message || (data as any).error?.error_data?.details || `Meta HTTP ${res.status}`;
  console.error('[WhatsApp] Meta error:', JSON.stringify(data));
  return { ok: false, error: errMsg };
}

async function sendViaBrevo(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, error: 'BREVO_API_KEY not configured' };

  const res = await fetch('https://api.brevo.com/v3/whatsapp/sendMessage', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? process.env.BREVO_SENDER_NUMBER ?? '262692000000',
      contactNumbers: [phone],
      text: message,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) { console.log('[WhatsApp] ✅ sent via Brevo'); return { ok: true }; }
  console.error('[WhatsApp] Brevo error:', data);
  return { ok: false, error: (data as any).message || `Brevo HTTP ${res.status}` };
}

async function sendViaResend(email: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Le Monde de l'Esthétique <noreply@lmdecaisse.com>";
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not configured' };

  const htmlBody = `<div style="font-family:-apple-system,sans-serif;font-size:14px;line-height:1.7;color:#18181b;white-space:pre-wrap">${message.replace(/\n/g, '<br/>')}</div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ from, to: [email], subject: "Le Monde de l'Esthétique", text: message, html: htmlBody }),
  });
  if (res.ok) { console.log('[WhatsApp] ✅ sent via Resend email'); return { ok: true }; }
  const data = await res.json().catch(() => ({}));
  return { ok: false, error: (data as any).message ?? `Resend HTTP ${res.status}` };
}

export async function sendWhatsApp({ to, message, email }: WhatsAppMessage): Promise<WhatsAppResult> {
  const phone = cleanPhone(to);
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  console.log('[WhatsApp] → phone:', phone);

  const hasMetaConfig = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasBrevoConfig = !!process.env.BREVO_API_KEY;
  const hasResendConfig = !!process.env.RESEND_API_KEY;

  try {
    if (hasMetaConfig) {
      const result = await sendViaMeta(phone, message);
      if (result.ok) return { ok: true, waLink, provider: 'meta' };
    }
    if (hasBrevoConfig) {
      const result = await sendViaBrevo(phone, message);
      if (result.ok) return { ok: true, waLink, provider: 'brevo' };
      return { ok: false, error: result.error, waLink, provider: 'brevo' };
    }
    // Email fallback via Resend when no WhatsApp provider is configured
    if (hasResendConfig && email) {
      const result = await sendViaResend(email, message);
      if (result.ok) return { ok: true, waLink, provider: 'email' };
      return { ok: false, error: result.error, waLink, provider: 'email' };
    }
  } catch (err: any) {
    console.error('[WhatsApp] exception:', err);
    return { ok: false, error: err.message, waLink, provider: 'manual' };
  }

  return { ok: false, error: 'Aucune API configurée (WhatsApp ou Email)', waLink, provider: 'manual' };
}

export function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = cleanPhone(phone);
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';

// ─── Message templates ─────────────────────────────────────────────────────

export function msgLivreurNouvelleLivraison(driverName: string, clientName: string, address: string): string {
  return `🚚 Bonjour ${driverName} !\n\nNouvelle livraison assignée :\n\n👤 Client : ${clientName}\n📍 Adresse : ${address}\n\nConnectez-vous sur :\n${SITE_URL}/livreur/login\n\nLe Monde de l'Esthétique 💅`;
}

export function msgLivreurAnnulation(driverName: string, clientName: string): string {
  return `❌ Bonjour ${driverName},\n\nLa livraison pour ${clientName} a été annulée.\n\nLe Monde de l'Esthétique 💅`;
}

export function msgClientBoxPrete(clientName: string, quota: string, link: string): string {
  return `Bonjour ${clientName} 👋\n\n🎁 Votre box beauté du mois est prête à être personnalisée !\n\n💰 Quota disponible : ${quota}\n\nComplétez votre sélection ici :\n${link}\n\n📅 Date limite : le 25 du mois\n\nLe Monde de l'Esthétique 💅`;
}

export function msgClientBoxConfirmee(clientName: string): string {
  return `Bonjour ${clientName} ✅\n\nVotre box a été confirmée !\nVotre conseillère prépare votre commande.\n\nVous serez notifiée dès l'expédition 📦\n\nLe Monde de l'Esthétique 💅`;
}

export function msgClientEnRoute(clientName: string, driverName: string): string {
  return `Bonjour ${clientName} 🚚\n\nVotre commande est en route !\nLivreur : ${driverName}\n\nSoyez disponible pour la réception 📦\n\nLe Monde de l'Esthétique 💅`;
}

export function msgClientLivree(clientName: string): string {
  return `Bonjour ${clientName} ✅\n\nVotre commande a bien été livrée !\n\nMerci de votre confiance 💖\n\nLe Monde de l'Esthétique 💅`;
}
