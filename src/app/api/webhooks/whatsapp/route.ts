import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET — Meta webhook verification
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get('hub.mode');
  const token     = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[WhatsApp Webhook] ✅ verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] ❌ verification failed', { mode, token });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — receive incoming messages and log to Supabase
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[WhatsApp Webhook] incoming:', JSON.stringify(body));

  try {
    const supabase = makeAdminClient();

    // Extract relevant fields from Meta payload
    const entry   = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;
    const messages = value?.messages ?? [];

    for (const msg of messages) {
      const from    = msg.from ?? null;
      const type    = msg.type ?? 'unknown';
      const text    = msg.text?.body ?? msg.caption ?? null;
      const msgId   = msg.id ?? null;
      const timestamp = msg.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString();

      await supabase.from('notification_log').insert({
        channel:    'whatsapp',
        direction:  'inbound',
        from_phone: from,
        message_id: msgId,
        message_type: type,
        body:       text,
        raw:        msg,
        created_at: timestamp,
      });
    }

    // If no messages (status updates, read receipts, etc.), still log the raw event
    if (messages.length === 0 && value) {
      await supabase.from('notification_log').insert({
        channel:   'whatsapp',
        direction: 'inbound',
        message_type: 'event',
        body:      null,
        raw:       body,
        created_at: new Date().toISOString(),
      });
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] Supabase error:', err.message);
    // Still return 200 so Meta doesn't retry indefinitely
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
