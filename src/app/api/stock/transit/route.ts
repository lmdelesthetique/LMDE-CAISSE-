import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/transit — returns supplier orders currently in transit
export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('fo_orders')
    .select(`
      id, order_number, order_status, currency, total_real_cost,
      expected_delivery_at, transport_cost,
      suppliers(company_name)
    `)
    .in('order_status', ['shipped', 'partially_received', 'in_production', 'ready_to_ship', 'paid'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    (data || []).map((r: any) => {
      let transportType: 'container' | 'avion' | 'standard' = 'standard';
      if (Number(r.transport_cost) > 500) transportType = 'container';
      else if (Number(r.transport_cost) > 100) transportType = 'avion';
      return {
        id: r.id,
        orderNumber: r.order_number,
        supplierName: r.suppliers?.company_name || 'Fournisseur',
        orderStatus: r.order_status,
        transportType,
        totalAmount: Number(r.total_real_cost) || 0,
        expectedDeliveryAt: r.expected_delivery_at ?? null,
        itemsCount: 0,
        currency: r.currency || 'EUR',
      };
    })
  );
}
