'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

interface KPI {
  label: string;
  value: string;
  sub: string;
  icon: string;
  accent: 'default' | 'warning' | 'danger' | 'success' | 'info';
  trend?: { value: string; positive: boolean };
}

interface InventoryKPIsProps {
  totalProducts: number;
  totalValue: number;
  alertCount: number;
  outOfStockCount: number;
  entriesThisMonth: number;
  exitsThisMonth: number;
}

export default function InventoryKPIs({
  totalProducts,
  totalValue,
  alertCount,
  outOfStockCount,
  entriesThisMonth,
  exitsThisMonth,
}: InventoryKPIsProps) {
  const kpis: KPI[] = [
    {
      label: 'Valeur du stock',
      value: `${totalValue.toLocaleString('fr-FR')} €`,
      sub: `${totalProducts} références actives`,
      icon: 'CurrencyEuroIcon',
      accent: 'default',
      trend: { value: '+4,2% ce mois', positive: true },
    },
    {
      label: 'Alertes stock',
      value: String(alertCount),
      sub: `dont ${outOfStockCount} en rupture totale`,
      icon: 'ExclamationTriangleIcon',
      accent: alertCount > 0 ? 'danger' : 'success',
    },
    {
      label: 'Entrées ce mois',
      value: String(entriesThisMonth),
      sub: 'mouvements d\'approvisionnement',
      icon: 'ArrowDownTrayIcon',
      accent: 'success',
    },
    {
      label: 'Sorties ce mois',
      value: String(exitsThisMonth),
      sub: 'ventes + transferts + ajustements',
      icon: 'ArrowUpTrayIcon',
      accent: 'info',
    },
  ];

  const accentStyles = {
    default: { card: 'bg-white', icon: 'bg-primary/10 text-primary' },
    warning: { card: 'bg-amber-50 border-amber-200', icon: 'bg-amber-100 text-amber-600' },
    danger:  { card: 'bg-red-50 border-red-200',     icon: 'bg-red-100 text-red-600' },
    success: { card: 'bg-emerald-50 border-emerald-200', icon: 'bg-emerald-100 text-emerald-600' },
    info:    { card: 'bg-blue-50 border-blue-200',   icon: 'bg-blue-100 text-blue-600' },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi, i) => {
        const s = accentStyles[kpi.accent];
        return (
          <div key={`kpi-${i}`} className={`rounded-xl border ${s.card} p-5 shadow-card flex flex-col gap-3`}>
            <div className="flex items-start justify-between">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.icon}`}>
                <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} />
              </div>
              {kpi.trend && (
                <span className={`flex items-center gap-1 text-xs font-medium ${kpi.trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
                  <Icon name={kpi.trend.positive ? 'ArrowUpIcon' : 'ArrowDownIcon'} size={12} />
                  {kpi.trend.value}
                </span>
              )}
            </div>
            <div>
              <p className="text-[12px] font-500 text-muted-foreground uppercase tracking-wide">{kpi.label}</p>
              <p className="text-2xl font-700 tabular-nums text-foreground mt-0.5">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
