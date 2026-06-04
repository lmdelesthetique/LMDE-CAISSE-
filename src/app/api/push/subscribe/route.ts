import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
  try {
    const { driverId, subscription } = await request.json();

    if (!driverId || !subscription) {
      return NextResponse.json(
        { error: 'driverId and subscription required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('driver_push_subscriptions')
      .upsert({ driver_id: driverId, subscription }, { onConflict: 'driver_id' });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[push/subscribe] error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
