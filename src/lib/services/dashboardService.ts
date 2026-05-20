'use client';

import { createClient } from '@/lib/supabase/client';

export interface DashboardKPIs {
  caMonth: number;
  caWeek: number;
  caDay: number;
  salesDay: number;
  avgBasket: number;
  stockAlertCount: number;
  caMonthPrev: number;
  caWeekPrev: number;
  caDayPrev: number;
  salesDayPrev: number;
  activeProductsCount: number;
}

export interface RevenuePoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface PaymentMethodData {
  name: string;
  value: number;
  color: string;
}

export interface TopProduct {
  id: string;
  rank: number;
  name: string;
  category: string;
  qty: number;
  revenue: number;
  margin: number;
  stock: number;
}

export interface StockAlert {
  id: string;
  name: string;
  stock: number;
  min: number;
  level: 'rupture' | 'warning';
}

export interface RecentSale {
  id: string;
  time: string;
  client: string;
  amount: number;
  method: string;
  items: number;
}

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year';

export interface DashboardFiltersState {
  period: DashboardPeriod;
  employeeId?: string;
  categoryId?: string;
}

function getDateRangeForPeriod(period: DashboardPeriod): { start: string; end: string; prevStart: string; prevEnd: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 86400000);

  switch (period) {
    case 'today': {
      const yesterday = new Date(today.getTime() - 86400000);
      return {
        start: today.toISOString(),
        end: tomorrow.toISOString(),
        prevStart: yesterday.toISOString(),
        prevEnd: today.toISOString(),
      };
    }
    case 'week': {
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today.getTime() - dayOfWeek * 86400000);
      const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
      return {
        start: weekStart.toISOString(),
        end: tomorrow.toISOString(),
        prevStart: prevWeekStart.toISOString(),
        prevEnd: weekStart.toISOString(),
      };
    }
    case 'year': {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);
      const prevYearEnd = new Date(now.getFullYear(), 0, 1);
      return {
        start: yearStart.toISOString(),
        end: tomorrow.toISOString(),
        prevStart: prevYearStart.toISOString(),
        prevEnd: prevYearEnd.toISOString(),
      };
    }
    case 'month':
    default: {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return {
        start: monthStart.toISOString(),
        end: tomorrow.toISOString(),
        prevStart: prevMonthStart.toISOString(),
        prevEnd: monthStart.toISOString(),
      };
    }
  }
}

function getDateRange(type: 'month' | 'week' | 'day' | 'prevMonth' | 'prevWeek' | 'prevDay') {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (type) {
    case 'day':
      return { start: today.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    case 'prevDay': {
      const prev = new Date(today.getTime() - 86400000);
      return { start: prev.toISOString(), end: today.toISOString() };
    }
    case 'week': {
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today.getTime() - dayOfWeek * 86400000);
      return { start: weekStart.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    }
    case 'prevWeek': {
      const dayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;
      const weekStart = new Date(today.getTime() - dayOfWeek * 86400000);
      const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
      return { start: prevWeekStart.toISOString(), end: weekStart.toISOString() };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: monthStart.toISOString(), end: new Date(today.getTime() + 86400000).toISOString() };
    }
    case 'prevMonth': {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start: prevMonthStart.toISOString(), end: monthStart.toISOString() };
    }
  }
}

