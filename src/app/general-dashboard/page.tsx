'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,  } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface KPIData {
  totalRevenue: number;
  totalTickets: number;
  avgBasket: number;
  totalDiscounts: number;
  almaRevenue: number;
  sumupRevenue: number;
  cashRevenue: number;
  transferRevenue: number;
  cancelledCount: number;
  reservationDeposits: number;
  reservationBalances: number;
}

interface RevenuePoint {
  label: string;
  revenue: number;
  tickets: number;
}

interface CategoryBreakdown {
  name: string;
  revenue: number;
  count: number;
}

interface EmployeePerf {
  name: string;
  revenue: number;
  tickets: number;
  progress: number;
}

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

function getPeriodDates(period: PeriodFilter, customFrom: string, customTo: string) {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - 7);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : now.toISOString(),
  };
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_COLORS: Record<string, string> = {
  'SumUp (CB)': '#2563eb',
  'CB': '#2563eb',
  'card': '#2563eb',
  'Espèces': '#16a34a',
  'cash': '#16a34a',
  'Alma': '#db2777',
  'Alma (3x/4x)': '#db2777',
  'Virement': '#0891b2',
  'transfer': '#0891b2',
  'Mixte': '#7c3aed',
  'mixed': '#7c3aed',
};

const CHART_COLORS = ['#c0726a', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2', '#db2777'];

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, icon, accent = 'default', trend }: {
  label: string; value: string; sub?: string; icon: string;
  accent?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'pink';
  trend?: { value: string; positive: boolean };
}) {
  const styles = {
    default: { card: 'bg-white', icon: 'bg-primary/10 text-primary' },
    success: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-600' },
    warning: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-600' },
    danger: { card: 'bg-red-50 border-red-200', icon: 'bg-red-100 text-red-600' },
    info: { card: 'bg-blue-50 border-blue-200', icon: 'bg-blue-100 text-blue-600' },
    pink: { card: 'bg-pink-50 border-pink-200', icon: 'bg-pink-100 text-pink-600' },
  };
  const s = styles[accent];
  return (
    <div className={`rounded-xl border p-5 shadow-card flex flex-col gap-3 ${s.card}`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.icon}`}>
          <Icon name={icon as any} size={18} />
        </div>
        {trend && (
          <span className={`flex items-center gap-1 text-xs font-500 ${trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
            <Icon name={trend.positive ? 'ArrowUpIcon' : 'ArrowDownIcon'} size={11} />
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-[11px] font-500 text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-700 tabular-nums text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function GeneralDashboardPage() {
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [loading, setLoading] = useState(true);

  const [kpis, setKpis] = useState<KPIData>({
    totalRevenue: 0, totalTickets: 0, avgBasket: 0, totalDiscounts: 0,
    almaRevenue: 0, sumupRevenue: 0, cashRevenue: 0, transferRevenue: 0,
    cancelledCount: 0, reservationDeposits: 0, reservationBalances: 0,
  });
  const [revenueChart, setRevenueChart] = useState<RevenuePoint[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [employeePerfs, setEmployeePerfs] = useState<EmployeePerf[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number; color: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { from, to } = getPeriodDates(period, customFrom, customTo);

    try {
      // Load employees & categories for filters
      const [empResult, catResult] = await Promise.all([
        supabase.from('employees').select('id, first_name, last_name').eq('status', 'active'),
        supabase.from('categories').select('id, name'),
      ]);
      const emps = empResult.data;
      const cats = catResult.data;
      setEmployees((emps ?? []).map(e => ({ id: e.id, name: `${e.first_name} ${e.last_name}`.trim() })));
      setCategories((cats ?? []).map(c => ({ id: c.id, name: c.name })));

      // Load receipts
      let receiptsQuery = supabase
        .from('receipts')
        .select('id, total_amount, payment_method, status, created_at, discount_amount, cashier_name, items_count')
        .gte('created_at', from)
        .lte('created_at', to);

      const { data: receipts } = await receiptsQuery;
      const validReceipts = (receipts ?? []).filter(r => r.status !== 'cancelled');
      const cancelledReceipts = (receipts ?? []).filter(r => r.status === 'cancelled');

      // KPIs
      const totalRevenue = validReceipts.reduce((sum, r) => sum + (r.total_amount ?? 0), 0);
      const totalTickets = validReceipts.length;
      const avgBasket = totalTickets > 0 ? totalRevenue / totalTickets : 0;
      const totalDiscounts = validReceipts.reduce((sum, r) => sum + (r.discount_amount ?? 0), 0);

      // Payment breakdown
      const paymentMap: Record<string, number> = {};
      for (const r of validReceipts) {
        const method = r.payment_method ?? 'Autre';
        paymentMap[method] = (paymentMap[method] ?? 0) + (r.total_amount ?? 0);
      }

      const almaRevenue = (paymentMap['Alma (3x/4x)'] ?? 0) + (paymentMap['alma'] ?? 0);
      const sumupRevenue = (paymentMap['SumUp (CB)'] ?? 0) + (paymentMap['CB'] ?? 0) + (paymentMap['card'] ?? 0);
      const cashRevenue = (paymentMap['Espèces'] ?? 0) + (paymentMap['cash'] ?? 0);
      const transferRevenue = (paymentMap['Virement'] ?? 0) + (paymentMap['transfer'] ?? 0);

      const paymentBreakdownData = Object.entries(paymentMap)
        .map(([name, value]) => ({
          name: name === 'CB' || name === 'card' ? 'SumUp (CB)' : name === 'cash' ? 'Espèces' : name === 'transfer' ? 'Virement' : name,
          value,
          color: PAYMENT_COLORS[name] ?? '#6b7280',
        }))
        .filter(p => p.value > 0)
        .sort((a, b) => b.value - a.value);

      // Revenue chart — group by day/week depending on period
      const chartMap: Record<string, { revenue: number; tickets: number }> = {};
      for (const r of validReceipts) {
        const d = new Date(r.created_at);
        let key: string;
        if (period === 'today') {
          key = `${String(d.getHours()).padStart(2, '0')}h`;
        } else if (period === 'week' || period === 'month') {
          key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
        } else {
          key = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
        }
        if (!chartMap[key]) chartMap[key] = { revenue: 0, tickets: 0 };
        chartMap[key].revenue += r.total_amount ?? 0;
        chartMap[key].tickets += 1;
      }
      const chartData = Object.entries(chartMap).map(([label, v]) => ({ label, ...v }));

      // Reservation KPIs
      const { data: reservations } = await supabase
        .from('reservations')
        .select('deposit_paid, balance_paid, balance_due')
        .gte('created_at', from)
        .lte('created_at', to);

      const reservationDeposits = (reservations ?? []).reduce((sum, r) => sum + (r.deposit_paid ?? 0), 0);
      const reservationBalances = (reservations ?? []).reduce((sum, r) => sum + (r.balance_paid ?? 0), 0);

      // Employee performance
      const { data: empSales } = await supabase
        .from('employee_sales')
        .select('employee_id, total_ttc, was_cancelled')
        .gte('sold_at', from)
        .lte('sold_at', to);

      const empMap: Record<string, { revenue: number; tickets: number }> = {};
      for (const s of (empSales ?? []).filter(s => !s.was_cancelled)) {
        if (!empMap[s.employee_id]) empMap[s.employee_id] = { revenue: 0, tickets: 0 };
        empMap[s.employee_id].revenue += s.total_ttc ?? 0;
        empMap[s.employee_id].tickets += 1;
      }

      const { data: empDetails } = await supabase
        .from('employees')
        .select('id, first_name, last_name, monthly_objective');

      const empPerfs: EmployeePerf[] = Object.entries(empMap).map(([empId, data]) => {
        const emp = (empDetails ?? []).find(e => e.id === empId);
        const name = emp ? `${emp.first_name} ${emp.last_name}`.trim() : 'Inconnu';
        const monthlyObj = emp?.monthly_objective ?? 0;
        const progress = monthlyObj > 0 ? Math.min(100, (data.revenue / monthlyObj) * 100) : 0;
        return { name, revenue: data.revenue, tickets: data.tickets, progress };
      }).sort((a, b) => b.revenue - a.revenue);

      setKpis({
        totalRevenue, totalTickets, avgBasket, totalDiscounts,
        almaRevenue, sumupRevenue, cashRevenue, transferRevenue,
        cancelledCount: cancelledReceipts.length,
        reservationDeposits, reservationBalances,
      });
      setRevenueChart(chartData);
      setPaymentBreakdown(paymentBreakdownData);
      setEmployeePerfs(empPerfs);
    } catch (e) {
      console.error('Dashboard load error:', e);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, filterEmployee, filterCategory]);

  useEffect(() => { loadData(); }, [loadData]);

  const PERIOD_OPTS: { id: PeriodFilter; label: string }[] = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: '7 jours' },
    { id: 'month', label: 'Ce mois' },
    { id: 'year', label: 'Cette année' },
    { id: 'custom', label: 'Personnalisé' },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Sticky header */}
        <div className="border-b border-border bg-white px-6 py-4 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-700 text-foreground">Dashboard général</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Vue centralisée — tous les KPIs</p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Period */}
              <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
                {PERIOD_OPTS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPeriod(p.id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-500 transition-all ${
                      period === p.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Custom dates */}
              {period === 'custom' && (
                <div className="flex items-center gap-1.5">
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    className="border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <span className="text-muted-foreground text-xs">→</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    className="border border-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </div>
              )}

              {/* Employee filter */}
              <select
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
                className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="all">Tous les employés</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>

              {/* Category filter */}
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
              >
                <option value="all">Toutes les catégories</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>

              <button
                onClick={loadData}
                className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                title="Actualiser"
              >
                <Icon name="ArrowPathIcon" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Icon name="ArrowPathIcon" size={32} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* KPI Grid — Row 1: Revenue */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="lg:col-span-2">
                  <KPICard
                    label="Chiffre d'affaires"
                    value={`${fmt(kpis.totalRevenue)} €`}
                    sub={`${kpis.totalTickets} tickets validés`}
                    icon="BanknotesIcon"
                    accent="success"
                  />
                </div>
                <KPICard
                  label="Panier moyen"
                  value={`${fmt(kpis.avgBasket)} €`}
                  sub="Par ticket validé"
                  icon="CalculatorIcon"
                />
                <KPICard
                  label="Remises accordées"
                  value={`${fmt(kpis.totalDiscounts)} €`}
                  sub={`${kpis.cancelledCount} annulation(s)`}
                  icon="ReceiptPercentIcon"
                  accent="warning"
                />
              </div>

              {/* KPI Grid — Row 2: Payment methods */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="SumUp (CB)"
                  value={`${fmt(kpis.sumupRevenue)} €`}
                  sub="Terminal carte bancaire"
                  icon="CreditCardIcon"
                  accent="info"
                />
                <KPICard
                  label="Espèces"
                  value={`${fmt(kpis.cashRevenue)} €`}
                  sub="Paiements en liquide"
                  icon="BanknotesIcon"
                  accent="success"
                />
                <KPICard
                  label="Alma (plusieurs fois)"
                  value={`${fmt(kpis.almaRevenue)} €`}
                  sub="CA total reçu via Alma"
                  icon="SparklesIcon"
                  accent="pink"
                />
                <KPICard
                  label="Virement"
                  value={`${fmt(kpis.transferRevenue)} €`}
                  sub="Virements bancaires"
                  icon="ArrowsRightLeftIcon"
                />
              </div>

              {/* KPI Grid — Row 3: Reservations */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard
                  label="Acomptes réservations"
                  value={`${fmt(kpis.reservationDeposits)} €`}
                  sub="Encaissés sur la période"
                  icon="CalendarDaysIcon"
                  accent="info"
                />
                <KPICard
                  label="Soldes réservations"
                  value={`${fmt(kpis.reservationBalances)} €`}
                  sub="Encaissés sur la période"
                  icon="CheckCircleIcon"
                  accent="success"
                />
                <div className="lg:col-span-2">
                  <KPICard
                    label="CA total réservations"
                    value={`${fmt(kpis.reservationDeposits + kpis.reservationBalances)} €`}
                    sub="Acomptes + soldes (sans double comptage)"
                    icon="CurrencyEuroIcon"
                  />
                </div>
              </div>

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Revenue chart */}
                <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-[15px] font-600 text-foreground">Évolution du CA</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">Chiffre d'affaires sur la période sélectionnée</p>
                    </div>
                  </div>
                  {revenueChart.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      <div className="text-center">
                        <Icon name="ChartBarIcon" size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Aucune donnée sur cette période</p>
                      </div>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={revenueChart} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="dashRevGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(5,38%,62%)" stopOpacity={0.18} />
                            <stop offset="95%" stopColor="hsl(5,38%,62%)" stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(25,20%,92%)" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(20,10%,50%)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'hsl(20,10%,50%)' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}€`} />
                        <Tooltip
                          content={({ active, payload, label }: any) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="bg-white border border-border rounded-lg shadow p-3 text-xs">
                                <p className="font-600 mb-1">{label}</p>
                                <p>CA : <strong>{fmt(payload[0]?.value ?? 0)} €</strong></p>
                                <p>Tickets : <strong>{payload[1]?.value ?? 0}</strong></p>
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="hsl(5,38%,62%)" strokeWidth={2} fill="url(#dashRevGrad)" dot={false} />
                        <Area type="monotone" dataKey="tickets" stroke="#2563eb" strokeWidth={1.5} fill="transparent" dot={false} strokeDasharray="4 2" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Payment pie */}
                <div className="bg-white border border-border rounded-xl p-5">
                  <h3 className="text-[15px] font-600 text-foreground mb-1">Modes de paiement</h3>
                  <p className="text-xs text-muted-foreground mb-4">Répartition du CA</p>
                  {paymentBreakdown.length === 0 ? (
                    <div className="flex items-center justify-center h-48 text-muted-foreground">
                      <div className="text-center">
                        <Icon name="ChartPieIcon" size={32} className="mx-auto mb-2 opacity-20" />
                        <p className="text-sm">Aucune donnée</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={paymentBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40}>
                            {paymentBreakdown.map((entry, i) => (
                              <Cell key={`cell-${i}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => `${fmt(v)} €`} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 mt-2">
                        {paymentBreakdown.map(p => (
                          <div key={p.name} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                              <span className="text-muted-foreground">{p.name}</span>
                            </div>
                            <span className="font-600 tabular-nums">{fmt(p.value)} €</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Employee performance */}
              <div className="bg-white border border-border rounded-xl p-5">
                <h3 className="text-[15px] font-600 text-foreground mb-1">Performance par employé</h3>
                <p className="text-xs text-muted-foreground mb-4">CA réalisé sur la période — progression vers l'objectif mensuel</p>
                {employeePerfs.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Icon name="UserGroupIcon" size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-sm">Aucune donnée employé sur cette période</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {employeePerfs.map((emp, i) => (
                      <div key={`emp-perf-${i}`} className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-700 text-primary">
                            {emp.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-600 text-foreground truncate">{emp.name}</p>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-xs text-muted-foreground">{emp.tickets} tickets</span>
                              <span className="text-sm font-700 tabular-nums text-foreground">{fmt(emp.revenue)} €</span>
                              <span className={`text-xs font-600 w-10 text-right ${
                                emp.progress >= 100 ? 'text-emerald-600' : emp.progress >= 70 ? 'text-amber-600' : 'text-red-500'
                              }`}>
                                {Math.round(emp.progress)}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${
                                emp.progress >= 100 ? 'bg-emerald-500' : emp.progress >= 70 ? 'bg-amber-500' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(100, emp.progress)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
