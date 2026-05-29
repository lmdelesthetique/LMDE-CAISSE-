import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? '';
const SCOPES = 'read_inventory,write_inventory,read_orders,read_products';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/api/shopify/callback`;

export async function GET() {
  if (!SHOP || !CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({
      error: 'Shopify env vars manquants',
      missing: [
        !SHOP && 'SHOPIFY_STORE_DOMAIN',
        !CLIENT_ID && 'SHOPIFY_CLIENT_ID',
        !CLIENT_SECRET && 'SHOPIFY_CLIENT_SECRET',
      ].filter(Boolean),
    }, { status: 500 });
  }

  // Stateless state: HMAC(timestamp, CLIENT_SECRET) — no cookies needed
  const ts = Date.now().toString();
  const hash = crypto.createHmac('sha256', CLIENT_SECRET).update(ts).digest('hex').slice(0, 32);
  const state = `${ts}.${hash}`;

  const installUrl =
    `https://${SHOP}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${encodeURIComponent(state)}` +
    `&grant_options[]=offline`;

  return NextResponse.redirect(installUrl);
}
