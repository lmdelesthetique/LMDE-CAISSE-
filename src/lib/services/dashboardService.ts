'use client';

import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

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
  avgMarginPct: number;
  productsBelow20Pct: number;
  productsAbove50Pct: number;
  caShopify: number;
  caShopifyDay: number;
  reservationDeposits: number;
  reservationBalances: number;
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

export type DashboardPeriod = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface DashboardFiltersState {
  period: DashboardPeriod;
  customStart?: string; // YYYY-MM-DD
  customEnd?: string;   // YYYY-MM-DD
  employeeId?: string;
  categoryId?: string;
}

function getDateRangeForPeriod(period: DashboardPeriod, customStart?: string, customEnd?: string): { start: string; end: string; prevStart: string; prevEnd: string } {
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
    case 'custom': {
      if (customStart && customEnd) {
        const s = new Date(customStart + 'T00:00:00');
        const e = new Date(customEnd + 'T23:59:59');
        const rangeMs = e.getTime() - s.getTime();
        const prevEnd = new Date(s.getTime());
        const prevStart = new Date(s.getTime() - rangeMs);
        return {
          start: s.toISOString(),
          end: e.toISOString(),
          prevStart: prevStart.toISOString(),
          prevEnd: prevEnd.toISOString(),
        };
      }
      // Fallback to current month if no dates provided
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start: monthStart.toISOString(), end: tomorrow.toISOString(), prevStart: prevMonthStart.toISOString(), prevEnd: monthStart.toISOString() };
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
  const { start, end, prevStart, prevEnd } = getDateRangeForPeriod(period, filters?.customStart, filters?.customEnd);

  // For "today" period we need day-specific ranges
  const dayRange = getDateRange('day');
  const prevDayRange = getDateRange('prevDay');

  // Build receipt queries with optional employee filter (demo tickets excluded)
  const buildReceiptsQuery = (s: string, e: string) => {
    let q = supabase.from('receipts').select('total_amount, items_count, is_demo, client_name').eq('status', 'completed')
      .gte('created_at', s).lte('created_at', e);
    if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId);
    return q;
  };

  const isReal = (r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  };

  const shopifyRevenuePromise = fetch(
    `/api/shopify/revenue?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
  ).then((r) => r.json()).then((j) => Number(j.revenue) || 0).catch(() => 0);

  const shopifyRevenueDayPromise = fetch(
    `/api/shopify/revenue?start=${encodeURIComponent(dayRange.start)}&end=${encodeURIComponent(dayRange.end)}`
  ).then((r) => r.json()).then((j) => Number(j.revenue) || 0).catch(() => 0);

  const [
    currentReceipts,
    prevReceipts,
    dayReceipts,
    prevDayReceipts,
    stockAlertResult,
    activeProductsResult,
    marginProductsResult,
    caShopify,
    caShopifyDay,
    resDepositsResult,
    resBalancesResult,
  ] = await Promise.all([
    buildReceiptsQuery(start, end),
    buildReceiptsQuery(prevStart, prevEnd),
    buildReceiptsQuery(dayRange.start, dayRange.end),
    buildReceiptsQuery(prevDayRange.start, prevDayRange.end),
    supabase.from('products').select('id, stock, min_stock, product_status')
      .neq('product_status', 'inactive'),
    supabase.from('products').select('*', { count: 'exact', head: true })
      .eq('product_status', 'active'),
    supabase.from('products')
      .select('sell_price_ht, sell_price_ttc, buy_price, transport, customs, other_fees, structure_pct')
      .eq('product_status', 'active'),
    shopifyRevenuePromise,
    shopifyRevenueDayPromise,
    supabase.from('reservations').select('deposit_paid')
      .gte('deposit_accounting_date', start.split('T')[0])
      .lte('deposit_accounting_date', end.split('T')[0])
      .neq('reservation_status', 'cancelled'),
    supabase.from('reservations').select('balance_paid')
      .gte('balance_accounting_date', start.split('T')[0])
      .lte('balance_accounting_date', end.split('T')[0])
      .neq('reservation_status', 'cancelled'),
  ]);

  const stockAlertCount = (stockAlertResult.data ?? []).filter((p: any) =>
    Number(p.stock ?? 0) <= 0 || Number(p.stock ?? 0) <= Number(p.min_stock || 5)
  ).length;
  const activeProductsCount = activeProductsResult.count;
  // caShopify is already resolved from the parallel Promise.all above

  const marginPcts = (marginProductsResult.data ?? []).map((p: any) => {
    const buyPrice = Number(p.buy_price) || 0;
    const transport = Number(p.transport) || 0;
    const customs = Number(p.customs) || 0;
    const otherFees = Number(p.other_fees) || 0;
    // structure_pct is overhead info only — not added to real import cost
    const realCost = buyPrice + transport + customs + otherFees;
    const sellHT = Number(p.sell_price_ht) || Number(p.sell_price_ttc) / 1.085 || 0;
    return sellHT > 0 ? ((sellHT - realCost) / sellHT) * 100 : 0;
  });
  const avgMarginPct = marginPcts.length > 0 ? marginPcts.reduce((s: number, m: number) => s + m, 0) / marginPcts.length : 0;
  const productsBelow20Pct = marginPcts.filter((m: number) => m < 20).length;
  const productsAbove50Pct = marginPcts.filter((m: number) => m >= 50).length;

  const sum = (arr: { data: any[] | null }) =>
    (arr.data ?? []).filter(isReal).reduce((s, r) => s + (Number(r.total_amount) || 0), 0);

  const caMain = sum(currentReceipts);
  const caPrev = sum(prevReceipts);
  const caDay = sum(dayReceipts);
  const caDayPrev = sum(prevDayReceipts);
  const salesDay = (dayReceipts.data ?? []).filter(isReal).length;
  const salesDayPrev = (prevDayReceipts.data ?? []).filter(isReal).length;
  const avgBasket = salesDay > 0 ? caDay / salesDay : 0;

  const reservationDeposits = (resDepositsResult.data ?? []).reduce((s, r) => s + (Number(r.deposit_paid) || 0), 0);
  const reservationBalances = (resBalancesResult.data ?? []).reduce((s, r) => s + (Number(r.balance_paid) || 0), 0);

  return {
    caMonth: caMain + reservationDeposits + reservationBalances,
    caWeek: caMain + reservationDeposits + reservationBalances,
    caDay,
    salesDay,
    avgBasket,
    stockAlertCount: stockAlertCount ?? 0,
    caMonthPrev: caPrev,
    caWeekPrev: caPrev,
    caDayPrev,
    salesDayPrev,
    activeProductsCount: activeProductsCount ?? 0,
    avgMarginPct: Math.round(avgMarginPct * 10) / 10,
    productsBelow20Pct,
    productsAbove50Pct,
    caShopify,
    caShopifyDay,
    reservationDeposits,
    reservationBalances,
  };
}

export async function fetchRevenueChart(filters?: DashboardFiltersState): Promise<RevenuePoint[]> {
  const supabase = createClient();

  const period = filters?.period ?? 'month';
  const { start: rangeStart, end: rangeEnd } = getDateRangeForPeriod(period, filters?.customStart, filters?.customEnd);

  let query = supabase
    .from('receipts')
    .select('total_amount, created_at, is_demo, client_name')
    .eq('status', 'completed')
    .gte('created_at', rangeStart)
    .lte('created_at', rangeEnd)
    .order('created_at', { ascending: true });

  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);

  const { data: rawData } = await query;
  const data = (rawData ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });

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
  const { start, end } = getDateRangeForPeriod(period, filters?.customStart, filters?.customEnd);

  let query = supabase
    .from('receipts')
    .select('payment_method, total_amount, is_demo, client_name')
    .eq('status', 'completed')
    .gte('created_at', start)
    .lte('created_at', end);

  if (filters?.employeeId) query = query.eq('employee_id', filters.employeeId);

  const { data: rawPayData } = await query;
  const data = (rawPayData ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });

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
  const { start, end } = getDateRangeForPeriod(period, filters?.customStart, filters?.customEnd);

  let receiptsQuery = supabase
    .from('receipts')
    .select('items, total_amount, is_demo, client_name')
    .eq('status', 'completed')
    .gte('created_at', start)
    .lte('created_at', end);

  if (filters?.employeeId) receiptsQuery = receiptsQuery.eq('employee_id', filters.employeeId);

  const [receiptsResult, products] = await Promise.all([
    receiptsQuery,
    fetchAll<any>((from, to) => {
      let q = supabase
        .from('products')
        .select('id, name, category, stock, sell_price_ttc, cost_price, buy_price')
        .range(from, to);
      if (filters?.categoryId) q = q.eq('category_id', filters.categoryId);
      return q;
    }),
  ]);

  const receipts = (receiptsResult.data ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  });

  if (!receipts || !products) return [];

  const productMap = new Map(products.map((p) => [p.id, p]));

  const salesMap: Record<string, { qty: number; revenue: number; name: string; category: string }> = {};

  receipts.forEach((receipt: any) => {
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

  const { data: rawData } = await supabase
    .from('products')
    .select('id, name, stock, min_stock, product_status')
    .neq('product_status', 'inactive')
    .order('stock', { ascending: true })
    .limit(100);

  const data = (rawData ?? [])
    .filter((p) => Number(p.stock ?? 0) <= 0 || Number(p.stock ?? 0) <= Number(p.min_stock || 5))
    .slice(0, 10);

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    stock: Number(p.stock ?? 0),
    min: Number(p.min_stock ?? 5),
    level: Number(p.stock ?? 0) <= 0 ? 'rupture' : 'warning',
  }));
}

export async function fetchRecentSales(): Promise<RecentSale[]> {
  const supabase = createClient();
  const { start } = getDateRange('day');

  const { data: rawRecent } = await supabase
    .from('receipts')
    .select('id, total_amount, payment_method, client_name, items_count, created_at, ticket_number, is_demo')
    .eq('status', 'completed')
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(20);

  const data = (rawRecent ?? []).filter((r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  }).slice(0, 8);

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

// ─── Accounting CSV export ────────────────────────────────────────────────────

export async function exportAccountingCSV(filters: DashboardFiltersState): Promise<void> {
  const supabase = createClient();
  const { start, end } = getDateRangeForPeriod(filters.period, filters.customStart, filters.customEnd);

  const isReal = (r: any) => {
    if (r.is_demo === true) return false;
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    return cn !== 'CHRISTY LHOMME';
  };

  const [receiptsRes, reservationsRes] = await Promise.all([
    supabase.from('receipts')
      .select('ticket_number, created_at, client_name, total_amount, payment_method, items_count, is_demo')
      .eq('status', 'completed')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: true }),
    supabase.from('reservations')
      .select('id, created_at, client_name, deposit_paid, balance_paid, deposit_accounting_date, balance_accounting_date, reservation_status')
      .gte('created_at', start.split('T')[0])
      .lte('created_at', end.split('T')[0])
      .neq('reservation_status', 'cancelled')
      .order('created_at', { ascending: true }),
  ]);

  const receipts = (receiptsRes.data ?? []).filter(isReal);
  const reservations = reservationsRes.data ?? [];

  const csvRows: string[][] = [
    ['Date', 'Type', 'Référence', 'Client', 'Montant TTC (€)', 'Mode de paiement', 'Nb articles / info'],
  ];

  receipts.forEach((r) => {
    const d = new Date(r.created_at).toLocaleDateString('fr-FR');
    csvRows.push([d, 'Vente caisse', r.ticket_number ?? '', r.client_name ?? '', (Number(r.total_amount) || 0).toFixed(2), r.payment_method ?? '', String(r.items_count ?? '')]);
  });

  reservations.forEach((r) => {
    const d = new Date(r.deposit_accounting_date || r.created_at).toLocaleDateString('fr-FR');
    if (r.deposit_paid > 0) {
      csvRows.push([d, 'Acompte réservation', r.id.slice(0, 8), r.client_name ?? '', (Number(r.deposit_paid) || 0).toFixed(2), 'Réservation', '']);
    }
    if (r.balance_paid > 0) {
      const db = new Date(r.balance_accounting_date || r.created_at).toLocaleDateString('fr-FR');
      csvRows.push([db, 'Solde réservation', r.id.slice(0, 8), r.client_name ?? '', (Number(r.balance_paid) || 0).toFixed(2), 'Réservation', '']);
    }
  });

  // Totals row
  const totalCaisse = receipts.reduce((s, r) => s + (Number(r.total_amount) || 0), 0);
  const totalResa = reservations.reduce((s, r) => s + (Number(r.deposit_paid) || 0) + (Number(r.balance_paid) || 0), 0);
  csvRows.push([]);
  csvRows.push(['', 'TOTAL CAISSE', '', '', totalCaisse.toFixed(2), '', '']);
  csvRows.push(['', 'TOTAL RÉSERVATIONS', '', '', totalResa.toFixed(2), '', '']);
  csvRows.push(['', 'TOTAL GÉNÉRAL', '', '', (totalCaisse + totalResa).toFixed(2), '', '']);

  const periodLabel = filters.period === 'custom' && filters.customStart && filters.customEnd
    ? `${filters.customStart}_${filters.customEnd}`
    : filters.period;

  const csv = csvRows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const bom = '﻿'; // UTF-8 BOM for Excel
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export-compta-${periodLabel}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
