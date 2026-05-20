'use client';

import React, { useEffect, useState, useCallback } from 'react';
import StatusBadge from '@/components/ui/StatusBadge';
import { fetchTopProducts, type TopProduct, type DashboardFiltersState } from '@/lib/services/dashboardService';

interface TopProductsTableProps {
  filters?: DashboardFiltersState;
}

export default function TopProductsTable({ filters }: TopProductsTableProps) {
  const [products, setProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetchTopProducts(filters)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [filters?.period, filters?.employeeId, filters?.categoryId]);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();
  const monthLabel = now.toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-[15px] font-600 text-foreground">Top produits — {monthLabel}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Classés par chiffre d'affaires</p>
        </div>
        <button className="text-xs text-primary font-500 hover:underline">Voir tous</button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : products.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Aucune vente enregistrée sur la période
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide w-8">#</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Produit</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Catégorie</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Qté</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">CA</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Marge</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products?.map((p, idx) => (
                <tr
                  key={p?.id}
                  className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 1 ? 'bg-muted/10' : ''}`}
                >
                  <td className="px-4 py-3 text-[12px] font-600 text-muted-foreground tabular-nums">{p?.rank}</td>
                  <td className="px-4 py-3 font-500 text-foreground max-w-[200px] truncate">{p?.name}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-medium">{p?.category ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{p?.qty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-600 text-foreground">{p?.revenue?.toLocaleString('fr-FR')} €</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <span className={`text-xs font-600 ${p?.margin >= 65 ? 'text-emerald-600' : p?.margin >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {p?.margin}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p?.stock <= 3
                      ? <StatusBadge variant="rupture" label={`${p?.stock}`} size="sm" />
                      : p?.stock <= 8
                      ? <StatusBadge variant="warning" label={`${p?.stock}`} size="sm" />
                      : <span className="text-xs tabular-nums text-muted-foreground">{p?.stock}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}