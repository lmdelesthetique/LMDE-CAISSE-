'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface DevisPending {
  id: string;
  numero: string;
  statut: 'client_valide' | 'client_modifie';
  date_reassort: string;
  total_ttc: number | null;
  client_pays: number | null;
  updated_at: string;
  client: { id: string; first_name: string | null; last_name: string | null; phone: string | null; whatsapp: string | null } | null;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function fmtEur(v: number | null | undefined): string {
  if (!v) return '—';
  return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function clientName(d: DevisPending): string {
  const c = d.client;
  if (!c) return '—';
  const f = c.first_name?.trim() ?? '';
  const l = c.last_name?.trim() ?? '';
  if (f && !/^\d+$/.test(f)) return `${f} ${l}`.trim();
  return l || '—';
}

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  client_valide:  { label: '✅ Validé',  cls: 'bg-green-100 text-green-800 border-green-200' },
  client_modifie: { label: '✏️ Modifié', cls: 'bg-amber-100 text-amber-800 border-amber-200' },
};

export default function DevisReassortWidget() {
  const router = useRouter();
  const [devis, setDevis] = useState<DevisPending[]>([]);
  const [loading, setLoading] = useState(true);
  const [treated, setTreated] = useState<Set<string>>(new Set());
  const [treating, setTreating] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadTreated = useCallback(async () => {
    try {
      const res = await fetch('/api/devis-pro/dashboard-pending/treated');
      if (!res.ok) return;
      const { ids } = await res.json();
      setTreated(new Set(ids as string[]));
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/devis-pro/dashboard-pending');
      if (!res.ok) return;
      const { devis: list } = await res.json();
      setDevis(list ?? []);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    loadTreated();
    timerRef.current = setInterval(() => { load(); loadTreated(); }, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load, loadTreated]);

  const handleTreat = useCallback(async (e: React.MouseEvent, devisId: string) => {
    e.stopPropagation();
    setTreating(devisId);
    setTreated(prev => new Set([...prev, devisId]));
    try {
      await fetch('/api/devis-pro/dashboard-pending/treated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ devisId }),
      });
    } catch { /* optimistic stays */ } finally {
      setTreating(null);
    }
  }, []);

  const pending = devis.filter(d => !treated.has(d.id));
  const treatedList = devis.filter(d => treated.has(d.id));
  const displayList = [...pending, ...treatedList];

  if (!loading && devis.length === 0) return null;

  return (
    <div className="rounded-xl border bg-white shadow-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="relative w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            {pending.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[9px] font-black text-white">
                {pending.length}
              </span>
            )}
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Devis Réassort</p>
            {loading ? (
              <div className="h-4 w-40 bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-sm font-semibold text-foreground">
                {pending.length > 0
                  ? <span className="text-red-600 font-bold">{pending.length} en attente de traitement</span>
                  : <span className="text-emerald-600">Tout traité ✓</span>
                }
              </p>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); load(); loadTreated(); }}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
        >
          ↻
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-3">
            {[1, 2].map(i => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : displayList.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Aucun devis en attente</div>
        ) : (
          <div className="divide-y divide-border">
            {displayList.map(d => {
              const isTreated = treated.has(d.id);
              const isTreating = treating === d.id;
              const badge = STATUT_BADGE[d.statut] ?? { label: d.statut, cls: 'bg-gray-100 text-gray-700 border-gray-200' };
              const montant = fmtEur(d.client_pays ?? d.total_ttc);
              const name = clientName(d);

              return (
                <div
                  key={d.id}
                  className={`relative flex items-center gap-2 px-4 py-3.5 transition-colors ${
                    isTreated
                      ? 'bg-emerald-50 border-l-4 border-l-emerald-400'
                      : 'hover:bg-muted/40'
                  }`}
                >
                  {/* Clickable area → open devis */}
                  <button
                    onClick={() => router.push('/devis-pro')}
                    className="flex-1 text-left min-w-0 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-bold text-sm ${isTreated ? 'text-emerald-700' : 'text-foreground'}`}>
                            {isTreated && '✓ '}{d.numero ?? `Devis #${d.id.slice(0, 6)}`}
                          </span>
                          <span className="text-xs text-muted-foreground">— {name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(d.updated_at)}</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-black tabular-nums ${isTreated ? 'text-emerald-700' : 'text-foreground'}`}>
                          {montant}
                        </p>
                        <p className="text-[10px] text-violet-500 font-semibold mt-1 group-hover:underline">👁 Voir →</p>
                      </div>
                    </div>
                  </button>

                  {/* Traiter button */}
                  <button
                    onClick={(e) => isTreated ? undefined : handleTreat(e, d.id)}
                    disabled={isTreating || isTreated}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                      isTreated
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-emerald-500 hover:text-white hover:border-emerald-500'
                    }`}
                  >
                    {isTreating ? (
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    ) : isTreated ? '✓ Traité' : 'Traiter'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-border">
        <button
          onClick={() => router.push('/devis-pro')}
          className="flex items-center justify-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-700 transition-colors w-full"
        >
          Voir tous les devis Pro
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
