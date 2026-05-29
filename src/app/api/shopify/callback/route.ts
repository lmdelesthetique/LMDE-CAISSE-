import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOP = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET ?? '';
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
// Service role key takes priority — guaranteed to bypass RLS
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

async function persistToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        key: 'shopify_access_token',
        value: token,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[shopify/callback] persistToken failed:', res.status, body);
      return { ok: false, error: `Supabase ${res.status}: ${body}` };
    }
    console.log('[shopify/callback] Token saved to app_config ✅');
    return { ok: true };
  } catch (e: any) {
    console.error('[shopify/callback] persistToken exception:', e.message);
    return { ok: false, error: e.message };
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const hmac = searchParams.get('hmac');
  const shop = searchParams.get('shop');

  console.log('[shopify/callback] Received — shop:', shop, 'code present:', !!code, 'hmac present:', !!hmac);

  if (!code || !state || !hmac) {
    console.error('[shopify/callback] Missing params — code:', !!code, 'state:', !!state, 'hmac:', !!hmac);
    return NextResponse.json({ error: 'Missing required params', code: !!code, state: !!state, hmac: !!hmac }, { status: 400 });
  }

  // ── 1. Verify stateless state ───────────────────────────────────────────────
  // state = "{timestamp}.{HMAC(timestamp, CLIENT_SECRET)[0:32]}"
  const stateParts = decodeURIComponent(state).split('.');
  if (stateParts.length === 2 && CLIENT_SECRET) {
    const [ts, hash] = stateParts;
    const expectedHash = crypto.createHmac('sha256', CLIENT_SECRET).update(ts).digest('hex').slice(0, 32);
    const age = Date.now() - Number(ts);
    if (hash !== expectedHash) {
      console.error('[shopify/callback] State HMAC mismatch');
      return NextResponse.json({ error: 'Invalid state (HMAC mismatch)' }, { status: 403 });
    }
    if (age > 15 * 60 * 1000) {
      console.error('[shopify/callback] State expired — age ms:', age);
      return NextResponse.json({ error: 'State expired — restart OAuth' }, { status: 403 });
    }
    console.log('[shopify/callback] State valid ✅ age:', Math.round(age / 1000), 's');
  } else {
    // Fallback: accept any state if CLIENT_SECRET is missing (dev mode)
    console.warn('[shopify/callback] State format unrecognised — skipping verification');
  }

  // ── 2. Verify Shopify HMAC ─────────────────────────────────────────────────
  const params = Object.fromEntries(searchParams.entries()) as Record<string, string>;
  delete params['hmac'];
  delete params['signature'];
  const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
  const digest = crypto.createHmac('sha256', CLIENT_SECRET).update(message).digest('hex');
  if (digest !== hmac) {
    console.error('[shopify/callback] HMAC verification failed — expected:', digest, 'got:', hmac);
    return NextResponse.json({ error: 'HMAC verification failed' }, { status: 403 });
  }
  console.log('[shopify/callback] HMAC verified ✅');

  // ── 3. Exchange code for access token ─────────────────────────────────────
  console.log('[shopify/callback] Exchanging code for token at:', `https://${SHOP}/admin/oauth/access_token`);
  let access_token: string;
  try {
    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[shopify/callback] Token exchange failed:', tokenRes.status, body);
      return NextResponse.json({ error: 'Token exchange failed', status: tokenRes.status, body }, { status: 500 });
    }
    const json = await tokenRes.json();
    access_token = json.access_token;
    if (!access_token) {
      console.error('[shopify/callback] No access_token in response:', JSON.stringify(json));
      return NextResponse.json({ error: 'No access_token in Shopify response', response: json }, { status: 500 });
    }
    console.log('[shopify/callback] Token received ✅ prefix:', access_token.slice(0, 8) + '…');
  } catch (e: any) {
    console.error('[shopify/callback] Token exchange exception:', e.message);
    return NextResponse.json({ error: 'Token exchange exception', message: e.message }, { status: 500 });
  }

  // ── 4. Save token to Supabase ─────────────────────────────────────────────
  const saveResult = await persistToken(access_token);
  if (!saveResult.ok) {
    // Return error page with the token so the user can save it manually
    console.error('[shopify/callback] Token NOT saved:', saveResult.error);
    return NextResponse.json({
      error: 'Token reçu mais non sauvegardé — RLS ou clé manquante',
      supabase_error: saveResult.error,
      fix: 'Ajoute SUPABASE_SERVICE_ROLE_KEY dans Vercel env vars ET exécute: ALTER TABLE app_config DISABLE ROW LEVEL SECURITY; dans Supabase SQL editor',
    }, { status: 500 });
  }

  const response = NextResponse.redirect(`${SITE_URL}/dashboard?shopify=connected`);
  return response;
}
