import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const SCOPES = 'read_inventory,write_inventory,read_orders,read_products';
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/api/shopify/callback`;

export async function GET() {
  if (!SHOP || !CLIENT_ID) {
    return NextResponse.json({ error: 'SHOPIFY_STORE_DOMAIN and SHOPIFY_CLIENT_ID must be set' }, { status: 500 });
  }
  const state = crypto.randomBytes(16).toString('hex');
  const installUrl =
    `https://${SHOP}/admin/oauth/authorize` +
    `?client_id=${CLIENT_ID}` +
    `&scope=${SCOPES}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}` +
    `&grant_options[]=offline`;

  const response = NextResponse.redirect(installUrl);
  response.cookies.set('shopify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 300,
    path: '/',
  });
  return response;
}
