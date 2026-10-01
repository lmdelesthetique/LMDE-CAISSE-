import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET   /api/supplier-payments?supplierId=xxx
// POST  /api/supplier-payments             — create payment
// PATCH /api/supplier-payments?id=xxx      — update status

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('supplier_payments')
    .select('*')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('supplier_payments')
    .insert({
      supplier_id: body.supplier_id ?? body.supplierId,
      order_id: body.order_id ?? body.orderId ?? null,
      amount: body.amount,
      currency: body.currency ?? 'EUR',
      exchange_rate: body.exchange_rate ?? body.exchangeRate ?? 1,
      payment_method: body.payment_method ?? body.paymentMethod ?? 'wire_transfer',
      payment_status: body.payment_status ?? body.paymentStatus ?? 'pending',
      proof_url: body.proof_url ?? body.proofUrl ?? null,
      paid_at: body.paid_at ?? body.paidAt ?? null,
      notes: body.notes ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, payment: data });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const updateData: Record<string, any> = { payment_status: body.payment_status ?? body.status };
  if ((body.payment_status ?? body.status) === 'confirmed') {
    updateData.confirmed_at = new Date().toISOString();
  }
  const { error } = await supabase.from('supplier_payments').update(updateData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
