import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET  /api/deliveries?status=xxx&driverId=xxx
// POST /api/deliveries — create delivery

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status');
  const driverId = req.nextUrl.searchParams.get('driverId');
  const supabase = createAdminClient();

  let q = supabase
    .from('deliveries')
    .select('*, drivers(first_name, last_name, phone, driver_status)')
    .order('created_at', { ascending: false });

  if (driverId) {
    q = (q as any).eq('assigned_to_driver', driverId).not('status', 'eq', 'cancelled');
  } else if (status && status !== 'all') {
    q = (q as any).eq('status', status);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const insertData: any = {
    client_name: body.client_name ?? body.clientName,
    client_phone: body.client_phone ?? body.clientPhone ?? null,
    delivery_address: body.delivery_address ?? body.deliveryAddress,
    delivery_notes: body.delivery_notes ?? body.deliveryNotes ?? null,
    products: body.products ?? null,
    total_amount: body.total_amount ?? body.totalAmount ?? null,
    estimated_time: body.estimated_time ?? body.estimatedTime ?? null,
    shopify_order_id: body.shopify_order_id ?? body.shopifyOrderId ?? null,
    shopify_order_number: body.shopify_order_number ?? body.shopifyOrderNumber ?? null,
    status: (body.assigned_to ?? body.assignedTo) ? 'assigned' : 'pending',
  };
  const assignedTo = body.assigned_to ?? body.assignedTo;
  if (assignedTo) {
    insertData.assigned_to_driver = assignedTo;
    insertData.assigned_at = new Date().toISOString();
  }

  const { data, error } = await supabase.from('deliveries').insert(insertData).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, delivery: data });
}