export async function fetchDashboardKPIs(filters?: DashboardFiltersState): Promise<DashboardKPIs> {
  const supabase = createClient();

  const period = filters?.period ?? 'month';
  const { start, end, prevStart, prevEnd } = getDateRangeForPeriod(period);

  // For "today" period we need day-specific ranges
  const dayRange = getDateRange('day');
  const prevDayRange = getDateRange('prevDay');

  // Build receipt queries with optional employee filter
  const buildReceiptsQuery = (s: string, e: string) => {
    let q = supabase.from('receipts').select('total_amount, items_count').eq('status', 'completed')
      .gte('created_at', s).lte('created_at', e);
    if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId);
    return q;
  };

  const [
    currentReceipts,
    prevReceipts,
    dayReceipts,
    prevDayReceipts,
    stockAlertResult,
    activeProductsResult,
  ] = await Promise.all([
    buildReceiptsQuery(start, end),
    buildReceiptsQuery(prevStart, prevEnd),
    buildReceiptsQuery(dayRange.start, dayRange.end),
    buildReceiptsQuery(prevDayRange.start, prevDayRange.end),
    supabase.from('products').select('*', { count: 'exact', head: true })
      .or('product_status.eq.rupture,and(stock.gt.0,stock.lte.min_stock)'),
    supabase.from('products').select('*', { count: 'exact', head: true })
      .eq('product_status', 'active'),
  ]);

  const stockAlertCount = stockAlertResult.count;
  const activeProductsCount = activeProductsResult.count;

  const sum = (arr: { data: { total_amount: number }[] | null }) =>
    (arr.data ?? []).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  const caMain = sum(currentReceipts);
  const caPrev = sum(prevReceipts);
  const caDay = sum(dayReceipts);
  const caDayPrev = sum(prevDayReceipts);
  const salesDay = (dayReceipts.data ?? []).length;
  const salesDayPrev = (prevDayReceipts.data ?? []).length;
  const avgBasket = salesDay > 0 ? caDay / salesDay : 0;

  // Simpler: just use the filtered period values for the main KPI display
  return {
    caMonth: caMain,
    caWeek: caMain,
    caDay,
    salesDay,
    avgBasket,
    stockAlertCount: stockAlertCount ?? 0,
    caMonthPrev: caPrev,
    caWeekPrev: caPrev,
    caDayPrev,
    salesDayPrev,
    activeProductsCount: activeProductsCount ?? 0,
  };
}

export async function fetchRevenueChart(filters?: DashboardFiltersState): Promise<RevenuePoint[]> {
  const supabase = createClient();

  const period = filters?.period ?? 'month';
  let days = 14;
  if (period === 'today') days = 1;
  else if (period === 'week') days = 7;
  else if (period === 'year') days = 365;

  const since = new Date(Date.now() - days * 86400000).toISOString();

  let query = supabase
    .from('receipts')
    .select('total_amount, created_at')
    .eq('status', 'completed')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);

  const { data } = await query;

  if (!data || data.length === 0) return [];

  const byDay: Record<string, { revenue: number; transactions: number }> = {};
  data.forEach((r) => {
    const d = new Date(r.created_at);
    const key = `${d.getDate()} ${d.toLocaleString('fr-FR', { month: 'short' })}`;
    if (!byDay[key]) byDay[key] = { revenue: 0, transactions: 0 };
    byDay[key].revenue += Number(r.total_amount) || 0;
    byDay[key].transactions += 1;
  });

  return Object.entries(byDay).map(([date, v]) => ({ date, ...v }));
}

export async function fetchPaymentMethods(filters?: DashboardFiltersState): Promise<PaymentMethodData[]> {
  const supabase = createClient();

  const period = filters?.period ?? 'month';
  const { start } = getDateRangeForPeriod(period);

  let query = supabase
    .from('receipts')
    .select('payment_method, total_amount')
    .eq('status', 'completed')
    .gte('created_at', start);

  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);

  const { data } = await query;

  if (!data || data.length === 0) return [];

  const colors: Record<string, string> = {
    'SumUp': '#C4837A',
    'CB': '#C4837A',
    'Espèces': '#D4A0A0',
    'Virement': '#8B6F6A',
    'Acompte': '#E8C4BE',
    'Mixte': '#BFA09C',
    'Alma': '#A8C4D4',
  };

  const byMethod: Record<string, number> = {};
  data.forEach((r) => {
    const m = r.payment_method ?? 'Autre';
    byMethod[m] = (byMethod[m] ?? 0) + (Number(r.total_amount) || 0);
  });

  return Object.entries(byMethod)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({
      name,
      value,
      color: colors[name] ?? '#C4A0A0',
    }));
}

