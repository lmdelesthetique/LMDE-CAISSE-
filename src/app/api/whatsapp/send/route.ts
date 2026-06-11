import { NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/whatsappService';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { to, message } = body;
  if (!to || !message) {
    return NextResponse.json({ error: 'to and message required' }, { status: 400 });
  }

  const result = await sendWhatsApp({ to, message });
  return NextResponse.json(result);
}
