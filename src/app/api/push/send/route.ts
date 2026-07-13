import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import webpush from 'web-push';

export async function POST(req: NextRequest) {
  const { driverId, supplierId, ambassadriceId, clientId, title, pushBody, url } = await req.json();

  if (!driverId && !supplierId && !ambassadriceId && !clientId) {
    return NextResponse.json({ error: 'driverId, supplierId, ambassadriceId ou clientId requis' }, { status: 400 });
  }
  if (!process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ error: 'VAPID non configuré' }, { status: 500 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  const supabase = createAdminClient();

  const query = supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth');

  if (driverId) query.eq('driver_id', driverId);
  else if (ambassadriceId) query.eq('ambassadrice_id', ambassadriceId);
  else if (clientId) query.eq('client_id', clientId);
  else query.eq('supplier_id', supplierId);

  const { data: subs } = await query;

  const payload = JSON.stringify({
    title: title || 'BeautyPOS',
    body: pushBody || '',
    url: url || '/',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
  });

  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
    } catch {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    }
  }

  return NextResponse.json({ ok: true, sent: (subs ?? []).length });
}
