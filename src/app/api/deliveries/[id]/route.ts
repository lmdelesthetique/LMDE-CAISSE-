import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET    /api/deliveries/[id]
// PATCH  /api/deliveries/[id]  — update any fields (status, assignment, confirmation, etc.)
// DELETE /api/deliveries/[id]  — cancel (sets status='cancelled')

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('deliveries')
    .select('*, drivers(first_name, last_name, phone)')
    .eq('id', id)
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  // Normalize camelCase → snake_case for common fields
  const patch: Record<string, any> = { ...body };
  if (body.assignedTo !== undefined) { patch.assigned_to_driver = body.assignedTo; delete patch.assignedTo; }
  if (body.assignedAt !== undefined) { patch.assigned_at = body.assignedAt; delete patch.assignedAt; }
  if (body.enRouteAt !== undefined) { patch.en_route_at = body.enRouteAt; delete patch.enRouteAt; }
  if (body.arrivedAt !== undefined) { patch.arrived_at = body.arrivedAt; delete patch.arrivedAt; }
  if (body.deliveredAt !== undefined) { patch.delivered_at = body.deliveredAt; delete patch.deliveredAt; }
  if (body.signatureUrl !== undefined) { patch.signature_url = body.signatureUrl; delete patch.signatureUrl; }
  if (body.photoUrl !== undefined) { patch.photo_url = body.photoUrl; delete patch.photoUrl; }
  if (body.driverNotes !== undefined) { patch.driver_notes = body.driverNotes; delete patch.driverNotes; }
  if (body.driverStatus !== undefined) { patch.driver_status = body.driverStatus; delete patch.driverStatus; }

  const { data, error } = await supabase.from('deliveries').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, delivery: data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
