import { NextResponse } from 'next/server';
import { getAccessToken, getRecentOrders } from '@/lib/services/shopifyService';

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ connected: false, orders: [] });
  }
  const orders = await getRecentOrders(10);
  return NextResponse.json({ connected: true, orders });
}
