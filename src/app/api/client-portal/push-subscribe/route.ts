import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { endpoint, keys, clientId } = await req.json();

  if (!endpoint || !keys?.p256dh || !keys?.auth || !clientId) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

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
