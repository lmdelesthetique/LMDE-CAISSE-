import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const { endpoint, keys, lienUnique } = await req.json();

  if (!endpoint || !keys?.p256dh || !keys?.auth || !lienUnique) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: amb } = await supabase
    .from('ambassadrices')
    .select('id')
    .eq('lien_unique', lienUnique)
    .maybeSingle();

  if (!amb) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });

  await supabase.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      ambassadrice_id: amb.id,
      supplier_id: null,
      driver_id: null,
    },
    { onConflict: 'endpoint' }
  );

  return NextResponse.json({ ok: true });
}
