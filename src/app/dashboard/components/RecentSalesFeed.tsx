'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { fetchRecentSales, type RecentSale } from '@/lib/services/dashboardService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

const methodIcon: Record<string, string> = {
  'CB': 'CreditCardIcon',
  'SumUp': 'CreditCardIcon',
  'Espèces': 'BanknotesIcon',
  'Acompte': 'DocumentTextIcon',
  'Virement': 'ArrowsRightLeftIcon',
  'Mixte': 'ArrowsRightLeftIcon',
  'Alma': 'CreditCardIcon',
};

export default function RecentSalesFeed() {
  const [sales, setSales] = useState<RecentSale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentSales()
      .then(setSales)
      .catch(() => setSales([]))
      .finally(() => setLoading(false));
  }, []);

  // Real-time sync: refresh feed when receipts are created/updated
  useRealtimeSync({
    tables: ['receipts'],
    onRefresh: () => fetchRecentSales().then(setSales).catch(() => {}),
  });

  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border">
        <h3 className="text-[14px] font-600 text-foreground">Dernières ventes</h3>
        <span className="text-xs text-muted-foreground">Aujourd'hui</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sales.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          Aucune vente aujourd'hui
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sales.map((s) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Icon
                  name={(methodIcon[s.method] ?? 'ReceiptPercentIcon') as Parameters<typeof Icon>[0]['name']}
                  size={14}
                  className="text-primary"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-500 text-foreground truncate">{s.client}</p>
                <p className="text-[11px] text-muted-foreground">{s.time} · {s.items} article{s.items !== 1 ? 's' : ''} · {s.method}</p>
              </div>
              <span className="text-sm font-600 tabular-nums text-foreground shrink-0">{s.amount.toFixed(2)} €</span>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border">
        <button className="text-xs text-primary font-500 hover:underline w-full text-center">Voir toutes les ventes →</button>
      </div>
    </div>
  );
}