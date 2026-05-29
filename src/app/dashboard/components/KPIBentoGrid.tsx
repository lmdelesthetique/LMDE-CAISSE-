'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { fetchDashboardKPIs, type DashboardKPIs, type DashboardFiltersState } from '@/lib/services/dashboardService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: { value: string; positive: boolean };
  icon: string;
  accent?: 'default' | 'warning' | 'danger' | 'success' | 'info';
  hero?: boolean;
  loading?: boolean;
}

function KPICard({ label, value, sub, trend, icon, accent = 'default', hero, loading }: KPICardProps) {
  const accentStyles = {
    default: { card: 'bg-white', icon: 'bg-primary/10 text-primary', trend_pos: 'text-emerald-600', trend_neg: 'text-red-500' },
    warning: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-600', trend_pos: 'text-emerald-600', trend_neg: 'text-red-500' },
    danger:  { card: 'bg-red-50 border-red-200',     icon: 'bg-red-100 text-red-600',     trend_pos: 'text-emerald-600', trend_neg: 'text-red-500' },
    success: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', trend_pos: 'text-emerald-600', trend_neg: 'text-red-500' },
    info:    { card: 'bg-blue-50 border-blue-200',   icon: 'bg-blue-100 text-blue-600',   trend_pos: 'text-emerald-600', trend_neg: 'text-red-500' },
  };
  const s = accentStyles[accent];

  return (
    <div className={`rounded-xl border ${s.card} p-5 shadow-card flex flex-col gap-3 h-full`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.icon}`}>
          <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={18} />
        </div>
        {trend && !loading && (
          <span className={`flex items-center gap-1 text-xs font-medium ${trend.positive ? s.trend_pos : s.trend_neg}`}>
            <Icon name={trend.positive ? 'ArrowUpIcon' : 'ArrowDownIcon'} size={12} />
            {trend.value}
          </span>
        )}
      </div>
      <div>
        <p className="text-[12px] font-500 text-muted-foreground uppercase tracking-wide">{label}</p>
        {loading ? (
          <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1" />
        ) : (
          <p className={`font-700 tabular-nums text-foreground mt-0.5 ${hero ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
        )}
        {sub && !loading && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function pct(a: number, b: number): { value: string; positive: boolean } {
  if (b === 0) return { value: '—', positive: true };
  const diff = ((a - b) / b) * 100;
  return { value: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`, positive: diff >= 0 };
}

function fmt(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
}

const PERIOD_LABELS: Record<string, string> = {
  today: "aujourd'hui",
  week: 'cette semaine',
  month: 'ce mois',
  year: 'cette année',
};

interface KPIBentoGridProps {
  filters?: DashboardFiltersState;
}

export default function KPIBentoGrid({ filters }: KPIBentoGridProps) {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    fetchDashboardKPIs(filters)
      .then(setKpis)
      .catch(() => setKpis(null))
      .finally(() => setLoading(false));
  }, [filters?.period, filters?.employeeId, filters?.categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time sync: refresh KPIs when receipts or products change
  useRealtimeSync({ tables: ['receipts', 'products'], onRefresh: load });

  const now = new Date();
  const periodLabel = PERIOD_LABELS[filters?.period ?? 'month'] ?? 'ce mois';
  const monthLabel = now.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4 gap-4">
      {/* Row 1 */}
      <div className="md:col-span-2 lg:col-span-2">
        <KPICard
          label={`CA — ${monthLabel}`}
          value={kpis ? fmt(kpis.caMonth) : '—'}
          sub={kpis ? `Période précédente : ${fmt(kpis.caMonthPrev)}` : undefined}
          trend={kpis ? pct(kpis.caMonth, kpis.caMonthPrev) : undefined}
          icon="BanknotesIcon"
          hero
          loading={loading}
        />
      </div>
      <KPICard
        label={`CA ${periodLabel}`}
        value={kpis ? fmt(kpis.caWeek) : '—'}
        sub={kpis ? `Période précédente : ${fmt(kpis.caWeekPrev)}` : undefined}
        trend={kpis ? pct(kpis.caWeek, kpis.caWeekPrev) : undefined}
        icon="CalendarIcon"
        loading={loading}
      />
      <KPICard
        label="CA du jour"
        value={kpis ? fmt(kpis.caDay) : '—'}
        sub={kpis ? `Hier : ${fmt(kpis.caDayPrev)}` : undefined}
        trend={kpis ? pct(kpis.caDay, kpis.caDayPrev) : undefined}
        icon="SunIcon"
        loading={loading}
      />

      {/* Row 2 */}
      <KPICard
        label="Ventes aujourd'hui"
        value={kpis ? String(kpis.salesDay) : '—'}
        sub={kpis ? `Hier : ${kpis.salesDayPrev} vente${kpis.salesDayPrev !== 1 ? 's' : ''}` : undefined}
        trend={kpis ? pct(kpis.salesDay, kpis.salesDayPrev) : undefined}
        icon="ShoppingBagIcon"
        accent="info"
        loading={loading}
      />
      <KPICard
        label="Panier moyen"
        value={kpis ? kpis.avgBasket.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €' : '—'}
        sub="Basé sur les ventes du jour"
        icon="CalculatorIcon"
        loading={loading}
      />
      <KPICard
        label="Alertes stock"
        value={kpis ? String(kpis.stockAlertCount) : '—'}
        sub="produits en rupture ou critique"
        icon="ExclamationTriangleIcon"
        accent={kpis && kpis.stockAlertCount > 0 ? 'danger' : 'success'}
        loading={loading}
      />
      <KPICard
        label="Produits actifs"
        value={kpis ? String(kpis.activeProductsCount) : '—'}
        sub="Catalogue actif en temps réel"
        icon="CalendarDaysIcon"
        accent="success"
        loading={loading}
      />

      {/* Row 3 — Margin KPIs */}
      <div className="md:col-span-2 lg:col-span-2">
        <KPICard
          label="Taux de marque moyen"
          value={kpis ? `${kpis.avgMarginPct.toFixed(1)} %` : '—'}
          sub="MB / PV HT — produits actifs"
          icon="ChartBarIcon"
          accent={kpis && kpis.avgMarginPct >= 50 ? 'success' : kpis && kpis.avgMarginPct >= 20 ? 'default' : 'warning'}
          loading={loading}
        />
      </div>
      <KPICard
        label="Marges < 20 %"
        value={kpis ? String(kpis.productsBelow20Pct) : '—'}
        sub="Produits peu rentables (alerte)"
        icon="ArrowTrendingDownIcon"
        accent={kpis && kpis.productsBelow20Pct > 0 ? 'danger' : 'success'}
        loading={loading}
      />
      <KPICard
        label="Marges ≥ 50 %"
        value={kpis ? String(kpis.productsAbove50Pct) : '—'}
        sub="Produits très rentables"
        icon="ArrowTrendingUpIcon"
        accent="success"
        loading={loading}
      />

    </div>
  );
}