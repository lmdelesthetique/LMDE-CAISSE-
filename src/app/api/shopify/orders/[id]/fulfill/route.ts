import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

async function shopifyFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  if (!token) throw new Error('Shopify non connecté');
  return fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token, ...options.headers },
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // 1. Get fulfillment orders for this order
    const foRes = await shopifyFetch(`/orders/${id}/fulfillment_orders.json`);
    if (!foRes.ok) {
      const txt = await foRes.text();
      return NextResponse.json({ error: `Shopify: ${foRes.status} ${txt.slice(0, 120)}` }, { status: 502 });
    }
    const foData = await foRes.json();
    const fulfillmentOrders: any[] = foData.fulfillment_orders ?? [];

    if (!fulfillmentOrders.length) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_fulfillment_orders' });
    }

    // 2. Fulfill each open fulfillment order
    const results: any[] = [];
    for (const fo of fulfillmentOrders) {
      if (fo.status !== 'open') continue;
      const body = {
        fulfillment: {
          line_items_by_fulfillment_order: [{ fulfillment_order_id: fo.id }],
          notify_customer: false,
        },
      };
      const res = await shopifyFetch('/fulfillments.json', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      results.push({ fulfillment_order_id: fo.id, ok: res.ok, data });
    }

    const allOk = results.every(r => r.ok);
    return NextResponse.json({ ok: allOk, results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
