import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { saveAccessToken } from '@/lib/services/shopifyService';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN!;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL!;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');

  if (!code || !state || !hmac) {
    return NextResponse.json({ error: 'Missing required params' }, { status: 400 });
  }

  // Verify state matches cookie
  const storedState = req.cookies.get('shopify_oauth_state')?.value;
  if (!storedState || state !== storedState) {
    return NextResponse.json({ error: 'Invalid state — possible CSRF' }, { status: 403 });
  }

  // Verify HMAC
  const params = Object.fromEntries(searchParams.entries()) as Record<string, string>;
  delete params['hmac'];
  delete params['signature'];
  const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const digest = crypto.createHmac('sha256', CLIENT_SECRET).update(message).digest('hex');
  if (digest !== hmac) {
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 403 });
  }

  // Exchange code for access token
  const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    console.error('Shopify token exchange failed:', text);
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }

  const { access_token } = await tokenRes.json();
  await saveAccessToken(access_token);

  const response = NextResponse.redirect(`${SITE_URL}/?shopify=connected`);
  response.cookies.delete('shopify_oauth_state');
  return response;
}
