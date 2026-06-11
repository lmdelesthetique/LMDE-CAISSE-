import { NextResponse } from 'next/server';

// Push web notifications have been removed — no subscriptions needed
export async function POST() {
  return NextResponse.json({ ok: true, note: 'Push notifications disabled' });
}
