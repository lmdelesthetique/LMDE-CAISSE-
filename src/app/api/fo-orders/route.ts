import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET  /api/fo-orders?supplierId=xxx   — orders for a supplier (or all if omitted)
// POST /api/fo-orders                  — create order + lines

export async function GET(req: NextRequest) {
  const supplierId = req.nextUrl.searchParams.get('supplierId');
  const supabase = createAdminClient();
  let q = supabase
    .from('fo_orders')
    .select('*, fo_order_lines(*), suppliers(company_name)')
    .order('created_at', { ascending: false });
  if (supplierId) q = q.eq('supplier_id', supplierId);
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
      notes: body.notes ?? null,
      subtotal,
      transport_cost: transportCost,
      customs_cost: customsCost,
      total_real_cost: totalRealCost,
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
