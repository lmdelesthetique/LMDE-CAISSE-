'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface MarginData {
  revenue: number;
  costOfGoods: number;
  importCosts: number;
  supplierPayments: number;
  fixedExpenses: number;
  variableExpenses: number;
  dailyExpenses: number;
  grossMargin: number;
  grossMarginPct: number;
  netMargin: number;
  netMarginPct: number;
  structurePct: number;
}

export default function RealMarginDashboard() {
  const [data, setData] = useState<MarginData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/margin?period=${period}`);
        if (!res.ok) throw new Error('fetch failed');
        const json = await res.json();
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  const fmt = (v: number) => v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0€';
  const pct = (v: number) => v.toFixed(1) + '%';

  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Icon name="ChartBarIcon" size={17} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="font-600 text-foreground">Marge réelle</h3>
            <p className="text-xs text-muted-foreground">Analyse revenus vs dépenses</p>
          </div>
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {[['month', 'Ce mois'], ['3months', '3 mois'], ['year', 'Cette année']].map(([val, lbl]) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                period === val ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? null : (
        <div className="space-y-4">
          {/* Revenue vs costs waterfall */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'CA encaissé', value: data.revenue, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'BanknotesIcon' },
              { label: 'Coût produits', value: -data.costOfGoods, color: 'text-red-700 bg-red-50 border-red-200', icon: 'ShoppingBagIcon' },
              { label: 'Frais import', value: -data.importCosts, color: 'text-orange-700 bg-orange-50 border-orange-200', icon: 'TruckIcon' },
              { label: 'Paiements fourn.', value: -data.supplierPayments, color: 'text-amber-700 bg-amber-50 border-amber-200', icon: 'BuildingOfficeIcon' },
            ].map((item) => (
              <div key={item.label} className={`rounded-xl p-3 border ${item.color}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon name={item.icon as any} size={13} />
                  <p className="text-xs font-medium">{item.label}</p>
                </div>
                <p className="text-base font-700">{fmt(Math.abs(item.value))}</p>
              </div>
            ))}
          </div>

          {/* Margin bars */}
          <div className="space-y-3">
            {/* Gross margin */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-600 text-foreground">Marge brute</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-700 ${data.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(data.grossMargin)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-600 ${data.grossMarginPct >= 30 ? 'bg-emerald-100 text-emerald-700' : data.grossMarginPct >= 15 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {pct(data.grossMarginPct)}
                  </span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${data.grossMarginPct >= 30 ? 'bg-emerald-500' : data.grossMarginPct >= 15 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, data.grossMarginPct))}%` }}
                />
              </div>
            </div>

            {/* Expenses breakdown */}
            <div className="bg-muted/30 rounded-xl p-3 space-y-2">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Dépenses entreprise</p>
              {[
                { label: 'Fixes mensuelles', value: data.fixedExpenses, color: 'bg-purple-400' },
                { label: 'Variables', value: data.variableExpenses, color: 'bg-amber-400' },
                { label: 'Quotidiennes', value: data.dailyExpenses, color: 'bg-blue-400' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="font-600 text-foreground">{fmt(item.value)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm border-t border-border pt-2">
                <span className="font-600 text-foreground">Total dépenses</span>
                <span className="font-700 text-red-600">{fmt(data.fixedExpenses + data.variableExpenses + data.dailyExpenses)}</span>
              </div>
            </div>

            {/* Net margin */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-700 text-foreground">Marge nette estimée</span>
                <div className="flex items-center gap-2">
                  <span className={`text-base font-700 ${data.netMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(data.netMargin)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-700 ${data.netMarginPct >= 15 ? 'bg-emerald-100 text-emerald-700' : data.netMarginPct >= 5 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                    {pct(data.netMarginPct)}
                  </span>
                </div>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${data.netMarginPct >= 15 ? 'bg-emerald-500' : data.netMarginPct >= 5 ? 'bg-amber-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(100, Math.max(0, data.netMarginPct))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Structure fee */}
          <div className="flex items-center justify-between p-3 bg-violet-50 border border-violet-200 rounded-xl">
            <div className="flex items-center gap-2">
              <Icon name="CalculatorIcon" size={15} className="text-violet-600" />
              <span className="text-sm font-600 text-violet-800">Frais structure appliqués</span>
            </div>
            <span className="text-base font-700 text-violet-700">{pct(data.structurePct)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
