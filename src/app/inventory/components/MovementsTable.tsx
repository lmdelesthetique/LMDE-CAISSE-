'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export type MovementType = 'entry' | 'exit' | 'adjustment' | 'transfer' | 'return';

export interface Movement {
  id: string;
  productName: string;
  locationName: string;
  movementType: MovementType;
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;
  notes?: string;
  performedBy: string;
  createdAt: string;
}

const typeConfig: Record<MovementType, { label: string; color: string; icon: string; bg: string }> = {
  entry:      { label: 'Entrée',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'ArrowDownTrayIcon' },
  exit:       { label: 'Sortie',      color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: 'ArrowUpTrayIcon' },
  adjustment: { label: 'Ajustement',  color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: 'AdjustmentsHorizontalIcon' },
  transfer:   { label: 'Transfert',   color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: 'ArrowsRightLeftIcon' },
  return:     { label: 'Retour',      color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   icon: 'ArrowUturnLeftIcon' },
};

interface MovementsTableProps {
  movements: Movement[];
  loading: boolean;
  filterType: string;
  onFilterChange: (v: string) => void;
}

export default function MovementsTable({ movements, loading, filterType, onFilterChange }: MovementsTableProps) {
  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Icon name="ClipboardDocumentListIcon" size={16} className="text-primary" />
          <h3 className="text-[14px] font-600 text-foreground">Mouvements de stock</h3>
        </div>
        <select
          value={filterType}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-xs border border-border rounded-lg px-3 py-1.5 bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          <option value="">Tous les types</option>
          <option value="entry">Entrées</option>
          <option value="exit">Sorties</option>
          <option value="adjustment">Ajustements</option>
          <option value="transfer">Transferts</option>
          <option value="return">Retours</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Icon name="ClipboardDocumentListIcon" size={32} className="mb-2 opacity-30" />
          <p className="text-sm">Aucun mouvement trouvé</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Produit</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Emplacement</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Qté</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Coût total</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Référence</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Par</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m) => {
                const cfg = typeConfig[m.movementType] ?? { label: m.movementType, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: 'TagIcon' };
                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-500 px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        <Icon name={cfg.icon as Parameters<typeof Icon>[0]['name']} size={11} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-500 text-foreground truncate max-w-[180px]">{m.productName}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{m.locationName}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-600 tabular-nums ${m.movementType === 'entry' || m.movementType === 'return' ? 'text-emerald-600' : m.movementType === 'exit' ? 'text-red-600' : 'text-amber-600'}`}>
                        {m.movementType === 'entry' || m.movementType === 'return' ? '+' : m.movementType === 'exit' ? '-' : '±'}{Math.abs(m.quantity)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground tabular-nums text-xs">
                      {m.totalCost ? `${m.totalCost.toLocaleString('fr-FR')} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.reference || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.performedBy}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{m.createdAt}</td>
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
