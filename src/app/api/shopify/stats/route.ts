import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

export async function GET(request: NextRequest) {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) {
    return NextResponse.json({ ca: 0, orders: 0, avgCart: 0, connected: false });
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start') ?? new Date(Date.now() - 30 * 24 * 3600000).toISOString();
  const end = searchParams.get('end') ?? new Date().toISOString();

  try {
    const params = new URLSearchParams({
      status: 'any',
      financial_status: 'paid',
      created_at_min: start,
      created_at_max: end,
      limit: '250',
      fields: 'id,total_price,created_at',
    });

    const res = await fetch(
      `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/orders.json?${params}`,
      { headers: { 'X-Shopify-Access-Token': token } }
    );

    if (!res.ok) return NextResponse.json({ ca: 0, orders: 0, avgCart: 0, connected: true });

    const data = await res.json();
    const orders: Array<{ total_price: string }> = data.orders ?? [];
    const ca = orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
    const count = orders.length;

    return NextResponse.json({
      ca: Math.round(ca * 100) / 100,
      orders: count,
      avgCart: count > 0 ? Math.round((ca / count) * 100) / 100 : 0,
      connected: true,
    });
  } catch {
    return NextResponse.json({ ca: 0, orders: 0, avgCart: 0, connected: false });
  }
}
