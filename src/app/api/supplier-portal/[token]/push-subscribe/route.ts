import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createAdminClient();

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('id')
    .eq('portal_login', params.token)
    .maybeSingle();

  if (!supplier) return NextResponse.json({ error: 'Token invalide' }, { status: 404 });

  const { endpoint, keys } = await req.json();
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Subscription invalide' }, { status: 400 });
  }

  await supabase.from('push_subscriptions').upsert(
    {
      supplier_id: supplier.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    { onConflict: 'supplier_id,endpoint' }
  );

  return NextResponse.json({ ok: true });
}
