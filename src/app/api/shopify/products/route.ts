import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

async function fetchCount(token: string, status: string): Promise<number> {
  const res = await fetch(
    `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/products/count.json?status=${status}`,
    { headers: { 'X-Shopify-Access-Token': token }, next: { revalidate: 0 } }
  );
  if (!res.ok) return 0;
  const j = await res.json();
  return j.count ?? 0;
}

// Fetch all products for a given status, sequentially paginated
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
    // First: get official counts from Shopify count API (fast, no pagination needed)
    const [countActive, countArchived, countDraft] = await Promise.all([
      fetchCount(token, 'active'),
      fetchCount(token, 'archived'),
      fetchCount(token, 'draft'),
    ]);
    const totalExpected = countActive + countArchived + countDraft;

    // Then: fetch all products sequentially per status to avoid rate limiting
    const active = await fetchAllByStatus(token, 'active');
    const archived = await fetchAllByStatus(token, 'archived');
    const draft = await fetchAllByStatus(token, 'draft');

    const allProducts = [...active, ...archived, ...draft];

    // Count total variants across all products
    const totalVariants = allProducts.reduce((s, p: any) => s + (p.variants?.length ?? 0), 0);

    return NextResponse.json({
      products: allProducts,
      total: allProducts.length,
      total_variants: totalVariants,
      shopify_count_api: { active: countActive, archived: countArchived, draft: countDraft, total: totalExpected },
      by_status: { active: active.length, archived: archived.length, draft: draft.length },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
