'use client';

import React, { useEffect, useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { fetchStockAlerts, type StockAlert } from '@/lib/services/dashboardService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export default function StockAlerts() {
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStockAlerts()
      .then(setAlerts)
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, []);

  // Real-time sync: refresh alerts when products or stock_movements change
  useRealtimeSync({
    tables: ['products', 'stock_movements'],
    onRefresh: () => fetchStockAlerts().then(setAlerts).catch(() => {}),
  });

  return (
    <div className="bg-white border border-red-200 rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-red-100 bg-red-50">
        <div className="flex items-center gap-2">
          <Icon name="ExclamationTriangleIcon" size={16} className="text-red-600" />
          <h3 className="text-[14px] font-600 text-red-800">Alertes stock</h3>
        </div>
        {!loading && (
          <span className="text-xs bg-red-100 text-red-700 font-600 px-2 py-0.5 rounded-full">{alerts.length}</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          Aucune alerte stock — tout est OK ✓
        </div>
      ) : (
        <div className="divide-y divide-border">
          {alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/20 transition-colors">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-500 text-foreground truncate">{a.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Stock : {a.stock} / Min : {a.min}</p>
              </div>
              <StatusBadge variant={a.level} size="sm" />
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3 border-t border-border">
        <button className="text-xs text-primary font-500 hover:underline w-full text-center">Voir tout le stock →</button>
      </div>
    </div>
  );
}