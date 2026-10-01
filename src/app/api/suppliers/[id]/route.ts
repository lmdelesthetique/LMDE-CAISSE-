import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET    /api/suppliers/[id]
// PATCH  /api/suppliers/[id]
// DELETE /api/suppliers/[id]   — soft delete (is_active=false)

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  // Accept both camelCase (from service) and snake_case (raw)
  const patch: Record<string, any> = {};
  const map: Record<string, string> = {
    companyName: 'company_name', contactName: 'contact_name', alibabaLink: 'alibaba_link',
    bankDetails: 'bank_details', paymentConditions: 'payment_conditions',
    productionDelayDays: 'production_delay_days', shippingDelayDays: 'shipping_delay_days',
    minimumOrder: 'minimum_order', isActive: 'is_active',
  };
  for (const [camel, snake] of Object.entries(map)) {
    if (body[camel] !== undefined) patch[snake] = body[camel];
  }
  // Also pass through any snake_case keys directly
  const directKeys = ['company_name','contact_name','email','phone','whatsapp','wechat','address','country',
    'language','website','alibaba_link','categories','bank_details','payment_conditions',
    'production_delay_days','shipping_delay_days','minimum_order','notes','reliability','is_active'];
  for (const k of directKeys) {
    if (body[k] !== undefined) patch[k] = body[k];
  }

  const { data, error } = await supabase.from('suppliers').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, supplier: data });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
