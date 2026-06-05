'use client';

import { createClient } from '@/lib/supabase/client';
import { generateTicketNumber } from './emailService';

export interface POSSaleItem {
  productId: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  discount: number;
  discountType: 'percent' | 'amount';
  tva: number;
  isFreePrice?: boolean;
  imageUrl?: string;
}

export interface SaveReceiptParams {
  ticketNumber?: string;
  items: POSSaleItem[];
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  discountAmount: number;
  paymentMethod: string;
  paymentType?: 'sale' | 'acompte' | 'installment' | 'avoir';
  clientId?: string;
  clientName?: string;
  cashierName?: string;
  loyaltyPointsEarned?: number;
  loyaltyRewardUsed?: string;
  notes?: string;
  isDemo?: boolean;
}

export interface ReceiptRecord {
  id: string;
  ticketNumber: string;
  createdAt: string;
  totalAmount: number;
  subtotalHT: number;
  totalTVA: number;
  paymentMethod: string;
  paymentType: string;
  clientId: string | null;
  clientName: string | null;
  cashierName: string | null;
  itemsCount: number;
  items: POSSaleItem[];
  discountAmount: number;
  status: string;
  notes: string | null;
  loyaltyPointsEarned: number;
  hasDelivery: boolean;
  deliveryId: string | null;
}

export interface TicketModification {
  id: string;
  receiptId: string;
  modifiedBy: string;
  modifiedAt: string;
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
}

// ─── Save receipt after payment ───────────────────────────────────────────────
// ─── Save receipt after payment ───────────────────────────────────────────────
export async function saveReceipt(params: SaveReceiptParams): Promise<{ id: string; ticketNumber: string } | null> {
  const ticketNumber = params.ticketNumber || generateTicketNumber();

  const itemsJson = params.items.map((i) => ({
    product_id: i.productId,
    name: i.name,
    sku: i.sku,
    price: i.price,
    qty: i.qty,
    quantity: i.qty,
    discount: i.discount,
    discount_type: i.discountType,
    tva: i.tva,
    is_free_price: i.isFreePrice || false,
    image_url: i.imageUrl || null,
    total: Math.max(0, i.price * i.qty - (i.discountType === 'percent' ? i.price * i.qty * (i.discount / 100) : i.discount)),
  }));

  const body = {
    ticket_number: ticketNumber,
    items: itemsJson,
    items_count: params.items.length,
    subtotal_ht: params.subtotalHT,
    total_tva: params.totalTVA,
    total_amount: params.totalTTC,
    discount_amount: params.discountAmount,
    payment_method: params.paymentMethod,
    payment_type: params.paymentType || 'sale',
    client_id: params.clientId || null,
    client_name: params.clientName || null,
    cashier_name: params.cashierName || null,
    loyalty_points_earned: params.loyaltyPointsEarned || 0,
    loyalty_reward_used: params.loyaltyRewardUsed || null,
    notes: params.notes || null,
    status: 'completed',
    // Only include is_demo when true — avoids 42703 if migration not yet applied
    ...(params.isDemo ? { is_demo: true } : {}),
  };

  try {
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('saveReceipt error:', res.status, err);
      return null;
    }
    const data = await res.json();
    return { id: data.id, ticketNumber: data.ticket_number };
  } catch (e) {
    console.error('saveReceipt fetch error:', e);
    return null;
  }
}

