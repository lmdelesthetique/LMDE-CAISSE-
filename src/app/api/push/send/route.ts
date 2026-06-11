import { NextResponse } from 'next/server';

// Push web notifications have been removed — use /api/whatsapp/send instead
export async function POST() {
  return NextResponse.json({ error: 'Push notifications disabled — use WhatsApp' }, { status: 410 });
}
