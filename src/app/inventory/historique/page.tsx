'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface InventoryMovement {
  id: string;
  productId: string;
  productName: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityChange: number;
  performedBy: string;
  createdAt: string;
}

interface InventorySession {
  date: string;
  dateLabel: string;
  movements: InventoryMovement[];
  updatedCount: number;
  surplusCount: number;
  manquantCount: number;
}

function groupByDate(movements: InventoryMovement[]): InventorySession[] {
  const map = new Map<string, InventoryMovement[]>();
  for (const m of movements) {
    const date = m.createdAt.slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(m);
  }

  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, mvts]) => {
      const d = new Date(date + 'T12:00:00');
      return {
        date,
        dateLabel: d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }),
        movements: mvts,
        updatedCount: mvts.length,
        surplusCount: mvts.filter((m) => m.quantityChange > 0).length,
        manquantCount: mvts.filter((m) => m.quantityChange < 0).length,
      };
    });
}

function exportToCSV(sessions: InventorySession[]) {
  const rows: string[][] = [
    ['Date', 'Produit', 'Stock avant', 'Stock après', 'Écart', 'Effectué par'],
  ];
  for (const session of sessions) {
    for (const m of session.movements) {
      rows.push([
        new Date(m.createdAt).toLocaleString('fr-FR'),
        m.productName,
        String(m.quantityBefore),
        String(m.quantityAfter),
        m.quantityChange > 0 ? `+${m.quantityChange}` : String(m.quantityChange),
        m.performedBy,
      ]);
    }
  }
  const csv = rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inventaire_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function InventaireHistoriquePage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<InventorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_movements_log')
      .select('id, product_id, product_name, quantity_before, quantity_after, quantity_change, performed_by, created_at')
      .eq('performed_by', 'Inventaire')
      .eq('movement_type', 'adjustment')
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('inventaire historique', error);
      setLoading(false);
      return;
    }

    const movements: InventoryMovement[] = (data || []).map((r) => ({
      id: r.id as string,
      productId: r.product_id as string,
      productName: r.product_name as string,
      quantityBefore: Number(r.quantity_before) || 0,
      quantityAfter: Number(r.quantity_after) || 0,
      quantityChange: Number(r.quantity_change) || 0,
      performedBy: (r.performed_by as string) || '',
      createdAt: r.created_at as string,
    }));

    setSessions(groupByDate(movements));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleSession = (date: string) => {
    setExpandedSessions((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date); else next.add(date);
      return next;
    });
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1 text-sm text-muted-foreground">
              <Link href="/inventory" className="hover:text-foreground transition-colors">Inventaire</Link>
              <Icon name="ChevronRightIcon" size={12} />
              <span className="font-600 text-foreground">Historique</span>
            </div>
            <h1 className="text-2xl font-700 text-foreground">Historique des inventaires</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tous les inventaires réalisés par scan, avec détail des écarts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={14} />
              Actualiser
            </button>
            {sessions.length > 0 && (
              <button
                onClick={() => exportToCSV(sessions)}
                className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <Icon name="ArrowDownTrayIcon" size={14} />
                Exporter CSV
              </button>
            )}
            <Link
              href="/inventory/scan"
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity"
            >
              <Icon name="QrCodeIcon" size={14} />
              Nouvel inventaire
            </Link>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement de l'historique…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-border">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Icon name="ClipboardDocumentListIcon" size={28} className="text-muted-foreground/50" />
            </div>
            <p className="text-sm font-600 text-foreground mb-1">Aucun inventaire enregistré</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Les inventaires effectués via la page de scan apparaîtront ici
            </p>
            <Link
              href="/inventory/scan"
              className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity"
            >
              <Icon name="QrCodeIcon" size={14} />
              Démarrer un inventaire
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                {
                  label: 'Sessions totales',
                  value: sessions.length,
                  icon: 'ClipboardDocumentListIcon',
                  color: 'text-foreground',
                },
                {
                  label: 'Produits vérifiés',
                  value: sessions.reduce((s, sess) => s + sess.updatedCount, 0),
                  icon: 'QrCodeIcon',
                  color: 'text-foreground',
                },
                {
                  label: 'Surplus détectés',
                  value: sessions.reduce((s, sess) => s + sess.surplusCount, 0),
                  icon: 'ArrowTrendingUpIcon',
                  color: 'text-amber-600',
                },
                {
                  label: 'Manquants détectés',
                  value: sessions.reduce((s, sess) => s + sess.manquantCount, 0),
                  icon: 'ArrowTrendingDownIcon',
                  color: 'text-red-600',
                },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white rounded-xl border border-border p-4">
                  <p className={`text-2xl font-700 ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                </div>
              ))}
            </div>

            {/* Sessions list */}
            {sessions.map((session) => {
              const isExpanded = expandedSessions.has(session.date);
              return (
                <div key={session.date} className="bg-white rounded-xl border border-border overflow-hidden">
                  <button
                    onClick={() => toggleSession(session.date)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-muted/30 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon name="ClipboardDocumentListIcon" size={18} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground capitalize">{session.dateLabel}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-xs text-muted-foreground">{session.updatedCount} produit(s) vérifié(s)</span>
                        {session.surplusCount > 0 && (
                          <span className="text-xs text-amber-600 font-500">+{session.surplusCount} surplus</span>
                        )}
                        {session.manquantCount > 0 && (
                          <span className="text-xs text-red-600 font-500">{session.manquantCount} manquant(s)</span>
                        )}
                        {session.surplusCount === 0 && session.manquantCount === 0 && (
                          <span className="text-xs text-emerald-600 font-500">✓ Aucun écart</span>
                        )}
                      </div>
                    </div>
                    <Icon
                      name={isExpanded ? 'ChevronDownIcon' : 'ChevronRightIcon'}
                      size={16}
                      className="text-muted-foreground shrink-0"
                    />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-border">
                      {/* Table header */}
                      <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px] gap-2 px-5 py-2 bg-muted/40 text-[10px] font-600 uppercase tracking-wide text-muted-foreground">
                        <span>Produit</span>
                        <span className="text-center">Avant</span>
                        <span className="text-center">Après</span>
                        <span className="text-center">Écart</span>
                      </div>

                      <div className="divide-y divide-border">
                        {session.movements.map((m) => {
                          const diff = m.quantityChange;
                          const isMatch = diff === 0;
                          const isPositive = diff > 0;

                          return (
                            <div
                              key={m.id}
                              className="flex md:grid md:grid-cols-[1fr_80px_80px_80px] items-center gap-2 px-5 py-3 hover:bg-muted/10 transition-colors"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-500 text-foreground truncate">{m.productName}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </p>
                              </div>
                              <div className="text-center hidden md:block">
                                <span className="text-sm text-muted-foreground">{m.quantityBefore}</span>
                              </div>
                              <div className="text-center hidden md:block">
                                <span className="text-sm font-600 text-foreground">{m.quantityAfter}</span>
                              </div>
                              <div className="text-center flex justify-center md:block">
                                {isMatch ? (
                                  <span className="inline-flex items-center justify-center w-6 h-6 bg-emerald-100 rounded-full">
                                    <Icon name="CheckIcon" size={12} className="text-emerald-600" />
                                  </span>
                                ) : (
                                  <span className={`text-xs font-700 px-2 py-0.5 rounded-full ${
                                    isPositive ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                                  }`}>
                                    {diff > 0 ? `+${diff}` : diff}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
