'use client';

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,  } from 'recharts';

interface SupplierCostItem {
  supplierName: string;
  totalCost: number;
  orderCount: number;
}

interface SupplierCostChartProps {
  data: SupplierCostItem[];
  loading: boolean;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-card p-3 min-w-[160px]">
      <p className="text-xs font-600 text-foreground mb-2 truncate">{label}</p>
      {payload.map((p, i) => (
        <div key={`tt-${i}`} className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">{p.name === 'totalCost' ? 'Coût total' : 'Commandes'}</span>
          <span className="text-xs font-600 text-foreground tabular-nums">
            {p.name === 'totalCost' ? `${Number(p.value).toLocaleString('fr-FR')} €` : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SupplierCostChart({ data, loading }: SupplierCostChartProps) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-600 text-foreground">Coûts par fournisseur</h3>
        <span className="text-xs text-muted-foreground">Ce mois</span>
      </div>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
          Aucune donnée disponible
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis
              dataKey="supplierName"
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + '…' : v}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#888' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toLocaleString('fr-FR')} €`}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="totalCost" name="totalCost" fill="var(--color-primary, #7c3aed)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