// ─── Fetch single receipt with full details ───────────────────────────────────
export async function fetchReceiptById(id: string): Promise<ReceiptRecord | null> {
  try {
    const res = await fetch(`/api/receipts/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[fetchReceiptById] HTTP', res.status, err);
      return null;
    }
    const r = await res.json();
    return mapReceipt(r);
  } catch (e) {
    console.error('[fetchReceiptById] fetch error:', e);
    return null;
  }
}

function mapReceipt(r: Record<string, unknown>): ReceiptRecord {
  return {
    id: r.id as string,
    ticketNumber: (r.ticket_number as string) || (r.id as string).substring(0, 8).toUpperCase(),
    createdAt: r.created_at as string,
    totalAmount: Number(r.total_amount) || 0,
    subtotalHT: Number(r.subtotal_ht) || 0,
    totalTVA: Number(r.total_tva) || 0,
    paymentMethod: (r.payment_method as string) || 'other',
    paymentType: (r.payment_type as string) || 'sale',
    clientId: (r.client_id as string) || null,
    clientName: (r.client_name as string) || null,
    cashierName: (r.cashier_name as string) || null,
    itemsCount: Number(r.items_count) || 0,
    items: Array.isArray(r.items) ? (r.items as any[]).map((i: any) => ({
      productId: i.product_id || i.productId || '',
      name: i.name || '',
      sku: i.sku || '',
      price: Number(i.price) || 0,
      qty: Number(i.qty || i.quantity) || 1,
      discount: Number(i.discount) || 0,
      discountType: (i.discount_type || i.discountType || 'percent') as 'percent' | 'amount',
      tva: Number(i.tva) || 0.085,
      isFreePrice: Boolean(i.is_free_price || i.isFreePrice),
      imageUrl: i.image_url || i.imageUrl || undefined,
    })) : [],
    discountAmount: Number(r.discount_amount) || 0,
    status: (r.status as string) || 'completed',
    notes: (r.notes as string) || null,
    loyaltyPointsEarned: Number(r.loyalty_points_earned) || 0,
    hasDelivery: Boolean(r.has_delivery),
    deliveryId: (r.delivery_id as string) || null,
  };
}

// ─── Modify ticket (limited post-sale edits) ──────────────────────────────────
export async function modifyTicket(
  receiptId: string,
  changes: {
    clientId?: string | null;
    clientName?: string | null;
    paymentMethod?: string;
    notes?: string;
  },
  modifiedBy: string,
  reason: string
): Promise<boolean> {
  try {
    const res = await fetch(`/api/receipts/${receiptId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ changes, modifiedBy, reason }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

// ─── Fetch ticket modification history ───────────────────────────────────────
export async function fetchTicketModifications(receiptId: string): Promise<TicketModification[]> {
  try {
    const res = await fetch(`/api/receipts/${receiptId}/modifications`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data as any[]).map((r: any) => ({
      id: r.id,
      receiptId: r.receipt_id,
      modifiedBy: r.modified_by,
      modifiedAt: r.modified_at,
      fieldChanged: r.field_changed,
      oldValue: r.old_value,
      newValue: r.new_value,
      reason: r.reason,
    }));
  } catch {
    return [];
  }
}


// ─── Day summary ──────────────────────────────────────────────────────────────
export interface DaySummaryData {
  date: string;
  totalCA: number;
  totalHT: number;
  totalTVA: number;
  totalTTC: number;
  grossMargin: number;
  grossMarginRate: number;
  ticketCount: number;
  avgBasket: number;
  paymentBreakdown: Record<string, { count: number; total: number }>;
  topProducts: Array<{ name: string; qty: number; revenue: number }>;
  topClient: string | null;
  employeeSales: Array<{ name: string; count: number; total: number }>;
  expenses: DailyExpense[];
  totalExpenses: number;
  cashOut: number;
  dailyGoal: number;
  goalReached: boolean;
}

export interface DailyExpense {
  id?: string;
  expenseDate: string;
  amount: number;
  category: string;
  paymentMethod: string;
  note: string;
  performedBy: string;
}

export async function computeDaySummary(date: string): Promise<DaySummaryData> {
  const supabase = createClient();
  const dayStart = new Date(date + 'T00:00:00').toISOString();
  const dayEnd = new Date(date + 'T23:59:59').toISOString();

  const [receiptsRes, expensesRes, productsRes] = await Promise.all([
    supabase
      .from('receipts')
      .select('*')
      .eq('status', 'completed')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd),
    supabase
      .from('daily_expenses')
      .select('*')
      .eq('expense_date', date),
    supabase
      .from('products')
      .select('id, name, cost_price, buy_price, sell_price_ttc'),
  ]);

  const receipts = receiptsRes.data || [];
  const expenses = expensesRes.data || [];
  const products = productsRes.data || [];

  const productCostMap = new Map(products.map((p: any) => [
    p.id,
    { costPrice: Number(p.cost_price || p.buy_price) || 0, sellPrice: Number(p.sell_price_ttc) || 0 },
  ]));

  // Compute totals
  const totalCA = receipts.reduce((s: number, r: any) => s + (Number(r.total_amount) || 0), 0);
  const totalHT = receipts.reduce((s: number, r: any) => s + (Number(r.subtotal_ht) || Number(r.total_amount) / 1.085 || 0), 0);
  const totalTVA = receipts.reduce((s: number, r: any) => s + (Number(r.total_tva) || Number(r.total_amount) * 0.085 / 1.085 || 0), 0);
  const totalTTC = totalCA;
  const ticketCount = receipts.length;
  const avgBasket = ticketCount > 0 ? totalCA / ticketCount : 0;

  // Payment breakdown
  const paymentBreakdown: Record<string, { count: number; total: number }> = {};
  receipts.forEach((r: any) => {
    const m = r.payment_method || 'other';
    if (!paymentBreakdown[m]) paymentBreakdown[m] = { count: 0, total: 0 };
    paymentBreakdown[m].count += 1;
    paymentBreakdown[m].total += Number(r.total_amount) || 0;
  });

  // Top products from items jsonb
  const productSales: Record<string, { name: string; qty: number; revenue: number; cost: number }> = {};
  receipts.forEach((r: any) => {
    const items = Array.isArray(r.items) ? r.items : [];
    items.forEach((item: any) => {
      const pid = item.product_id || item.productId || item.id;
      const name = item.name || 'Produit';
      const qty = Number(item.qty || item.quantity) || 1;
      const revenue = Number(item.total) || (Number(item.price) * qty);
      const costInfo = pid ? productCostMap.get(pid) : null;
      const cost = costInfo ? costInfo.costPrice * qty : 0;
      const key = pid || name;
      if (!productSales[key]) productSales[key] = { name, qty: 0, revenue: 0, cost: 0 };
      productSales[key].qty += qty;
      productSales[key].revenue += revenue;
      productSales[key].cost += cost;
    });
  });

  const topProducts = Object.values(productSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)
    .map(({ name, qty, revenue }) => ({ name, qty, revenue }));

  // Gross margin
  const totalCost = Object.values(productSales).reduce((s, p) => s + p.cost, 0);
  const grossMargin = totalHT - totalCost;
  const grossMarginRate = totalHT > 0 ? (grossMargin / totalHT) * 100 : 0;

  // Top client
  const clientSales: Record<string, number> = {};
  receipts.forEach((r: any) => {
    if (r.client_name) {
      clientSales[r.client_name] = (clientSales[r.client_name] || 0) + (Number(r.total_amount) || 0);
    }
  });
  const topClient = Object.entries(clientSales).sort(([, a], [, b]) => b - a)[0]?.[0] || null;

  // Employee sales
  const empSales: Record<string, { count: number; total: number }> = {};
  receipts.forEach((r: any) => {
    const emp = r.cashier_name || 'Inconnu';
    if (!empSales[emp]) empSales[emp] = { count: 0, total: 0 };
    empSales[emp].count += 1;
    empSales[emp].total += Number(r.total_amount) || 0;
  });
  const employeeSales = Object.entries(empSales).map(([name, v]) => ({ name, ...v }));

  // Expenses
  const mappedExpenses: DailyExpense[] = expenses.map((e: any) => ({
    id: e.id,
    expenseDate: e.expense_date,
    amount: Number(e.amount) || 0,
    category: e.category || 'other',
    paymentMethod: e.payment_method || 'cash',
    note: e.note || '',
    performedBy: e.performed_by || '',
  }));
  const totalExpenses = mappedExpenses.reduce((s, e) => s + e.amount, 0);

  // Load daily goal from settings
  let dailyGoal = 0;
  try {
    const cached = typeof window !== 'undefined' ? localStorage.getItem('beautypos_settings') : null;
    if (cached) {
      const s = JSON.parse(cached);
      dailyGoal = Number(s.daily_goal) || 0;
    }
  } catch { /* ignore */ }

  return {
    date,
    totalCA,
    totalHT,
    totalTVA,
    totalTTC,
    grossMargin,
    grossMarginRate,
    ticketCount,
    avgBasket,
    paymentBreakdown,
    topProducts,
    topClient,
    employeeSales,
    expenses: mappedExpenses,
    totalExpenses,
    cashOut: totalExpenses,
    dailyGoal,
    goalReached: dailyGoal > 0 && totalCA >= dailyGoal,
  };
}

export async function saveDaySummary(summary: DaySummaryData, cashierName: string, notes: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from('day_summaries')
    .upsert({
      summary_date: summary.date,
      cashier_name: cashierName,
      total_ca: summary.totalCA,
      total_ht: summary.totalHT,
      total_tva: summary.totalTVA,
      total_ttc: summary.totalTTC,
      gross_margin: summary.grossMargin,
      gross_margin_rate: summary.grossMarginRate,
      ticket_count: summary.ticketCount,
      avg_basket: summary.avgBasket,
      payment_breakdown: summary.paymentBreakdown,
      top_products: summary.topProducts,
      top_client: summary.topClient,
      employee_sales: summary.employeeSales,
      daily_goal: summary.dailyGoal,
      goal_reached: summary.goalReached,
      expenses: summary.expenses,
      total_expenses: summary.totalExpenses,
      cash_out: summary.cashOut,
      notes,
      closed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'summary_date' });

  if (error) { console.error('saveDaySummary error:', error); return false; }
  return true;
}

export async function addDailyExpense(expense: Omit<DailyExpense, 'id'>): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('daily_expenses').insert({
    expense_date: expense.expenseDate,
    amount: expense.amount,
    category: expense.category,
    payment_method: expense.paymentMethod,
    note: expense.note,
    performed_by: expense.performedBy,
  });
  if (error) { console.error('addDailyExpense error:', error); return false; }
  return true;
}

export async function updateDailyExpense(id: string, expense: Omit<DailyExpense, 'id'>): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('daily_expenses').update({
    expense_date: expense.expenseDate,
    amount: expense.amount,
    category: expense.category,
    payment_method: expense.paymentMethod,
    note: expense.note,
    performed_by: expense.performedBy,
  }).eq('id', id);
  if (error) { console.error('updateDailyExpense error:', error); return false; }
  return true;
}

export async function deleteDailyExpense(id: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.from('daily_expenses').delete().eq('id', id);
  if (error) { console.error('deleteDailyExpense error:', error); return false; }
  return true;
}

export async function syncExpenseToBusinessExpenses(expense: DailyExpense & { cashierName?: string }): Promise<void> {
  const supabase = createClient();
  const payload = {
    category: 'daily' as const,
    expense_type: expense.category || 'other',
    label: expense.note || expense.category,
    amount: expense.amount,
    expense_date: expense.expenseDate,
    payment_method: (expense.paymentMethod === 'cash' ? 'cash' : expense.paymentMethod === 'card' ? 'card' : expense.paymentMethod === 'transfer' ? 'transfer' : 'other') as any,
    note: `[Caisse] ${expense.note || ''} — Caissier: ${expense.cashierName || expense.performedBy || ''}`.trim(),
    is_recurring: false,
  };
  // Insert only (no upsert — let duplicates be; caller decides)
  await supabase.from('business_expenses').insert(payload);
}
