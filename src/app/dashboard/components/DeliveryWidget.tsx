'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { deliveryService, type Delivery, DELIVERY_STATUS_CONFIG } from '@/lib/services/deliveryService';

const FOUR_HOURS = 4 * 60 * 60 * 1000;

function isLate(d: Delivery): boolean {
  if (d.status === 'delivered' || d.status === 'cancelled') return false;
  if (d.estimatedTime && new Date(d.estimatedTime) < new Date()) return true;
  return (d.status === 'pending' || d.status === 'assigned') &&
    Date.now() - new Date(d.createdAt).getTime() > FOUR_HOURS;
}

function cityFromAddress(addr: string): string {
  const parts = addr.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length >= 2 ? parts[1] : parts[0] ?? addr;
}

export default function DeliveryWidget() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const data = await deliveryService.getAll();
      setDeliveries(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const ch = supabase
      .channel('dashboard-deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, load)
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending   = deliveries.filter((d) => d.status === 'pending' || d.status === 'assigned');
  const enRoute   = deliveries.filter((d) => d.status === 'en_route');
  const delivered = deliveries.filter((d) => d.status === 'delivered' && d.deliveredAt?.startsWith(todayStr));
  const late      = deliveries.filter(isLate);

  // Last 5: en_route first, then pending, then delivered today
  const recent = [...enRoute, ...pending, ...delivered].slice(0, 5);

  const kpis = [
    { label: 'En attente', value: pending.length,   dot: 'bg-yellow-400', bg: 'bg-yellow-50 border-yellow-200',  text: 'text-yellow-800' },
    { label: 'En route',   value: enRoute.length,   dot: 'bg-blue-400',   bg: 'bg-blue-50 border-blue-200',      text: 'text-blue-800'   },
    { label: 'Livrées',    value: delivered.length, dot: 'bg-green-400',  bg: 'bg-green-50 border-green-200',    text: 'text-green-800'  },
    { label: 'En retard',  value: late.length,      dot: 'bg-red-400',    bg: 'bg-red-50 border-red-200',        text: 'text-red-800'    },
  ];

  return (
    <div className="rounded-xl border bg-white shadow-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Livraisons</p>
            <p className="text-sm font-semibold text-foreground">Du jour</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {late.length > 0 && (
            <span className="text-xs font-bold px-2 py-1 bg-red-100 text-red-700 border border-red-200 rounded-full">
              ⚠️ {late.length} en retard
            </span>
          )}
          <button
            onClick={load}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPI chips */}
        <div className="grid grid-cols-4 gap-2">
          {kpis.map((k) => (
            <div key={k.label} className={`rounded-xl border px-3 py-2.5 ${k.bg}`}>
              <p className={`text-xl font-black tabular-nums ${k.text}`}>{loading ? '—' : k.value}</p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${k.dot}`} />
                <p className="text-[10px] font-semibold text-gray-600 leading-none">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Recent deliveries list */}
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Aucune livraison active
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Dernières livraisons</p>
            {recent.map((d) => {
              const cfg = DELIVERY_STATUS_CONFIG[d.status];
              const late = isLate(d);
              const city = cityFromAddress(d.deliveryAddress);
              return (
                <Link
                  key={d.id}
                  href="/livraisons"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/60 transition-colors group"
                >
                  {/* Status dot */}
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cfg.dot} ${d.status === 'en_route' ? 'animate-pulse' : ''}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-bold text-foreground">
                        {d.shopifyOrderNumber ?? d.id.slice(0, 6)}
                      </span>
                      <span className="text-xs text-muted-foreground">—</span>
                      <span className="text-xs font-semibold text-foreground truncate">{d.clientName}</span>
                      {late && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-md border border-red-200">RETARD</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">📍 {city}</span>
                      {d.driverName ? (
                        <span className="text-[10px] text-muted-foreground">· {d.driverName}</span>
                      ) : (
                        <span className="text-[10px] font-semibold text-red-500">· ⚠️ Non assigné</span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* CTA */}
        <Link
          href="/livraisons"
          className="flex items-center justify-center gap-1.5 w-full py-2.5 text-xs font-bold text-orange-600 border border-orange-200 bg-orange-50 rounded-xl hover:bg-orange-100 transition-colors"
        >
          Voir toutes les livraisons
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
