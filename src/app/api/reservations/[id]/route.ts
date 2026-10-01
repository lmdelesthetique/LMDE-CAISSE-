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

const RESERVATION_ALLOWED_FIELDS = new Set([
  'pos_sale_id', 'recovery_mode', 'reservation_status', 'delivery_address',
  'delivery_phone', 'delivery_notes', 'delivery_contact', 'client_id', 'client_name',
  'client_phone', 'client_email', 'notes', 'seller_comment', 'client_comment',
  'pickup_date', 'estimated_arrival_date', 'deposit_amount', 'deposit_percent',
  'reservation_type', 'items', 'total_amount', 'remise_type', 'remise_valeur',
  'remise_montant', 'remise_motif', 'deposit_paid', 'deposit_payment_method',
  'deposit_paid_at', 'deposit_accounting_date', 'balance_paid', 'balance_payment_method',
  'balance_paid_at', 'balance_accounting_date', 'completed_at', 'ready_at',
  'cancelled_at', 'cancellation_reason', 'cashier_name', 'deposits',
]);

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
  for (const [k, v] of Object.entries(body)) {
    if (RESERVATION_ALLOWED_FIELDS.has(k)) payload[k] = v;
  }

  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('reservations')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[api/reservations PATCH]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
