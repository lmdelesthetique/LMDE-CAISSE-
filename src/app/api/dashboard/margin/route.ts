import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? 'month';

  const now = new Date();
  let startDate: string;
  if (period === 'month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  } else if (period === '3months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().slice(0, 10);
  } else {
    startDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  }

  const supabase = makeClient();

  const [receiptsRes, ordersRes, expensesRes, feeRes] = await Promise.all([
    supabase
      .from('receipts')
      .select('total_amount')
      .eq('status', 'completed')
      .gte('created_at', `${startDate}T00:00:00`),
    supabase
      .from('fo_orders')
      .select('subtotal, transport_cost, customs_cost, vat_import, freight_forwarder_cost, bank_fees, exchange_fees, local_delivery, other_costs, payment_amount, order_status')
      .gte('created_at', startDate),
    supabase
      .from('business_expenses')
      .select('amount, category')
      .gte('expense_date', startDate),
    supabase
      .from('structure_fee_config')
      .select('applied_pct, reference_revenue')
      .eq('month_year', now.toISOString().slice(0, 7))
      .maybeSingle(),
  ]);

  const receipts = receiptsRes.data ?? [];
  const orders = ordersRes.data ?? [];
  const expenses = expensesRes.data ?? [];
  const feeConfig = feeRes.data;

  const revenue = receipts.reduce((s: number, r: any) => s + parseFloat(String(r.total_amount ?? 0)), 0);

  const costOfGoods = orders.reduce((s: number, o: any) => s + (o.subtotal || 0), 0);

  const importCosts = orders.reduce((s: number, o: any) =>
    s + (o.transport_cost || 0) + (o.customs_cost || 0) + (o.vat_import || 0) +
    (o.freight_forwarder_cost || 0) + (o.bank_fees || 0) + (o.exchange_fees || 0) +
    (o.local_delivery || 0) + (o.other_costs || 0), 0);

  const supplierPayments = orders
    .filter((o: any) => ['paid', 'payment_received_by_supplier'].includes(o.order_status))
    .reduce((s: number, o: any) => s + (o.payment_amount || o.subtotal || 0), 0);

  const fixedExpenses = expenses.filter((e: any) => e.category === 'fixed_monthly').reduce((s: number, e: any) => s + e.amount, 0);
  const variableExpenses = expenses.filter((e: any) => e.category === 'variable').reduce((s: number, e: any) => s + e.amount, 0);
  const dailyExpenses = expenses.filter((e: any) => e.category === 'daily').reduce((s: number, e: any) => s + e.amount, 0);
  const totalExpenses = fixedExpenses + variableExpenses + dailyExpenses;

  const grossMargin = revenue - costOfGoods - importCosts;
  const grossMarginPct = revenue > 0 ? (grossMargin / revenue) * 100 : 0;
  const netMargin = grossMargin - totalExpenses;
  const netMarginPct = revenue > 0 ? (netMargin / revenue) * 100 : 0;
  const structurePct = feeConfig?.applied_pct ?? (revenue > 0 ? (totalExpenses / revenue) * 100 : 0);

  return NextResponse.json({
    revenue,
    costOfGoods,
    importCosts,
    supplierPayments,
    fixedExpenses,
    variableExpenses,
    dailyExpenses,
    grossMargin,
    grossMarginPct,
    netMargin,
    netMarginPct,
    structurePct,
  });
}