export async function fetchTopProducts(filters?: DashboardFiltersState): Promise<TopProduct[]> {
  const supabase = createClient();

  const period = filters?.period ?? 'month';
  const { start } = getDateRangeForPeriod(period);

  let receiptsQuery = supabase
    .from('receipts')
    .select('items, total_amount')
    .eq('status', 'completed')
    .gte('created_at', start);

  if (filters?.employeeId) receiptsQuery = receiptsQuery.eq('employee_id', filters.employeeId);

  let productsQuery = supabase
    .from('products')
    .select('id, name, category, stock, sell_price_ttc, cost_price, buy_price');

  if (filters?.categoryId) productsQuery = productsQuery.eq('category_id', filters.categoryId);

  const receiptsResult = await receiptsQuery;
  const productsResult = await productsQuery;
  const receipts = receiptsResult.data;
  const products = productsResult.data;

  if (!receipts || !products) return [];

  const productMap = new Map(products.map((p) => [p.id, p]));

  const salesMap: Record<string, { qty: number; revenue: number; name: string; category: string }> = {};

  receipts.forEach((receipt) => {
    const items = receipt.items as any[];
    if (!Array.isArray(items)) return;
    items.forEach((item: any) => {
      const pid = item?.product_id ?? item?.id;
      if (!pid) return;
      if (!salesMap[pid]) {
        const prod = productMap.get(pid);
        salesMap[pid] = {
          qty: 0,
          revenue: 0,
          name: item?.name ?? prod?.name ?? 'Produit',
          category: item?.category ?? prod?.category ?? '—',
        };
      }
      salesMap[pid].qty += Number(item?.quantity ?? item?.qty ?? 1);
      salesMap[pid].revenue += Number(item?.total ?? item?.price ?? 0) * Number(item?.quantity ?? item?.qty ?? 1);
    });
  });

  return Object.entries(salesMap)
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 8)
    .map(([id, s], idx) => {
      const prod = productMap.get(id);
      const costPrice = Number(prod?.cost_price ?? prod?.buy_price ?? 0);
      const sellPrice = Number(prod?.sell_price_ttc ?? 0);
      const margin = sellPrice > 0 ? Math.round(((sellPrice - costPrice) / sellPrice) * 100) : 0;
      return {
        id,
        rank: idx + 1,
        name: s.name,
        category: s.category,
        qty: s.qty,
        revenue: Math.round(s.revenue * 100) / 100,
        margin,
        stock: Number(prod?.stock ?? 0),
      };
    });
}

export async function fetchStockAlerts(): Promise<StockAlert[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from('products')
    .select('id, name, stock, min_stock, product_status')
    .or('product_status.eq.rupture,and(stock.gt.0,stock.lte.min_stock)')
    .order('stock', { ascending: true })
    .limit(10);

  if (!data) return [];

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    stock: Number(p.stock ?? 0),
    min: Number(p.min_stock ?? 5),
    level: (p.product_status === 'rupture' || Number(p.stock ?? 0) === 0) ? 'rupture' : 'warning',
  }));
}

export async function fetchRecentSales(): Promise<RecentSale[]> {
  const supabase = createClient();
  const { start } = getDateRange('day');

  const { data } = await supabase
    .from('receipts')
    .select('id, total_amount, payment_method, client_name, items_count, created_at, ticket_number')
    .eq('status', 'completed')
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(8);

  if (!data) return [];

  return data.map((r) => {
    const d = new Date(r.created_at);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      id: r.ticket_number ?? r.id,
      time: `${hh}:${mm}`,
      client: r.client_name ?? 'Non identifié',
      amount: Number(r.total_amount) || 0,
      method: r.payment_method ?? 'Autre',
      items: Number(r.items_count) || 0,
    };
  });
}
