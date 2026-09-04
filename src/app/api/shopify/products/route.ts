import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

async function fetchAllByStatus(token: string, status: string): Promise<unknown[]> {
  const results: unknown[] = [];
  let url: string | null =
    `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/products.json` +
    `?limit=250&status=${status}&fields=id,title,status,variants,image`;

  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Shopify ${res.status} (${status}): ${text}`);
    }
    const json = await res.json();
    results.push(...(json.products ?? []));
    url = parseNextUrl(res.headers.get('Link'));
  }
  return results;
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 401 });

  try {
    // Shopify products API does not support status=any — fetch each status separately
    const [active, archived, draft] = await Promise.all([
      fetchAllByStatus(token, 'active'),
      fetchAllByStatus(token, 'archived'),
      fetchAllByStatus(token, 'draft'),
    ]);

    const allProducts = [...active, ...archived, ...draft];
    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
      by_status: { active: active.length, archived: archived.length, draft: draft.length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
