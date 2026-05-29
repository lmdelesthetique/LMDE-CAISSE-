import { NextResponse } from 'next/server';
import { registerWebhook } from '@/lib/services/shopifyService';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';

export async function POST() {
  const address = `${SITE_URL}/api/shopify/webhook`;
  try {
    const result = await registerWebhook(address);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
