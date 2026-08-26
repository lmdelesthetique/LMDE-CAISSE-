import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('reservations').select('*').eq('id', id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Réservation introuvable' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const payload: Record<string, unknown> = {};

  if (body.pos_sale_id !== undefined) payload.pos_sale_id = body.pos_sale_id;
  if (body.recovery_mode !== undefined) payload.recovery_mode = body.recovery_mode;
  if (body.reservation_status !== undefined) payload.reservation_status = body.reservation_status;
  if (body.delivery_address !== undefined) payload.delivery_address = body.delivery_address;
  if (body.delivery_phone !== undefined) payload.delivery_phone = body.delivery_phone;
  if (body.delivery_notes !== undefined) payload.delivery_notes = body.delivery_notes;

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, recovery_mode, reservation_status, pos_sale_id')
    .single();

  if (error) {
    console.error('[api/reservations PATCH]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
