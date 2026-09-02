'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import type { SmartReorderGroup, SmartReorderItem } from '@/app/api/stock/smart-reorder/route';

interface RowState {
  included: boolean;
  qty: number;
}

interface Props {
  onClose: () => void;
}

export default function SmartReorderModal({ onClose }: Props) {
  const router = useRouter();
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [groups, setGroups] = useState<SmartReorderGroup[]>([]);
  const [period, setPeriod] = useState(90);
  const [rowStates, setRowStates] = useState<Map<string, RowState>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Array<{ orderId: string; orderNumber: string; supplierName: string; lineCount: number }> | null>(null);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const res = await fetch('/api/stock/smart-reorder');
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setGroups(data.groups ?? []);
      setPeriod(data.period ?? 90);
      const map = new Map<string, RowState>();
      for (const g of data.groups ?? []) {
        for (const item of g.items as SmartReorderItem[]) {
          map.set(item.productId, { included: true, qty: item.suggestedQty });
        }
      }
      setRowStates(map);
      setLoadState('loaded');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setRow = (productId: string, patch: Partial<RowState>) => {
    setRowStates(prev => {
      const next = new Map(prev);
      const cur = next.get(productId) ?? { included: true, qty: 1 };
      next.set(productId, { ...cur, ...patch });
      return next;
    });
  };

  const toggleCollapse = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleGroupIncluded = (group: SmartReorderGroup, value: boolean) => {
    setRowStates(prev => {
      const next = new Map(prev);
      for (const item of group.items) {
        const cur = next.get(item.productId) ?? { included: true, qty: item.suggestedQty };
        next.set(item.productId, { ...cur, included: value });
      }
      return next;
    });
  };

  const includedCount = Array.from(rowStates.values()).filter(r => r.included).length;

  const activeGroups = groups.map(g => ({
    ...g,
    activeItems: g.items.filter(it => rowStates.get(it.productId)?.included),
  })).filter(g => g.activeItems.length > 0);

  const handleCreate = async () => {
    setSubmitting(true);
    const orders = activeGroups.map(g => ({
      supplierId: g.supplierId,
      supplierName: g.supplierName,
      items: g.activeItems.map(it => ({
        productId: it.productId,
        productName: it.productName,
        productRef: it.productRef,
        productImageUrl: it.productImageUrl,
        qty: rowStates.get(it.productId)?.qty ?? it.suggestedQty,
        unitPrice: it.unitPrice,
        salePrice: it.salePrice,
      })),
    }));
    try {
      const res = await fetch('/api/stock/smart-reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      });
      const data = await res.json();
      setCreated(data.created ?? []);
    } catch {
      setSubmitting(false);
    }
  };

  const totalEstimate = activeGroups.reduce((sum, g) => {
    return sum + g.activeItems.reduce((s, it) => s + (rowStates.get(it.productId)?.qty ?? it.suggestedQty) * it.unitPrice, 0);
  }, 0);

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
              <span className="text-lg">🔄</span>
            </div>
            <div>
              <h2 className="font-700 text-foreground">Réassort du mois</h2>
              <p className="text-xs text-muted-foreground">Basé sur {period} jours de ventes · Produits à rotation rapide</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <Icon name="XMarkIcon" size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* Loading */}
          {loadState === 'loading' && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Analyse des ventes en cours...</p>
            </div>
          )}

          {/* Error */}
          {loadState === 'error' && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Icon name="ExclamationCircleIcon" size={32} className="text-red-400" />
              <p className="text-sm text-red-600">Impossible de charger les suggestions</p>
              <button onClick={load} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-500">
                Réessayer
              </button>
            </div>
          )}

          {/* Success */}
          {created && (
            <div className="p-6 space-y-4">
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Icon name="CheckCircleIcon" size={32} className="text-emerald-600" />
                </div>
                <h3 className="font-700 text-foreground text-lg">{created.length} commande{created.length > 1 ? 's' : ''} créée{created.length > 1 ? 's' : ''} !</h3>
                <p className="text-sm text-muted-foreground text-center">Les commandes sont en statut brouillon dans l'espace fournisseur</p>
              </div>
              <div className="space-y-2">
                {created.map(c => (
                  <div key={c.orderId} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div>
                      <p className="text-sm font-600">{c.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{c.supplierName} · {c.lineCount} produit{c.lineCount > 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={() => { onClose(); router.push(`/commandes-fournisseurs?orderId=${c.orderId}`); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-600 hover:bg-primary/90 transition-colors"
                    >
                      <Icon name="ArrowTopRightOnSquareIcon" size={12} />
                      Voir
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { onClose(); router.push('/commandes-fournisseurs'); }}
                className="w-full py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors"
              >
                Voir toutes les commandes fournisseurs
              </button>
            </div>
          )}

          {/* Loaded: groups */}
          {loadState === 'loaded' && !created && (
            <>
              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <Icon name="CheckCircleIcon" size={32} className="text-emerald-400" />
                  <p className="text-sm text-muted-foreground">Aucun réassort nécessaire — tous les produits sont bien couverts</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {groups.map(group => {
                    const key = group.supplierId ?? group.supplierName;
                    const isCollapsed = collapsed.has(key);
                    const groupIncluded = group.items.every(it => rowStates.get(it.productId)?.included ?? true);
                    const groupPartial = !groupIncluded && group.items.some(it => rowStates.get(it.productId)?.included ?? true);

                    return (
                      <div key={key} className="border border-border rounded-2xl overflow-hidden">
                        {/* Group header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                          <input
                            type="checkbox"
                            checked={groupIncluded}
                            ref={el => { if (el) el.indeterminate = groupPartial; }}
                            onChange={e => toggleGroupIncluded(group, e.target.checked)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer"
                          />
                          <button
                            onClick={() => toggleCollapse(key)}
                            className="flex items-center gap-2 flex-1 text-left"
                          >
                            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                              <Icon name="BuildingStorefrontIcon" size={14} className="text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-700 text-foreground truncate">{group.supplierName}</p>
                              <p className="text-xs text-muted-foreground">{group.items.length} produit{group.items.length > 1 ? 's' : ''}</p>
                            </div>
                            <div className="text-right shrink-0 mr-2">
                              <p className="text-xs text-muted-foreground">Coût estimé</p>
                              <p className="text-sm font-700 text-primary">
                                {fmt(group.items.reduce((s, it) => s + (rowStates.get(it.productId)?.qty ?? it.suggestedQty) * it.unitPrice, 0))}
                              </p>
                            </div>
                            <Icon name={isCollapsed ? 'ChevronDownIcon' : 'ChevronUpIcon'} size={16} className="text-muted-foreground shrink-0" />
                          </button>
                        </div>

                        {/* Product rows */}
                        {!isCollapsed && (
                          <div className="divide-y divide-border">
                            {group.items.map(item => {
                              const row = rowStates.get(item.productId) ?? { included: true, qty: item.suggestedQty };
                              return (
                                <div key={item.productId} className={`flex items-center gap-3 px-4 py-3 transition-opacity ${row.included ? '' : 'opacity-40'}`}>
                                  <input
                                    type="checkbox"
                                    checked={row.included}
                                    onChange={e => setRow(item.productId, { included: e.target.checked })}
                                    className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                                  />
                                  {/* Photo */}
                                  <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden shrink-0">
                                    {item.productImageUrl ? (
                                      <AppImage src={item.productImageUrl} alt={item.productName} width={40} height={40} className="object-cover w-full h-full" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Icon name="PhotoIcon" size={16} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                  </div>
                                  {/* Name + stats */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-600 text-foreground truncate">{item.productName}</p>
                                    <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                      {item.productRef && (
                                        <span className="text-[10px] text-muted-foreground font-500">{item.productRef}</span>
                                      )}
                                      <span className="text-[10px] text-muted-foreground">
                                        Stock: <strong>{item.currentStock}</strong>
                                      </span>
                                      <span className="text-[10px] text-amber-700 font-600">
                                        {item.soldQty90} vendus/{period}j
                                      </span>
                                      <span className="text-[10px] text-blue-600 font-600">
                                        {item.velocityPerMonth}/mois
                                      </span>
                                      <span className={`text-[10px] font-600 ${item.coverageMonths < 1 ? 'text-red-600' : 'text-orange-600'}`}>
                                        {item.coverageMonths}m couv.
                                      </span>
                                    </div>
                                  </div>
                                  {/* Qty input */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      onClick={() => setRow(item.productId, { qty: Math.max(1, row.qty - 1) })}
                                      disabled={!row.included}
                                      className="w-6 h-6 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center disabled:opacity-40"
                                    >
                                      <Icon name="MinusIcon" size={10} className="text-foreground" />
                                    </button>
                                    <input
                                      type="number"
                                      min={1}
                                      value={row.qty}
                                      disabled={!row.included}
                                      onChange={e => setRow(item.productId, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                                      className="w-14 text-center text-sm font-600 border border-border rounded-lg py-1 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-40"
                                    />
                                    <button
                                      onClick={() => setRow(item.productId, { qty: row.qty + 1 })}
                                      disabled={!row.included}
                                      className="w-6 h-6 rounded-lg bg-muted hover:bg-muted/80 flex items-center justify-center disabled:opacity-40"
                                    >
                                      <Icon name="PlusIcon" size={10} className="text-foreground" />
                                    </button>
                                  </div>
                                  {/* Unit price */}
                                  <div className="text-right shrink-0 w-20">
                                    <p className="text-xs font-600 text-primary">{fmt(row.qty * item.unitPrice)}</p>
                                    <p className="text-[10px] text-muted-foreground">{item.unitPrice > 0 ? `${item.unitPrice.toFixed(2)}€/u` : 'Prix N/A'}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {loadState === 'loaded' && !created && groups.length > 0 && (
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-4 bg-white">
            <div>
              <p className="text-xs text-muted-foreground">{includedCount} produit{includedCount !== 1 ? 's' : ''} sélectionné{includedCount !== 1 ? 's' : ''} · {activeGroups.length} fournisseur{activeGroups.length !== 1 ? 's' : ''}</p>
              <p className="text-sm font-700 text-primary">Total estimé : {fmt(totalEstimate)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || includedCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Création...
                  </>
                ) : (
                  <>
                    <Icon name="ShoppingCartIcon" size={15} />
                    Créer {activeGroups.length} commande{activeGroups.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
