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
    if (phone.startsWith('0590') || phone.startsWith('0690') || phone.startsWith('0691')) {
      // Guadeloupe (+590) : landlines 0590, mobiles 0690/0691
      phone = '590' + local;
    } else if (phone.startsWith('069') || phone.startsWith('0596')) {
      // Martinique (+596) : mobiles 0696/0692/0693/0694, landlines 0596
      phone = '596' + local;
    } else if (phone.startsWith('0692') || phone.startsWith('0693')) {
      // Réunion (+262)
      phone = '262' + local;
    } else {
      // France métropolitaine : 06, 07, 01-05, 08, 09
      phone = '33' + local;
    }
  }
  // 9-digit number without country code → assume Martinique local mobile
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

async function sendTemplateViaMeta(
  phone: string,
  templateName: string,
  languageCode: string,
  components: any[] = []
): Promise<{ ok: boolean; error?: string }> {
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
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(components.length ? { components } : {}),
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (res.ok) { console.log(`[WhatsApp] ✅ template "${templateName}" sent via Meta`); return { ok: true }; }
  const errMsg = (data as any).error?.message || (data as any).error?.error_data?.details || `Meta HTTP ${res.status}`;
  console.error('[WhatsApp] Meta template error:', JSON.stringify(data));
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

// ─── Template senders (outbound business-initiated) ────────────────────────

async function withMetaFallback(
  to: string,
  templateFn: (phone: string) => Promise<{ ok: boolean; error?: string }>,
  fallbackMsg: string,
  email?: string
): Promise<WhatsAppResult> {
  const phone = cleanPhone(to);
  const waLink = `https://wa.me/${phone}`;
  const hasMetaConfig = !!(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
  const hasBrevoConfig = !!process.env.BREVO_API_KEY;
  const hasResendConfig = !!process.env.RESEND_API_KEY;

  try {
    if (hasMetaConfig) {
      const r = await templateFn(phone);
      if (r.ok) return { ok: true, waLink, provider: 'meta' };
      // Template failed — try free text (works if customer messaged within 24h)
      const r2 = await sendViaMeta(phone, fallbackMsg);
      if (r2.ok) return { ok: true, waLink, provider: 'meta' };
    }
    if (hasBrevoConfig) {
      const r = await sendViaBrevo(phone, fallbackMsg);
      if (r.ok) return { ok: true, waLink, provider: 'brevo' };
    }
    if (hasResendConfig && email) {
      const r = await sendViaResend(email, fallbackMsg);
      if (r.ok) return { ok: true, waLink, provider: 'email' };
    }
  } catch (err: any) {
    console.error('[WhatsApp] exception:', err);
  }
  return { ok: false, error: 'Envoi échoué', waLink, provider: 'manual' };
}

// ── Livreur ────────────────────────────────────────────────────────────────

// template: livreur_nouvelle_livraison | EN | {{1}}=prénom livreur {{2}}=client {{3}}=adresse
export async function sendNotifLivreurNouvelleLivraison(
  to: string,
  driverName: string,
  clientName: string,
  address: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'livreur_nouvelle_livraison', 'fr', [
      { type: 'body', parameters: [
        { type: 'text', text: driverName },
        { type: 'text', text: clientName },
        { type: 'text', text: address },
      ]},
    ]),
    msgLivreurNouvelleLivraison(driverName, clientName, address)
  );
}

// ── Clients box ────────────────────────────────────────────────────────────

// template: box_relance_commande | FR | {{1}}=prénom
export async function sendNotifBoxRelance(
  to: string,
  clientName: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'box_relance_commande', 'fr', [
      { type: 'body', parameters: [{ type: 'text', text: clientName }] },
    ]),
    `Bonjour ${clientName} ! ⏰ Plus que quelques jours pour composer votre box beauté du mois ! Les commandes ferment le 25. Le Monde de l'Esthétique 💅`
  );
}

// template: box_prete__recuperer | FR | {{1}}=prénom (retrait en boutique)
export async function sendNotifClientBoxPreteRetrait(
  to: string,
  clientName: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'box_prete__recuperer', 'fr', [
      { type: 'body', parameters: [{ type: 'text', text: clientName }] },
    ]),
    msgClientBoxPrete(clientName, '', '')
  );
}

// template: box_mise_en_livraison | FR | {{1}}=prénom (livraison à domicile en route)
export async function sendNotifClientEnRoute(
  to: string,
  clientName: string,
  driverName: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'box_mise_en_livraison', 'fr', [
      { type: 'body', parameters: [{ type: 'text', text: clientName }] },
    ]),
    msgClientEnRoute(clientName, driverName)
  );
}

