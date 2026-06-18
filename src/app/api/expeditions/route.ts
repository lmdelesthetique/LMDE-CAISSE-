import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = makeAdminClient();

  // Avoid duplicate for same Shopify order
  if (body.shopifyOrderId) {
    const { data: existing } = await supabase
      .from('expeditions')
      .select('id')
      .eq('shopify_order_id', String(body.shopifyOrderId))
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ id: existing.id, duplicate: true });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('expeditions')
    .insert({
      shopify_order_id: body.shopifyOrderId ? String(body.shopifyOrderId) : null,
      shopify_order_number: body.shopifyOrderNumber ?? null,
      client_name: body.clientName ?? '',
      client_phone: body.clientPhone ?? null,
      shipping_address: body.shippingAddress ?? '',
      carrier: body.carrier ?? 'Colissimo',
      products: body.products ?? [],
      total_amount: body.totalAmount ?? null,
      notes: body.notes ?? null,
      status: 'pending',
      created_at: now,
      updated_at: now,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[api/expeditions POST]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
