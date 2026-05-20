'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export type AlertLevel = 'ok' | 'warning' | 'critical' | 'out_of_stock';

export interface StockItem {
  id: string;
  productName: string;
  sku?: string;
  category?: string;
  supplierName?: string;
  quantity: number;
  minStockLevel: number;
  reorderPoint: number;
  alertLevel: AlertLevel;
  locationName: string;
  unitCost: number;
}

const alertConfig: Record<AlertLevel, { label: string; color: string; bg: string; dot: string }> = {
  ok:           { label: 'OK',        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  warning:      { label: 'Faible',    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     dot: 'bg-amber-500' },
  critical:     { label: 'Critique',  color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         dot: 'bg-red-500' },
  out_of_stock: { label: 'Rupture',   color: 'text-red-900',     bg: 'bg-red-100 border-red-300',        dot: 'bg-red-700' },
};

interface StockAlertsTableProps {
  items: StockItem[];
  loading: boolean;
  showOnlyAlerts: boolean;
  onToggleAlerts: () => void;
}

export default function StockAlertsTable({ items, loading, showOnlyAlerts, onToggleAlerts }: StockAlertsTableProps) {
  const alertItems = showOnlyAlerts ? items.filter((i) => i.alertLevel !== 'ok') : items;
  const alertCount = items.filter((i) => i.alertLevel !== 'ok').length;

  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon name="ExclamationTriangleIcon" size={16} className="text-red-600" />
          <h3 className="text-[14px] font-600 text-foreground">Niveaux de stock</h3>
          {alertCount > 0 && (
            <span className="text-xs bg-red-100 text-red-700 font-600 px-2 py-0.5 rounded-full border border-red-200">
              {alertCount} alerte{alertCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={onToggleAlerts}
          className={`text-xs font-500 px-3 py-1.5 rounded-lg border transition-colors ${
            showOnlyAlerts
              ? 'bg-red-50 border-red-200 text-red-700' :'bg-muted border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {showOnlyAlerts ? 'Voir tout' : 'Alertes seulement'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alertItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Icon name="CheckCircleIcon" size={32} className="mb-2 text-emerald-400" />
          <p className="text-sm font-500">Tous les stocks sont OK</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Produit</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Emplacement</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Fournisseur</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Stock actuel</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Min</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Coût unit.</th>
                <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alertItems.map((item) => {
                const cfg = alertConfig[item.alertLevel];
                const pct = item.minStockLevel > 0 ? Math.min(100, Math.round((item.quantity / item.minStockLevel) * 100)) : 100;
                return (
                  <tr key={`${item.id}-${item.locationName}`} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <p className="font-500 text-foreground truncate max-w-[180px]">{item.productName}</p>
                      {item.sku && <p className="text-[11px] text-muted-foreground">{item.sku}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.locationName}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{item.supplierName || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className={`font-700 tabular-nums text-sm ${item.alertLevel !== 'ok' ? 'text-red-600' : 'text-foreground'}`}>
                          {item.quantity}
                        </span>
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.alertLevel === 'ok' ? 'bg-emerald-500' : item.alertLevel === 'warning' ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">{item.minStockLevel}</td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {item.unitCost > 0 ? `${item.unitCost.toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-500 px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
