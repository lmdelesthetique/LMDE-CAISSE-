import { NextResponse } from 'next/server';

export async function GET() {
  const hasKey = !!process.env.BREVO_API_KEY;

  return NextResponse.json({
    configured: hasKey,
    keyPrefix: hasKey
      ? process.env.BREVO_API_KEY!.substring(0, 8) + '...'
      : 'missing',
    message: hasKey
      ? 'Brevo WhatsApp configuré ✅'
      : 'BREVO_API_KEY manquante dans Vercel ❌',
  });
}
