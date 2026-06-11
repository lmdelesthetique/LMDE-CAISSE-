import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

export async function GET(request: NextRequest) {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) {
    return NextResponse.json({ orders: [], count: 0 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since')
    ?? new Date(Date.now() - 5 * 60 * 1000).toISOString();

  try {
    const params = new URLSearchParams({
      status: 'open',
      financial_status: 'paid',
      created_at_min: since,
      fields: 'id,order_number,created_at,total_price,financial_status,customer,line_items',
      limit: '10',
    });

    const res = await fetch(
      `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/orders.json?${params}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!res.ok) return NextResponse.json({ orders: [], count: 0 });

    const data = await res.json();
    const orders = data.orders ?? [];
    return NextResponse.json({ orders, count: orders.length });
  } catch {
    return NextResponse.json({ orders: [], count: 0 });
  }
}
