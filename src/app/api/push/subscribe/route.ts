import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { endpoint, keys, driverId, supplierId, ambassadriceId, clientId, isAdmin } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Subscription invalide' }, { status: 400 });
  }
  if (!driverId && !supplierId && !ambassadriceId && !clientId && !isAdmin) {
    return NextResponse.json({ error: 'identifiant requis' }, { status: 400 });
  }

  const supabase = createAdminClient();

  await supabase.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      driver_id: driverId ?? null,
      supplier_id: supplierId ?? null,
      ambassadrice_id: ambassadriceId ?? null,
      client_id: clientId ?? null,
      is_admin: isAdmin ? true : null,
    },
    { onConflict: 'endpoint' }
  );

  return NextResponse.json({ ok: true });
}
