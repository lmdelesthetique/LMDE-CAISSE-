import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'lm.delesthetique@gmail.com'),
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { driverId, title, pushBody, url } = body;

  if (!driverId) {
    return NextResponse.json({ error: 'driverId required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: row, error: fetchError } = await supabase
    .from('driver_push_subscriptions')
    .select('subscription')
    .eq('driver_id', driverId)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: 'Driver not subscribed to push' }, { status: 404 });
  }

  try {
    await webpush.sendNotification(
      row.subscription,
      JSON.stringify({
        title: title || '🚚 Nouvelle livraison',
        body: pushBody || 'Vous avez une livraison',
        url: url || '/livreur/dashboard',
      })
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Subscription expired → clean it up
    if (err.statusCode === 410) {
      await supabase
        .from('driver_push_subscriptions')
        .delete()
        .eq('driver_id', driverId);
      return NextResponse.json({ error: 'Subscription expired, removed' }, { status: 410 });
    }

    console.error('[push/send] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
