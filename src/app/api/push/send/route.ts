import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  console.log('=== PUSH SEND START ===');

  const vapidPublic  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail   = process.env.VAPID_EMAIL || 'lm.delesthetique@gmail.com';

  console.log('VAPID public :', vapidPublic  ? `SET (${vapidPublic.substring(0, 12)}…)` : 'MISSING ✗');
  console.log('VAPID private:', vapidPrivate ? 'SET ✓' : 'MISSING ✗');

  if (!vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: 'VAPID keys missing in environment' }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { driverId, title, pushBody, body: bodyAlt, url } = body;
  const messageBody = pushBody || bodyAlt || 'Vous avez une livraison';

  if (!driverId) return NextResponse.json({ error: 'driverId required' }, { status: 400 });

  const supabase = createAdminClient();
  const { data: row, error: fetchError } = await supabase
    .from('driver_push_subscriptions')
    .select('subscription, driver_id, created_at')
    .eq('driver_id', driverId)
    .maybeSingle();

  if (fetchError) console.error('[push/send] DB error:', fetchError.message);
  if (!row) {
    return NextResponse.json({ error: 'No push subscription for this driver', driverId }, { status: 404 });
  }

  const payload = JSON.stringify({
    title: title || '🚚 Nouvelle livraison',
    body: messageBody,
    url: url || '/livreur/dashboard',
  });

  try {
    // Dynamic import avoids webpack bundling issues with web-push native deps
    const webpush = (await import('web-push')).default;
    webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

    const result = await webpush.sendNotification(row.subscription, payload);
    console.log('[push/send] OK — status:', (result as any).statusCode ?? 201);
    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error('[push/send] error:', err.message, 'statusCode:', err.statusCode);

    if (err.statusCode === 410) {
      await supabase.from('driver_push_subscriptions').delete().eq('driver_id', driverId);
      return NextResponse.json({ error: 'Subscription expired, removed', code: 410 }, { status: 410 });
    }
    if (err.statusCode === 401) {
      return NextResponse.json({ error: 'VAPID auth failed — keys mismatch', code: 401, detail: err.body }, { status: 401 });
    }
    return NextResponse.json({ error: err.message, statusCode: err.statusCode }, { status: 500 });
  }
}