// template: box_expedie | FR | {{1}}=prénom {{2}}=numéro suivi (expédition Colissimo)
export async function sendNotifClientBoxExpediee(
  to: string,
  clientName: string,
  trackingNumber: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'box_expedie', 'fr', [
      { type: 'body', parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: trackingNumber },
      ]},
    ]),
    `Bonjour ${clientName} ! 📦 Votre box a été expédiée ! Numéro de suivi : ${trackingNumber} 💕`
  );
}

// template: box_cloturee | FR | {{1}}=prénom (livrée/clôturée)
export async function sendNotifClientLivree(
  to: string,
  clientName: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'box_cloturee', 'fr', [
      { type: 'body', parameters: [{ type: 'text', text: clientName }] },
    ]),
    msgClientLivree(clientName)
  );
}

// ── Ambassadrices ──────────────────────────────────────────────────────────

// template: ambassadrice_box_prete | FR | {{1}}=prénom ambassadrice
export async function sendNotifAmbassadriceBoxPrete(
  to: string,
  firstName: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'ambassadrice_box_prete', 'fr', [
      { type: 'body', parameters: [{ type: 'text', text: firstName }] },
    ]),
    `Bonjour ${firstName} ! 🌟 Les produits de votre kit ambassadrice sont prêts. Rendez-vous sur votre espace ! Le Monde de l'Esthétique 💅`
  );
}

// ── Fournisseurs ───────────────────────────────────────────────────────────

// template: supplier_order_sent | EN | {{1}}=nom fournisseur {{2}}=référence commande
export async function sendNotifFournisseurNouvelleCommande(
  to: string,
  supplierName: string,
  orderRef: string,
  email?: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'supplier_order_sent', 'en', [
      { type: 'body', parameters: [
        { type: 'text', text: supplierName },
        { type: 'text', text: orderRef },
      ]},
    ]),
    `Hello ${supplierName}, a new order (${orderRef}) has been placed. Please visit your supplier portal. LMDE Beauty.`,
    email
  );
}

// template: supplier_order_reminder | EN | {{1}}=nom fournisseur {{2}}=référence commande
export async function sendNotifFournisseurRelance(
  to: string,
  supplierName: string,
  orderRef: string,
  email?: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'supplier_order_reminder', 'en', [
      { type: 'body', parameters: [
        { type: 'text', text: supplierName },
        { type: 'text', text: orderRef },
      ]},
    ]),
    `Hello ${supplierName}, this is a reminder that order ${orderRef} is still awaiting your confirmation. LMDE Beauty.`,
    email
  );
}

// template: supplier_invoice_link | EN | {{1}}=nom fournisseur {{2}}=référence commande {{3}}=lien dépôt
export async function sendNotifFournisseurLienFacture(
  to: string,
  supplierName: string,
  orderRef: string,
  depositLink: string,
  email?: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'supplier_invoice_link', 'en', [
      { type: 'body', parameters: [
        { type: 'text', text: supplierName },
        { type: 'text', text: orderRef },
        { type: 'text', text: depositLink },
      ]},
    ]),
    `Hello ${supplierName},\n\nPlease upload your invoice for order ${orderRef} via this secure link:\n${depositLink}\n\nLe Monde de l'Esthétique`,
    email
  );
}

// ── Campagnes marketing ────────────────────────────────────────────────────

// template: campagne_boutique | FR | {{1}}=prénom {{2}}=message {{3}}=code promo {{4}}=date
export async function sendNotifCampagneBoutique(
  to: string,
  clientName: string,
  messageAI: string,
  codePromo: string,
  dateLimite: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'campagne_boutique', 'fr', [
      { type: 'body', parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: messageAI },
        { type: 'text', text: codePromo },
        { type: 'text', text: dateLimite },
      ]},
    ]),
    `Bonjour ${clientName} ! 💅 ${messageAI} Code promo : ${codePromo} — valable jusqu'au ${dateLimite} 🌸`
  );
}

// template: campagne_site | FR | {{1}}=prénom {{2}}=message
export async function sendNotifCampagneSite(
  to: string,
  clientName: string,
  messageAI: string
): Promise<WhatsAppResult> {
  return withMetaFallback(
    to,
    (phone) => sendTemplateViaMeta(phone, 'campagne_site', 'fr', [
      { type: 'body', parameters: [
        { type: 'text', text: clientName },
        { type: 'text', text: messageAI },
      ]},
    ]),
    `Bonjour ${clientName} ! 💅 ${messageAI} Le Monde de l'Esthétique 💅`
  );
}

// Legacy alias kept for compatibility
export async function sendNotifClientBoxPrete(
  to: string,
  clientName: string,
  quota: string,
  link: string
): Promise<WhatsAppResult> {
  return sendNotifClientBoxPreteRetrait(to, clientName);
}

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
