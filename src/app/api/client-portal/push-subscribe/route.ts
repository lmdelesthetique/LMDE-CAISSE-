import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyClientSession } from '@/lib/api/verifyClientSession';

export async function POST(req: NextRequest) {
  const { endpoint, keys, clientId, subscriptionId } = await req.json();

  if (!endpoint || !keys?.p256dh || !keys?.auth || !clientId) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const authErr = await verifyClientSession(subscriptionId, req.headers.get('x-session-token'));
  if (authErr) return authErr;

  const supabase = createAdminClient();

  await supabase.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      client_id: clientId,
      supplier_id: null,
      driver_id: null,
      ambassadrice_id: null,
    },
    { onConflict: 'endpoint' }
  );

  return NextResponse.json({ ok: true });
}
