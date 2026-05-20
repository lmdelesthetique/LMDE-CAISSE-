'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchPaymentMethods, type PaymentMethodData, type DashboardFiltersState } from '@/lib/services/dashboardService';

function CustomTooltip({ active, payload, total }: { active?: boolean; payload?: { name: string; value: number; payload: { color: string } }[]; total: number }) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.payload.color }} />
        <span className="text-xs font-600 text-foreground">{item.name}</span>
      </div>
      <p className="text-sm font-700 tabular-nums">{item.value.toLocaleString('fr-FR')} €</p>
      <p className="text-xs text-muted-foreground">{total > 0 ? ((item.value / total) * 100).toFixed(1) : 0}% du total</p>
    </div>
  );
}

interface PaymentMethodChartProps {
  filters?: DashboardFiltersState;
}

export default function PaymentMethodChart({ filters }: PaymentMethodChartProps) {
  const [data, setData] = useState<PaymentMethodData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchPaymentMethods(filters)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [filters?.period, filters?.employeeId]);

  useEffect(() => {
    load();
  }, [load]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5 h-full">
      <div className="mb-4">
        <h3 className="text-[15px] font-600 text-foreground">Modes de paiement</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Répartition de la période</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[160px]">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[160px] text-sm text-muted-foreground">
          Aucune donnée sur la période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
      )}

      {!loading && data.length > 0 && (
        <div className="space-y-2 mt-2">
          {data.map((d) => (
            <div key={`legend-${d.name}`} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-600 tabular-nums text-foreground">{d.value.toLocaleString('fr-FR')} €</span>
                <span className="text-[10px] text-muted-foreground tabular-nums w-10 text-right">
                  {total > 0 ? ((d.value / total) * 100).toFixed(0) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}