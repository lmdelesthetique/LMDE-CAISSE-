import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET   /api/supplier-claims?supplierId=xxx
// POST  /api/supplier-claims             — create claim
// PATCH /api/supplier-claims?id=xxx      — update status

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'supplierId requis' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('supplier_claims')
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
    .from('supplier_claims')
    .insert({
      supplier_id: body.supplier_id ?? body.supplierId,
      order_id: body.order_id ?? body.orderId ?? null,
      claim_type: body.claim_type ?? body.claimType ?? 'other',
      claim_status: body.claim_status ?? body.claimStatus ?? 'draft',
      requested_action: body.requested_action ?? body.requestedAction ?? 'refund',
      product_name: body.product_name ?? body.productName ?? null,
      description: body.description ?? null,
      affected_quantity: body.affected_quantity ?? body.affectedQuantity ?? 1,
      estimated_loss: body.estimated_loss ?? body.estimatedLoss ?? 0,
      photo_urls: body.photo_urls ?? body.photoUrls ?? [],
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, claim: data });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const updateData: Record<string, any> = { claim_status: body.claim_status ?? body.status };
  if (body.resolution_notes ?? body.notes) updateData.resolution_notes = body.resolution_notes ?? body.notes;
  const { error } = await supabase.from('supplier_claims').update(updateData).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
