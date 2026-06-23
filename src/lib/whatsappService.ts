export interface WhatsAppMessage {
  to: string;
  message: string;
}

export interface WhatsAppResult {
  ok: boolean;
  error?: string;
  waLink: string;
  provider?: 'meta' | 'brevo' | 'manual';
}

function cleanPhone(raw: string): string {
  let phone = raw.replace(/\s+/g, '').replace(/^\+/, '').replace(/^0/, '596');
  if (!phone.startsWith('596') && !phone.startsWith('590') && phone.length === 9) {
    phone = '596' + phone;
  }
  return phone;
}

async function sendViaMeta(phone: string, message: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { ok: false, error: 'Meta API not configured' };

  const res = await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
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
  console.error('[WhatsApp] Meta error:', data);
  return { ok: false, error: (data as any).error?.message || `Meta HTTP ${res.status}` };
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

export async function sendWhatsApp({ to, message }: WhatsAppMessage): Promise<WhatsAppResult> {
  const phone = cleanPhone(to);
  const waLink = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  console.log('[WhatsApp] → phone:', phone);

  const hasMetaConfig = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasBrevoConfig = !!process.env.BREVO_API_KEY;

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
  } catch (err: any) {
    console.error('[WhatsApp] exception:', err);
    return { ok: false, error: err.message, waLink, provider: 'manual' };
  }

  return { ok: false, error: 'Aucune API WhatsApp configurée', waLink, provider: 'manual' };
}

export function getWhatsAppLink(phone: string, message: string): string {
  const cleaned = cleanPhone(phone);
  return `https://wa.me/${cleaned}?text=${encodeURIComponent(message)}`;
}

// ─── Message templates ─────────────────────────────────────────────────────

export function msgLivreurNouvelleLivraison(driverName: string, clientName: string, address: string): string {
  return `🚚 Bonjour ${driverName} !\n\nNouvelle livraison assignée :\n\n👤 Client : ${clientName}\n📍 Adresse : ${address}\n\nConnectez-vous sur :\nlmdecaisse.com/livreur/login\n\nLe Monde de l'Esthétique 💅`;
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
