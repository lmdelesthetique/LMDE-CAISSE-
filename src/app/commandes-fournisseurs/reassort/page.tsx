'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { supplierOrderService, FoRestockSuggestion, FoRestockStatus, FoSuspensionReason } from '@/lib/services/supplierOrderService';

const SUSPENSION_REASONS: { value: FoSuspensionReason; label: string }[] = [
  { value: 'bad_customer_feedback', label: 'Mauvais retour client' },
  { value: 'not_profitable', label: 'Pas assez rentable' },
  { value: 'slow_seller', label: 'Trop lent à vendre' },
  { value: 'unreliable_supplier', label: 'Fournisseur non fiable' },
  { value: 'range_change', label: 'Changement de gamme' },
  { value: 'replaced_by_other', label: 'Remplacé par un autre produit' },
  { value: 'permanent_stop', label: 'Arrêt définitif' },
  { value: 'other', label: 'Autre raison' },
];

function StockBadge({ current, min }: { current: number; min: number }) {
  if (current === 0) return <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-red-100 text-red-700">Rupture</span>;
  if (current < min) return <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-amber-100 text-amber-700">Stock faible</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-emerald-100 text-emerald-700">En stock</span>;
}

export default function ReassortPage() {
  const [suggestions, setSuggestions] = useState<FoRestockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'suggested' | 'suspended'>('all');
  const [suspendModal, setSuspendModal] = useState<FoRestockSuggestion | null>(null);
  const [suspendReason, setSuspendReason] = useState<FoSuspensionReason>('not_profitable');
  const [suspendNote, setSuspendNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supplierOrderService.getRestockSuggestions(filter === 'all' ? undefined : filter as FoRestockStatus);
      setSuggestions(data);
      const q: Record<string, number> = {};
      data.forEach((s) => { q[s.id] = s.suggestedQty; });
      setQuantities(q);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (id: string, status: FoRestockStatus) => {
    await supplierOrderService.updateRestockStatus(id, status);
    load();
  };

  const handleSuspend = async () => {
    if (!suspendModal) return;
    await supplierOrderService.updateRestockStatus(suspendModal.id, 'suspended', suspendReason, suspendNote);
    setSuspendModal(null);
    setSuspendNote('');
    load();
  };

  const handleReactivate = async (id: string) => {
    await supplierOrderService.updateRestockStatus(id, 'suggested');
    load();
  };

  const active = suggestions.filter((s) => s.restockStatus !== 'suspended');
  const suspended = suggestions.filter((s) => s.restockStatus === 'suspended');
  const displayed = filter === 'suspended' ? suspended : filter === 'suggested' ? active : suggestions;

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/commandes-fournisseurs" className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="ArrowLeftIcon" size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-700 text-foreground">Réassort conseillé</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{active.length} produit{active.length !== 1 ? 's' : ''} à recommander · {suspended.length} suspendu{suspended.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <Link
            href="/commandes-fournisseurs/nouvelle"
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors"
          >
            <Icon name="PlusIcon" size={15} />
            Créer une commande
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'En rupture', value: suggestions.filter((s) => s.currentStock === 0 && s.restockStatus !== 'suspended').length, color: 'text-red-600 bg-red-50', icon: 'ExclamationCircleIcon' },
            { label: 'Stock faible', value: suggestions.filter((s) => s.currentStock > 0 && s.currentStock < s.minStock && s.restockStatus !== 'suspended').length, color: 'text-amber-600 bg-amber-50', icon: 'ExclamationTriangleIcon' },
            { label: 'Très vendus', value: suggestions.filter((s) => s.recentSales >= 30 && s.restockStatus !== 'suspended').length, color: 'text-emerald-600 bg-emerald-50', icon: 'FireIcon' },
            { label: 'Suspendus', value: suspended.length, color: 'text-gray-600 bg-gray-100', icon: 'PauseCircleIcon' },
          ].map((k) => (
            <div key={k.label} className="bg-white border border-border rounded-xl p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${k.color}`}>
                  <Icon name={k.icon as any} size={18} />
                </div>
                <div>
                  <p className="text-xl font-700 text-foreground">{k.value}</p>
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 border-b border-border">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'suggested', label: 'À recommander' },
            { id: 'suspended', label: 'Suspendus' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setFilter(t.id as any)}
              className={`px-4 py-2 text-sm font-500 border-b-2 transition-colors ${filter === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-12 text-center">
            <Icon name="CheckCircleIcon" size={40} className="text-emerald-500 mx-auto mb-3" />
            <p className="font-500 text-foreground">Aucun produit à recommander</p>
            <p className="text-sm text-muted-foreground mt-1">Tous vos stocks sont à niveau</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayed.map((s) => (
              <div key={s.id} className={`bg-white border rounded-xl p-4 shadow-card ${s.restockStatus === 'suspended' ? 'opacity-60 border-border' : 'border-border'}`}>
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-600 text-foreground">{s.productName}</p>
                      <span className="text-xs text-muted-foreground">{s.productRef}</span>
                      <StockBadge current={s.currentStock} min={s.minStock} />
                      {s.restockStatus === 'suspended' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-red-50 text-red-700">Suspendu</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span>Stock: <strong className="text-foreground">{s.currentStock}</strong></span>
                      <span>Min: <strong className="text-foreground">{s.minStock}</strong></span>
                      <span>Ventes récentes: <strong className="text-foreground">{s.recentSales}</strong></span>
                      <span>Dernier achat: <strong className="text-foreground">{s.lastPurchasePrice.toFixed(2)} €</strong></span>
                      <span>Coût réel: <strong className="text-foreground">{s.lastRealCost.toFixed(2)} €</strong></span>
                      {s.supplierName && <span>Fournisseur: <strong className="text-foreground">{s.supplierName}</strong></span>}
                    </div>
                    {s.restockStatus === 'suspended' && s.suspensionReason && (
                      <p className="text-xs text-red-600 mt-1">
                        Raison: {SUSPENSION_REASONS.find((r) => r.value === s.suspensionReason)?.label}
                        {s.suspensionNote ? ` — ${s.suspensionNote}` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {s.restockStatus !== 'suspended' ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <label className="text-xs text-muted-foreground">Qté:</label>
                          <input
                            type="number" min="1"
                            value={quantities[s.id] || s.suggestedQty}
                            onChange={(e) => setQuantities((prev) => ({ ...prev, [s.id]: parseInt(e.target.value) || 1 }))}
                            className="w-16 px-2 py-1 border border-border rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        </div>
                        <button
                          onClick={() => handleAction(s.id, 'ordered')}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-500 hover:bg-primary/90 transition-colors"
                        >
                          <Icon name="ShoppingCartIcon" size={13} />
                          Commander
                        </button>
                        <button
                          onClick={() => handleAction(s.id, 'ignored')}
                          className="px-3 py-1.5 border border-border rounded-lg text-xs font-500 hover:bg-muted transition-colors text-muted-foreground"
                        >
                          Ignorer
                        </button>
                        <button
                          onClick={() => setSuspendModal(s)}
                          className="px-3 py-1.5 border border-red-200 rounded-lg text-xs font-500 hover:bg-red-50 text-red-600 transition-colors"
                        >
                          Suspendre
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleReactivate(s.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-emerald-200 rounded-lg text-xs font-500 hover:bg-emerald-50 text-emerald-700 transition-colors"
                      >
                        <Icon name="ArrowPathIcon" size={13} />
                        Réactiver
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-700 text-foreground text-lg mb-1">Suspendre le réassort</h3>
            <p className="text-sm text-muted-foreground mb-4">{suspendModal.productName}</p>
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">Raison de suspension</label>
              <select
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value as FoSuspensionReason)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                {SUSPENSION_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="mb-5">
              <label className="block text-sm text-muted-foreground mb-2">Note (optionnel)</label>
              <textarea
                value={suspendNote}
                onChange={(e) => setSuspendNote(e.target.value)}
                rows={2}
                placeholder="Précisions..."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setSuspendModal(null)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors">Annuler</button>
              <button onClick={handleSuspend} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-500 hover:bg-red-700 transition-colors">Suspendre</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
