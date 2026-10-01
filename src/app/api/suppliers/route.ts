import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET  /api/suppliers          — list all active
// POST /api/suppliers          — create supplier

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('is_active', true)
    .order('company_name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const pin = String(Math.floor(100000 + Math.random() * 900000));
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      company_name: body.company_name ?? body.companyName,
      contact_name: body.contact_name ?? body.contactName ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      whatsapp: body.whatsapp ?? null,
      wechat: body.wechat ?? null,
      address: body.address ?? null,
      country: body.country ?? 'Chine',
      language: body.language ?? 'Chinois',
      website: body.website ?? null,
      alibaba_link: body.alibaba_link ?? body.alibabaLink ?? null,
      categories: body.categories ?? [],
      bank_details: body.bank_details ?? body.bankDetails ?? null,
      payment_conditions: body.payment_conditions ?? body.paymentConditions ?? null,
      production_delay_days: body.production_delay_days ?? body.productionDelayDays ?? 14,
      shipping_delay_days: body.shipping_delay_days ?? body.shippingDelayDays ?? 21,
      minimum_order: body.minimum_order ?? body.minimumOrder ?? null,
      notes: body.notes ?? null,
      reliability: body.reliability ?? 'unknown',
      portal_login: pin,
      portal_password_plain: null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // SECURITY DEFINER RPC — creates portal user record
  if (data?.id) {
    await supabase.rpc('upsert_supplier_portal_pin', { p_supplier_id: data.id, p_pin: pin })
      .then(({ error: rpcErr }) => {
        if (rpcErr) console.error('[api/suppliers POST] portal pin rpc error:', rpcErr.message);
      });
  }

  return NextResponse.json({ ok: true, supplier: data });
}
