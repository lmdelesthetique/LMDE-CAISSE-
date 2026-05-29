import { NextRequest, NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  '';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token: string = (body.token ?? '').trim();

  if (!token || token.length < 20) {
    return NextResponse.json({ ok: false, error: 'Token invalide ou trop court' }, { status: 400 });
  }

  // Verify the token actually works before saving
  let shopName: string | null = null;
  try {
    const shopRes = await fetch(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-10/shop.json`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );
    if (!shopRes.ok) {
      return NextResponse.json({ ok: false, error: `Token rejeté par Shopify — HTTP ${shopRes.status}` }, { status: 400 });
    }
    const shopJson = await shopRes.json();
    shopName = shopJson.shop?.name ?? null;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: `Impossible de contacter Shopify: ${e.message}` }, { status: 502 });
  }

  // Save to Supabase
  const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/app_config`, {
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

  if (!saveRes.ok) {
    const errText = await saveRes.text();
    console.error('[save-token] Supabase save failed:', saveRes.status, errText);
    return NextResponse.json({
      ok: false,
      error: `Supabase save failed (${saveRes.status}): ${errText}`,
      fix: 'Ajoute SUPABASE_SERVICE_ROLE_KEY dans Vercel OU exécute ALTER TABLE app_config DISABLE ROW LEVEL SECURITY dans Supabase',
    }, { status: 500 });
  }

  return NextResponse.json({ ok: true, shopName });
}
