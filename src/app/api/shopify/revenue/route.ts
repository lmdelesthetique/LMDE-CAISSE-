import { NextRequest, NextResponse } from 'next/server';
import { getShopifyRevenue } from '@/lib/services/shopifyService';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const start = searchParams.get('start') ?? '';
  const end = searchParams.get('end') ?? '';
  if (!start || !end) return NextResponse.json({ revenue: 0 });

  const revenue = await getShopifyRevenue(start, end);
  return NextResponse.json({ revenue });
}
