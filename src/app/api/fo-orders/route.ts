import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET  /api/fo-orders?supplierId=xxx   — orders for a supplier (or all if omitted)
// POST /api/fo-orders                  — create order + lines

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  const status = req.nextUrl.searchParams.get('status');
  const from = req.nextUrl.searchParams.get('from');
  const to = req.nextUrl.searchParams.get('to');
  const supabase = createAdminClient();
  let q = supabase
    .from('fo_orders')
    .select('*, fo_order_lines(*), suppliers(company_name)')
    .order('created_at', { ascending: false });
  if (supplierId) q = q.eq('supplier_id', supplierId);
  if (status) q = q.eq('order_status', status);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();

  const orderNum = body.order_number ?? `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  const subtotal = Number(body.subtotal) || 0;
  const transportCost = Number(body.transport_cost) || 0;
  const customsCost = Number(body.customs_cost) || 0;
  const totalRealCost = Number(body.total_real_cost) || subtotal + transportCost + customsCost;

  const { data, error } = await supabase
    .from('fo_orders')
    .insert({
      supplier_id: body.supplier_id,
      order_number: orderNum,
      order_status: body.order_status ?? 'draft',
      currency: body.currency ?? 'EUR',
      exchange_rate: body.exchange_rate ?? 1,
      notes: body.notes ?? null,
      internal_notes: body.internal_notes ?? null,
      expected_delivery_at: body.expected_delivery_at ?? null,
      subtotal,
      transport_cost: transportCost,
      customs_cost: customsCost,
      vat_import: Number(body.vat_import) || 0,
      freight_forwarder_cost: Number(body.freight_forwarder_cost) || 0,
      bank_fees: Number(body.bank_fees) || 0,
      exchange_fees: Number(body.exchange_fees) || 0,
      local_delivery: Number(body.local_delivery) || 0,
      other_costs: Number(body.other_costs) || 0,
      total_real_cost: totalRealCost,
      cost_method: body.cost_method ?? 'by_value',
      payment_status: body.payment_status ?? 'pending',
      order_group: body.order_group ?? null,
      transport_method: body.transport_method ?? null,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items: any[] = body.items ?? [];
  if (items.length > 0) {
    await supabase.from('fo_order_lines').insert(
      items.map((item: any) => ({
        order_id: data.id,
        product_id: item.product_id ?? item.productId ?? null,
        product_name: item.product_name ?? item.name,
        qty_ordered: Number(item.qty_ordered ?? item.qty),
        unit_price: Number(item.unit_price),
        line_total: Number(item.line_total ?? item.total),
      }))
    );
  }

  const { data: full } = await supabase
    .from('fo_orders').select('*, fo_order_lines(*)').eq('id', data.id).single();
  return NextResponse.json({ ok: true, order: full ?? data });
}
