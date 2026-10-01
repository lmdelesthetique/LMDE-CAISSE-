import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ driverId: string }> };

// PATCH /api/deliveries/drivers/[driverId]/status
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { driverId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('drivers')
    .update({ driver_status: body.driver_status })
    .eq('id', driverId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
