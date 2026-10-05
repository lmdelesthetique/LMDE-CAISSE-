import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ driverId: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { driverId } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('drivers').select('*').eq('id', driverId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { driverId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const u: any = {};
  if (body.first_name !== undefined) u.first_name = body.first_name;
  if (body.last_name !== undefined) u.last_name = body.last_name;
  if (body.phone !== undefined) u.phone = body.phone;
  if (body.pin_code !== undefined) u.pin_code = body.pin_code;
  if (body.notes !== undefined) u.notes = body.notes;
  if (body.status !== undefined) u.status = body.status;
  if (body.driver_status !== undefined) u.driver_status = body.driver_status;

  const { data, error } = await supabase.from('drivers').update(u).eq('id', driverId).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { driverId } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('drivers').delete().eq('id', driverId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
