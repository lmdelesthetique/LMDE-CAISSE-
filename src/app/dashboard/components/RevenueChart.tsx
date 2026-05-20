'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchRevenueChart, type RevenuePoint, type DashboardFiltersState } from '@/lib/services/dashboardService';

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-3 min-w-[140px]">
      <p className="text-xs font-600 text-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <div key={`tt-row-${i}`} className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">{p.name === 'revenue' ? 'CA' : 'Ventes'}</span>
          <span className="text-xs font-600 text-foreground tabular-nums">
            {p.name === 'revenue' ? `${p.value.toLocaleString('fr-FR')} €` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface RevenueChartProps {
  filters?: DashboardFiltersState;
}

export default function RevenueChart({ filters }: RevenueChartProps) {
  const [data, setData] = useState<RevenuePoint[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchRevenueChart(filters)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [filters?.period, filters?.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const period = filters?.period ?? 'month';
  let days = 14;
  if (period === 'today') days = 1;
  else if (period === 'week') days = 7;
  else if (period === 'year') days = 365;

  const since = new Date(now.getTime() - days * 86400000);
  const rangeLabel = `${since.getDate()} ${since.toLocaleString('fr-FR', { month: 'short' })} – ${now.getDate()} ${now.toLocaleString('fr-FR', { month: 'short' })} ${now.getFullYear()}`;

  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-600 text-foreground">Évolution du chiffre d'affaires</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Boutique principale</p>
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">{rangeLabel}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[220px]">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
          Aucune vente sur la période sélectionnée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(5,38%,62%)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="hsl(5,38%,62%)" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(25,20%,92%)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'hsl(20,10%,50%)', fontFamily: 'DM Sans' }}
              axisLine={false}
              tickLine={false}
              interval={1}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(20,10%,50%)', fontFamily: 'DM Sans' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v}€`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="hsl(5,38%,62%)"
              strokeWidth={2}
              fill="url(#revenueGrad)"
              dot={false}
              activeDot={{ r: 4, fill: 'hsl(5,38%,62%)', stroke: 'white', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}