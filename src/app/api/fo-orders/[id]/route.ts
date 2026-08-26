import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const FIELD_MAP: Record<string, string> = {
  orderStatus: 'order_status',
  notes: 'notes',
  internalNotes: 'internal_notes',
  trackingNumber: 'tracking_number',
  expectedDeliveryAt: 'expected_delivery_at',
  shippedAt: 'shipped_at',
  receivedAt: 'received_at',
  subtotal: 'subtotal',
  transportCost: 'transport_cost',
  customsCost: 'customs_cost',
  vatImport: 'vat_import',
  freightForwarderCost: 'freight_forwarder_cost',
  bankFees: 'bank_fees',
  exchangeFees: 'exchange_fees',
  localDelivery: 'local_delivery',
  otherCosts: 'other_costs',
  totalRealCost: 'total_real_cost',
  costMethod: 'cost_method',
  costsValidated: 'costs_validated',
  stockIntegrated: 'stock_integrated',
  stockUpdated: 'stock_updated',
  stockUpdatedAt: 'stock_updated_at',
  paymentStatus: 'payment_status',
  paymentMethod: 'payment_method',
  paymentAmount: 'payment_amount',
  paymentDate: 'payment_date',
  paymentProofUrl: 'payment_proof_url',
  balanceDue: 'balance_due',
  supplierValidated: 'supplier_validated',
  supplierComment: 'supplier_comment',
  supplierFinalAmount: 'supplier_final_amount',
  orderGroup: 'order_group',
  transportMethod: 'transport_method',
  currency: 'currency',
  exchangeRate: 'exchange_rate',
};

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
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };

  for (const [camelKey, dbCol] of Object.entries(FIELD_MAP)) {
    if (body[camelKey] !== undefined) {
      u[dbCol] = body[camelKey];
    }
  }

  if (Object.keys(u).length === 1) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('fo_orders')
    .update(u)
    .eq('id', id)
    .select('id, order_status, total_real_cost, subtotal, costs_validated, stock_updated')
    .single();

  if (error) {
    console.error('[api/fo-orders PATCH]', error.message, { id, u });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = createAdminClient();
  await supabase.from('fo_order_lines').delete().eq('order_id', id);
  const { error } = await supabase.from('fo_orders').delete().eq('id', id);
  if (error) {
    console.error('[api/fo-orders DELETE]', error.message, { id });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
