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

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN ?? 'lmde-webhook-2024';

  if (mode === 'subscribe' && token === verifyToken && challenge) {
    console.log('[WhatsApp Webhook] ✅ verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[WhatsApp Webhook] ❌ verification failed', { mode, token });
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// POST — receive delivery statuses + incoming messages from Meta
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log('[WhatsApp Webhook] incoming:', JSON.stringify(body).slice(0, 500));

  try {
    const supabase = makeAdminClient();
    const entry   = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    // ── Delivery status updates (sent/delivered/read/failed) ──────────────
    const statuses: any[] = value?.statuses ?? [];
    for (const status of statuses) {
      const statusType = status.status; // sent | delivered | read | failed
      const recipient  = status.recipient_id;
      const msgId      = status.id;
      const ts         = status.timestamp
        ? new Date(Number(status.timestamp) * 1000).toISOString()
        : new Date().toISOString();
      const errorCode  = status.errors?.[0]?.code ?? null;
      const errorMsg   = status.errors?.[0]?.message ?? null;

      console.log(`[WhatsApp Webhook] status=${statusType} to=${recipient} wamid=${msgId} error=${errorCode ?? 'none'}`);

      await supabase.from('notification_log').insert({
        channel:      'whatsapp',
        direction:    'outbound_status',
        from_phone:   recipient,
        message_id:   msgId,
        message_type: statusType,
        body:         errorMsg ?? statusType,
        raw:          status,
        created_at:   ts,
      }).then(({ error }) => {
        if (error) console.error('[WebhookDB] status insert:', error.message);
      });
    }

    // ── Inbound messages ──────────────────────────────────────────────────
    const messages: any[] = value?.messages ?? [];
    for (const msg of messages) {
      const from    = msg.from ?? null;
      const type    = msg.type ?? 'unknown';
      const text    = msg.text?.body ?? msg.caption ?? null;
      const msgId   = msg.id ?? null;
      const ts      = msg.timestamp
        ? new Date(Number(msg.timestamp) * 1000).toISOString()
        : new Date().toISOString();

      console.log(`[WhatsApp Webhook] inbound from=${from} type=${type}`);

      await supabase.from('notification_log').insert({
        channel:      'whatsapp',
        direction:    'inbound',
        from_phone:   from,
        message_id:   msgId,
        message_type: type,
        body:         text,
        raw:          msg,
        created_at:   ts,
      }).then(({ error }) => {
        if (error) console.error('[WebhookDB] message insert:', error.message);
      });
    }

    // ── Unknown events ────────────────────────────────────────────────────
    if (statuses.length === 0 && messages.length === 0 && value) {
      await supabase.from('notification_log').insert({
        channel:      'whatsapp',
        direction:    'event',
        message_type: 'unknown',
        body:         JSON.stringify(value).slice(0, 500),
        raw:          body,
        created_at:   new Date().toISOString(),
      }).then(({ error }) => {
        if (error) console.error('[WebhookDB] event insert:', error.message);
      });
    }
  } catch (err: any) {
    console.error('[WhatsApp Webhook] error:', err.message);
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
