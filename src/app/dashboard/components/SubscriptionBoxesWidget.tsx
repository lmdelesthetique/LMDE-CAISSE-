'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BoxItem {
  id: string;
  quantity: number;
  unit_sell_price: number;
  color_variant: string | null;
  product: { id: string; name: string; image_url: string | null } | null;
}

interface BoxOrder {
  id: string;
  subscription_id: string;
  status: string;
  order_month: string;
  total_sell_price: number;
  benefit_amount: number;
  updated_at: string;
  subscription: {
    client: { id: string; first_name: string; last_name: string } | null;
    plan: { name: string; price: number } | null;
  } | null;
  items: BoxItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function monthLabel(ym: string): string {
  return new Date(ym + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function BoxDetailModal({ order, onClose, onTraiter }: { order: BoxOrder; onClose: () => void; onTraiter: () => void }) {
  const [treating, setTreating] = useState(false);
  const [done, setDone] = useState(order.status === 'preparing');
  const clientName = order.subscription?.client
    ? `${order.subscription.client.first_name} ${order.subscription.client.last_name}`
    : '—';

  const handleTraiter = async () => {
    setTreating(true);
    try {
      await fetch(`/api/subscriptions/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'preparing' }),
      });
      setDone(true);
      onTraiter();
    } catch { /* ignore */ } finally {
      setTreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-black text-foreground">Box de {clientName}</h2>
              {done ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
                  ✓ En préparation
                </span>
              ) : (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-pink-50 text-pink-700 border-pink-200">
                  💅 À traiter
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {order.subscription?.plan?.name ?? '—'} — {monthLabel(order.order_month)}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Client info */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Client</p>
            <div className="bg-muted/40 rounded-xl p-4 space-y-1.5 text-sm">
              <p className="font-bold text-foreground">{clientName}</p>
              <p className="text-muted-foreground">Formule {order.subscription?.plan?.name ?? '—'} — {order.subscription?.plan?.price ?? '—'} €/mois</p>
            </div>
          </section>

          {/* Products */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">
              Produits sélectionnés ({order.items.length})
            </p>
            {order.items.length === 0 ? (
              <div className="bg-muted/40 rounded-xl p-4 text-sm text-muted-foreground text-center">
                Aucun produit sélectionné
              </div>
            ) : (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-bold text-muted-foreground">Produit</th>
                      <th className="text-center px-3 py-2 text-xs font-bold text-muted-foreground">Qté</th>
                      <th className="text-right px-4 py-2 text-xs font-bold text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {order.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {item.product?.image_url ? (
                              <img src={item.product.image_url} alt={item.product.name} className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-rose-50 shrink-0 flex items-center justify-center text-base border border-border">💅</div>
                            )}
                            <div>
                              <p className="font-medium text-foreground leading-snug">{item.product?.name ?? '—'}</p>
                              {item.color_variant && (
                                <p className="text-[11px] text-muted-foreground">{item.color_variant}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center font-bold text-foreground">×{item.quantity}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-foreground">
                          {(item.unit_sell_price * item.quantity).toFixed(2)} €
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Total */}
          <section>
            <div className="bg-muted/40 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valeur produits</span>
                <span className="font-medium">{order.total_sell_price.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Forfait abonnement</span>
                <span className="font-medium">{order.subscription?.plan?.price?.toFixed(2) ?? '—'} €</span>
              </div>
              {order.benefit_amount > 0 && (
                <div className="flex justify-between text-sm font-bold text-emerald-600 border-t border-border pt-2">
                  <span>Bénéfice boutique</span>
                  <span>+{order.benefit_amount.toFixed(2)} €</span>
                </div>
              )}
            </div>
          </section>

          {/* Action */}
          <section>
            {done ? (
              <div className="w-full py-3 bg-emerald-100 text-emerald-800 font-bold text-sm rounded-xl text-center">
                ✅ Box marquée en préparation
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleTraiter}
                  disabled={treating}
                  className="flex-1 py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
                >
                  {treating ? 'En cours…' : '✅ Traiter cette box'}
                </button>
                <a
                  href="/abonnements"
                  className="px-4 py-3 border-2 border-border text-muted-foreground font-bold text-sm rounded-xl hover:bg-muted/40 transition-colors"
                >
                  Voir tout
                </a>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export default function SubscriptionBoxesWidget() {
  const [orders, setOrders] = useState<BoxOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BoxOrder | null>(null);
  const currentMonth = new Date().toISOString().slice(0, 7);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('subscription_orders')
      .select(`
        id, subscription_id, status, order_month, total_sell_price, benefit_amount, updated_at,
        subscription:client_subscriptions(
          client:clients(id, first_name, last_name),
          plan:subscription_plans(name, price)
        ),
        items:subscription_order_items(
          id, quantity, unit_sell_price, color_variant,
          product:products(id, name, image_url)
        )
      `)
      .in('status', ['confirmed', 'preparing'])
      .eq('order_month', currentMonth)
      .order('updated_at', { ascending: false })
      .limit(30);

    setOrders(
      (data ?? []).map((o: any) => ({
        ...o,
        subscription: Array.isArray(o.subscription) ? o.subscription[0] : o.subscription,
        items: o.items ?? [],
      }))
    );
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel('dashboard-subscription-boxes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscription_orders' }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const confirmedCount = orders.filter((o) => o.status === 'confirmed').length;

  const handleTraiter = useCallback(async (orderId: string) => {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status: 'preparing' } : o));
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, status: 'preparing' } : prev);
    await load();
  }, [selected, load]);

  return (
    <>
      <div className="rounded-xl border bg-white shadow-card flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
              <span className="text-base leading-none">💅</span>
              {confirmedCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-pink-600 text-white text-[9px] font-black rounded-full border-2 border-white flex items-center justify-center">
                  {confirmedCount > 9 ? '9+' : confirmedCount}
                </span>
              )}
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Abonnements</p>
              {loading ? (
                <div className="h-4 w-36 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-sm font-semibold text-foreground">
                  {confirmedCount > 0
                    ? <span className="text-pink-700">{confirmedCount} box à traiter</span>
                    : <span className="text-emerald-600">Toutes les boxes traitées ✓</span>
                  }
                  {orders.length > confirmedCount && (
                    <span className="text-muted-foreground"> · {orders.length - confirmedCount} en préparation</span>
                  )}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => load()}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
          >
            ↻
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <p className="text-2xl mb-2">🎉</p>
              Aucune box confirmée ce mois-ci
            </div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => {
                const isTreated = order.status === 'preparing';
                const clientName = order.subscription?.client
                  ? `${order.subscription.client.first_name} ${order.subscription.client.last_name}`
                  : '—';
                const productSummary = order.items
                  .slice(0, 2)
                  .map((i) => `${i.product?.name ?? '?'} ×${i.quantity}`)
                  .join(', ') + (order.items.length > 2 ? '…' : '');

                return (
                  <div
                    key={order.id}
                    className={`relative flex items-center gap-2 px-4 py-3.5 transition-colors ${
                      isTreated ? 'bg-emerald-50 border-l-4 border-l-emerald-400' : 'hover:bg-muted/40'
                    }`}
                  >
                    <button
                      onClick={() => setSelected(order)}
                      className="flex-1 text-left min-w-0 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-bold text-sm ${isTreated ? 'text-emerald-700' : 'text-foreground'}`}>
                              {isTreated && '✓ '}{clientName}
                            </span>
                            <span className="text-[10px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              {order.subscription?.plan?.name ?? '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">{order.items.length} produit{order.items.length !== 1 ? 's' : ''}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-[11px] text-muted-foreground">{timeAgo(order.updated_at)}</span>
                          </div>
                          {productSummary && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{productSummary}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={`text-sm font-black tabular-nums ${isTreated ? 'text-emerald-700' : 'text-foreground'}`}>
                            {order.total_sell_price.toFixed(2)} €
                          </p>
                          <p className="text-[10px] text-rose-500 font-semibold mt-1 group-hover:underline">👁 Voir →</p>
                        </div>
                      </div>
                    </button>

                    {/* Traiter button */}
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (isTreated) return;
                        setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, status: 'preparing' } : o));
                        await fetch(`/api/subscriptions/orders/${order.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: 'preparing' }),
                        });
                        load();
                      }}
                      disabled={isTreated}
                      className={`shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors ${
                        isTreated
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-300 cursor-default'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-pink-500 hover:text-white hover:border-pink-500'
                      }`}
                    >
                      {isTreated ? '✓ Traité' : 'Traiter'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <a
            href="/abonnements"
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors"
          >
            Voir tous les abonnements
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </div>

      {selected && (
        <BoxDetailModal
          order={selected}
          onClose={() => setSelected(null)}
          onTraiter={() => handleTraiter(selected.id)}
        />
      )}
    </>
  );
}
