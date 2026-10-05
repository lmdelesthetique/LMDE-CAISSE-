import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/supplier-costs — returns supplier cost breakdown for current month
export async function GET() {
  const supabase = createAdminClient();
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('fo_orders')
    .select('total_real_cost, subtotal, supplier_id, suppliers(company_name)')
    .in('order_status', ['fully_received', 'costs_recorded', 'stock_integrated', 'closed', 'paid'])
    .gte('created_at', startOfMonth)
    .not('supplier_id', 'is', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const map: Record<string, { name: string; cost: number; count: number }> = {};
  (data || []).forEach((r: any) => {
    const name = r.suppliers?.company_name || 'Inconnu';
    if (!map[name]) map[name] = { name, cost: 0, count: 0 };
    map[name].cost += Number(r.total_real_cost || r.subtotal || 0);
    map[name].count += 1;
  });

  return NextResponse.json(
    Object.values(map)
      .map(v => ({
        supplierName: v.name,
        totalCost: Math.round(v.cost * 100) / 100,
        orderCount: v.count,
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
  );
}
