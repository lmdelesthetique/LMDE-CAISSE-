import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? 'month';

  // Use Martinique timezone (UTC-4) for correct month boundaries on Vercel
  const MTQ = '-04:00';
  const mtqNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Martinique' }));
  const yr = mtqNow.getFullYear(), mo = mtqNow.getMonth();
  let startDate: string;
  let endDate: string | null = null;

  if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split('-').map(Number);
    startDate = `${y}-${String(m).padStart(2, '0')}-01T00:00:00${MTQ}`;
    const nextM = new Date(y, m, 1);
    endDate = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01T00:00:00${MTQ}`;
  } else if (period === 'month') {
    startDate = `${yr}-${String(mo + 1).padStart(2, '0')}-01T00:00:00${MTQ}`;
  } else if (period === '3months') {
    const d = new Date(yr, mo - 3, 1);
    startDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01T00:00:00${MTQ}`;
  } else {
    startDate = `${yr}-01-01T00:00:00${MTQ}`;
  }

  const supabase = createAdminClient();

  const feeMonth = endDate ? period : `${yr}-${String(mo + 1).padStart(2, '0')}`;

  let receiptsQ = supabase.from('receipts').select('total_amount, is_demo, client_name').eq('status', 'completed').neq('is_demo', true).gte('created_at', startDate);
  let ordersQ = supabase.from('fo_orders').select('subtotal, transport_cost, customs_cost, vat_import, freight_forwarder_cost, bank_fees, exchange_fees, local_delivery, other_costs, payment_amount, order_status').gte('created_at', startDate.slice(0, 10));
  let expensesQ = supabase.from('business_expenses').select('amount, category').gte('expense_date', startDate.slice(0, 10));

  if (endDate) {
    receiptsQ = receiptsQ.lt('created_at', endDate);
    ordersQ = ordersQ.lt('created_at', endDate.slice(0, 10));
    expensesQ = expensesQ.lt('expense_date', endDate.slice(0, 10));
  }

  const [receiptsRes, ordersRes, expensesRes, feeRes] = await Promise.all([
    receiptsQ,
    ordersQ,
    expensesQ,
    supabase
      .from('structure_fee_config')
      .select('applied_pct, reference_revenue')
      .eq('month_year', feeMonth)
      .maybeSingle(),
  ]);

  const rawReceipts = receiptsRes.data ?? [];
  const receipts = rawReceipts.filter((r: any) => {
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });
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
    .reduce((s: number, o: any) => s + (o.payment_amount || 0), 0);

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
