import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { endpoint, keys, driverId, supplierId } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Subscription invalide' }, { status: 400 });
  }
  if (!driverId && !supplierId) {
    return NextResponse.json({ error: 'driverId ou supplierId requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  await supabase.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      driver_id: driverId ?? null,
      supplier_id: supplierId ?? null,
    },
    { onConflict: 'endpoint' }
  );

  return NextResponse.json({ ok: true });
}
