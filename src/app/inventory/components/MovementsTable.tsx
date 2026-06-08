'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';

export type MovementType = 'entry' | 'exit' | 'adjustment' | 'transfer' | 'return' | 'sale' | 'b2b_sale' | 'shopify_sale';

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
  entry:        { label: 'Entrée',        color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: 'ArrowDownTrayIcon' },
  exit:         { label: 'Sortie',        color: 'text-red-700',     bg: 'bg-red-50 border-red-200',         icon: 'ArrowUpTrayIcon' },
  adjustment:   { label: 'Ajustement',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     icon: 'AdjustmentsHorizontalIcon' },
  transfer:     { label: 'Transfert',    color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',       icon: 'ArrowsRightLeftIcon' },
  return:       { label: 'Retour',       color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200',   icon: 'ArrowUturnLeftIcon' },
  sale:         { label: 'Vente caisse', color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200',       icon: 'ShoppingBagIcon' },
  b2b_sale:     { label: 'Vente B2B',   color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',   icon: 'DocumentCheckIcon' },
  shopify_sale: { label: 'Vente Shopify',color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',       icon: 'GlobeAltIcon' },
};

const EXIT_TYPES: MovementType[] = ['exit', 'sale', 'b2b_sale', 'shopify_sale', 'transfer'];
const ENTRY_TYPES: MovementType[] = ['entry', 'return'];

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
          <option value="entry">Entrées stock</option>
          <option value="sale">Ventes caisse</option>
          <option value="b2b_sale">Ventes B2B</option>
          <option value="shopify">Ventes Shopify</option>
          <option value="adjustment">Ajustements</option>
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
          <p className="text-xs mt-1 opacity-60">Les ventes caisse et Shopify apparaissent ici en temps réel</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Produit</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Qté</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Référence</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Détail</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Par</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m) => {
                const cfg = typeConfig[m.movementType] ?? { label: m.movementType, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: 'TagIcon' };
                const isEntry = ENTRY_TYPES.includes(m.movementType);
                const isExit = EXIT_TYPES.includes(m.movementType);
                return (
                  <tr key={m.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-500 px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        <Icon name={cfg.icon as Parameters<typeof Icon>[0]['name']} size={11} />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-500 text-foreground truncate max-w-[200px]">{m.productName}</p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-600 tabular-nums ${isEntry ? 'text-emerald-600' : isExit ? 'text-red-600' : 'text-amber-600'}`}>
                        {isEntry ? '+' : isExit ? '-' : '±'}{m.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.reference || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={m.notes}>{m.notes || '—'}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{m.performedBy || '—'}</td>
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
