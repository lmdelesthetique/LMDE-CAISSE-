import { NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ error: 'Token manquant' }, { status: 401 });

  const allProducts: unknown[] = [];
  let url: string | null =
    `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/products.json` +
    `?limit=250&status=active&fields=id,title,status,variants,image`;

  try {
    while (url) {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Shopify ${res.status}: ${text}` }, { status: res.status });
      }
      const json = await res.json();
      allProducts.push(...(json.products ?? []));
      url = parseNextUrl(res.headers.get('Link'));
    }
    return NextResponse.json({ products: allProducts, total: allProducts.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
