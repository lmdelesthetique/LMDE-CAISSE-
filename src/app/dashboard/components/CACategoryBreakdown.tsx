'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';

interface CategoryRow {
  name: string;
  revenue: number;
  qty: number;
  pct: number;
}

const PALETTE = [
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#84cc16', // lime
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#a855f7', // purple
  '#64748b', // slate
];

function fmt(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export default function CACategoryBreakdown() {
  const [data, setData] = useState<{ categories: CategoryRow[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/ca-by-category?period=${period}`);
        if (!res.ok) throw new Error('fetch failed');
        setData(await res.json());
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [period]);

  const rows = data?.categories ?? [];
  const visible = expanded ? rows : rows.slice(0, 8);

  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-pink-100 flex items-center justify-center">
            <Icon name="ChartPieIcon" size={17} className="text-pink-600" />
          </div>
          <div>
            <h3 className="font-600 text-foreground">CA par catégorie</h3>
            <p className="text-xs text-muted-foreground">Répartition du chiffre d'affaires</p>
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
      ) : !data || rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <Icon name="ChartPieIcon" size={32} className="opacity-30" />
          <p className="text-sm">Aucune vente sur la période</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Total */}
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <span className="text-sm text-muted-foreground font-medium">Total CA ventilé</span>
            <span className="text-lg font-700 text-foreground">{fmt(data.total)}</span>
          </div>

          {/* Mini donut visual — stacked bar */}
          <div className="flex h-3 rounded-full overflow-hidden gap-px">
            {rows.slice(0, 10).map((row, i) => (
              <div
                key={row.name}
                style={{ width: `${row.pct}%`, backgroundColor: PALETTE[i % PALETTE.length] }}
                title={`${row.name}: ${row.pct}%`}
              />
            ))}
          </div>

          {/* Category rows */}
          <div className="space-y-2 pt-1">
            {visible.map((row, i) => (
              <div key={row.name} className="group">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                    />
                    <span className="text-sm text-foreground font-medium truncate">{row.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{row.qty} unité{row.qty > 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-sm font-600 text-foreground">{fmt(row.revenue)}</span>
                    <span
                      className="text-xs font-700 px-1.5 py-0.5 rounded-md min-w-[42px] text-center"
                      style={{
                        backgroundColor: PALETTE[i % PALETTE.length] + '20',
                        color: PALETTE[i % PALETTE.length],
                      }}
                    >
                      {row.pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${row.pct}%`,
                      backgroundColor: PALETTE[i % PALETTE.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Show more / less */}
          {rows.length > 8 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full text-xs text-muted-foreground hover:text-foreground pt-1 flex items-center justify-center gap-1 transition-colors"
            >
              <Icon name={expanded ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={13} />
              {expanded ? 'Voir moins' : `Voir ${rows.length - 8} catégorie${rows.length - 8 > 1 ? 's' : ''} de plus`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
