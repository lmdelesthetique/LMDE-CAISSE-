import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  console.log('=== PUSH SEND START ===');

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  const vapidEmail = process.env.VAPID_EMAIL || 'lm.delesthetique@gmail.com';

  console.log('VAPID public :', vapidPublic ? `SET (${vapidPublic.substring(0, 12)}…)` : 'MISSING ✗');
  console.log('VAPID private:', vapidPrivate ? 'SET ✓' : 'MISSING ✗');
  console.log('VAPID email  :', vapidEmail);

  if (!vapidPublic || !vapidPrivate) {
    console.error('[push/send] VAPID keys not configured');
    return NextResponse.json({ error: 'Push not configured — VAPID keys missing' }, { status: 503 });
  }

  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Accept both 'body' and 'pushBody' field names for flexibility
  const { driverId, title, pushBody, body: bodyAlt, url } = body;
  const messageBody = pushBody || bodyAlt || 'Vous avez une livraison';

  console.log('Driver ID:', driverId);
  console.log('Title:', title);
  console.log('Body:', messageBody);

  if (!driverId) {
    return NextResponse.json({ error: 'driverId required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row, error: fetchError } = await supabase
    .from('driver_push_subscriptions')
    .select('subscription, driver_id, created_at')
    .eq('driver_id', driverId)
    .maybeSingle();

  console.log('Subscription found:', !!row);
  if (fetchError) console.error('Subscription fetch error:', fetchError.message);
  if (!row) {
    console.log('NO SUBSCRIPTION — driver has never enabled push or it was not saved');
    return NextResponse.json({ error: 'Driver has no push subscription', driverId }, { status: 404 });
  }
  console.log('Subscription saved at:', row.created_at);

  const payload = JSON.stringify({
    title: title || '🚚 Nouvelle livraison',
    body: messageBody,
    url: url || '/livreur/dashboard',
  });

  try {
    console.log('Calling webpush.sendNotification…');
    const result = await webpush.sendNotification(row.subscription, payload);
    console.log('Push sent OK — status:', (result as any).statusCode ?? 201);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[push/send] sendNotification error:', err.message);
    console.error('[push/send] statusCode:', err.statusCode);
    console.error('[push/send] body:', err.body);

    if (err.statusCode === 410) {
      console.log('Subscription expired (410) — removing from DB');
      await supabase
        .from('driver_push_subscriptions')
        .delete()
        .eq('driver_id', driverId);
      return NextResponse.json({ error: 'Subscription expired and removed', code: 410 }, { status: 410 });
    }

    if (err.statusCode === 401) {
      return NextResponse.json({
        error: 'VAPID authentication failed — check keys match',
        code: 401,
        detail: err.body,
      }, { status: 401 });
    }

    return NextResponse.json({
      error: err.message,
      statusCode: err.statusCode,
      detail: err.body,
    }, { status: 500 });
  }
}
