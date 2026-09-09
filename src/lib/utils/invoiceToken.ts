// Deterministic, HMAC-signed invoice upload tokens
// Token = base64url(orderId) + '.' + HMAC-SHA256(orderId, secret)[:16]
// No DB column required — the token encodes and authenticates the order ID

function getSecret(): string {
  const secret = process.env.INVOICE_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('[invoiceToken] INVOICE_TOKEN_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set');
  return secret;
}

export async function generateInvoiceToken(orderId: string): Promise<string> {
  const secret = getSecret();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(orderId));
  const sigShort = Buffer.from(sig).toString('base64url').slice(0, 20);
  const idEncoded = Buffer.from(orderId).toString('base64url');
  return `${idEncoded}.${sigShort}`;
}

export async function verifyInvoiceToken(token: string): Promise<string | null> {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const idEncoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let orderId: string;
  try {
    orderId = Buffer.from(idEncoded, 'base64url').toString('utf-8');
  } catch {
    return null;
  }
  const expected = await generateInvoiceToken(orderId);
  const expectedSig = expected.slice(expected.indexOf('.') + 1);
  if (sig !== expectedSig) return null;
  return orderId;
}
