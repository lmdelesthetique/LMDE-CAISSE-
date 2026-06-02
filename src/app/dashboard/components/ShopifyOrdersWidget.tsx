'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { deliveryService } from '@/lib/services/deliveryService';
import type { ShopifyOrderSummary } from '@/lib/services/shopifyService';

const LAST_SEEN_KEY = 'beautypos_shopify_last_seen_order_id';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function financialBadge(status: string): { label: string; cls: string } {
  switch (status) {
    case 'paid':      return { label: 'Payée ✅',     cls: 'bg-green-100 text-green-800 border-green-200' };
    case 'pending':   return { label: 'En attente ⏳', cls: 'bg-yellow-100 text-yellow-800 border-yellow-200' };
    case 'refunded':  return { label: 'Remboursée ↩', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
    case 'voided':    return { label: 'Annulée ❌',    cls: 'bg-red-100 text-red-800 border-red-200' };
    case 'partially_refunded': return { label: 'Remb. partiel', cls: 'bg-orange-100 text-orange-800 border-orange-200' };
    default:          return { label: status,          cls: 'bg-gray-100 text-gray-600 border-gray-200' };
  }
}

function fmtEur(v: string | number): string {
  return parseFloat(String(v)).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

interface DetailModalProps {
  order: ShopifyOrderSummary;
  onClose: () => void;
}

function OrderDetailModal({ order, onClose }: DetailModalProps) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createError, setCreateError] = useState('');
  const badge = financialBadge(order.financial_status);

  const shipping = (order.shipping_lines ?? []).reduce(
    (sum, sl) => sum + parseFloat(sl.price || '0'), 0
  );

  const clientPhone = order.phone || order.shipping_address?.phone || order.billing_address?.phone || null;
  const clientName  = order.customer
    ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
    : order.shipping_address?.name ?? '';

  const handleCreateDelivery = async () => {
    if (!order.shipping_address) return;
    setCreating(true);
    setCreateError('');
    const addr = order.shipping_address;
    const addressParts = [addr.address1, addr.address2, addr.city, addr.zip, addr.country].filter(Boolean);
    try {
      await deliveryService.create({
        shopifyOrderId: String(order.id),
        shopifyOrderNumber: order.name,
        clientName,
        clientPhone: clientPhone ?? undefined,
        deliveryAddress: addressParts.join(', '),
        deliveryNotes: order.note ?? undefined,
        products: order.line_items.map((li) => ({ name: li.title, qty: li.quantity, sku: li.sku ?? undefined, price: parseFloat(li.price) })),
        totalAmount: parseFloat(order.total_price),
      });
      setCreated(true);
      setTimeout(() => { onClose(); router.push('/livraisons'); }, 1200);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err ?? 'Erreur inconnue');
      console.error('[ShopifyOrdersWidget] create delivery error:', msg);
      setCreateError(`Erreur : ${msg}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full md:max-w-2xl bg-white rounded-t-3xl md:rounded-2xl shadow-2xl max-h-[90dvh] flex flex-col overflow-hidden">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-black text-foreground">Commande {order.name}</h2>
              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(order.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-muted/80">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Client */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Client</p>
            <div className="bg-muted/40 rounded-xl p-4 space-y-1.5">
              <p className="font-bold text-foreground">{clientName || '—'}</p>
              {order.customer?.email && <p className="text-sm text-muted-foreground">✉️ {order.customer.email}</p>}
              {clientPhone && <p className="text-sm text-muted-foreground">📞 {clientPhone}</p>}
              {order.shipping_address && (
                <p className="text-sm text-muted-foreground">
                  📍 {[order.shipping_address.address1, order.shipping_address.city, order.shipping_address.zip, order.shipping_address.country].filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          </section>

          {/* Products */}
          <section>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Produits</p>
            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-bold text-muted-foreground">Produit</th>
                    <th className="text-center px-3 py-2 text-xs font-bold text-muted-foreground">Qté</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-muted-foreground">P.U.</th>
                    <th className="text-right px-4 py-2 text-xs font-bold text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {order.line_items.map((li) => (
                    <tr key={li.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-foreground leading-snug">{li.title}</p>
                        {li.sku && <p className="text-[11px] text-muted-foreground font-mono">{li.sku}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-center font-bold text-foreground">×{li.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtEur(li.price)}</td>
                      <td className="px-4 py-2.5 text-right font-bold text-foreground">
                        {fmtEur(parseFloat(li.price) * li.quantity)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Totals */}
          <section>
            <div className="bg-muted/40 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sous-total</span>
                <span className="font-medium text-foreground">{fmtEur(order.subtotal_price)}</span>
              </div>
              {shipping > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Livraison</span>
                  <span className="font-medium text-foreground">{fmtEur(shipping)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black border-t border-border pt-2">
                <span>Total TTC</span>
                <span>{fmtEur(order.total_price)}</span>
              </div>
            </div>
          </section>

          {/* Notes */}
          {order.note && (
            <section>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Notes</p>
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                {order.note}
              </div>
            </section>
          )}

          {/* Delivery action */}
          {order.shipping_address && (
            <section>
              {created ? (
                <div className="w-full py-3 bg-green-100 text-green-800 font-bold text-sm rounded-xl text-center">
                  ✅ Livraison créée — redirection…
                </div>
              ) : (
                <>
                  <button
                    onClick={handleCreateDelivery}
                    disabled={creating}
                    className="w-full py-3 bg-orange-500 text-white font-bold text-sm rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    {creating ? 'Création…' : '🚚 Créer une livraison'}
                  </button>
                  {createError && <p className="text-xs text-red-600 text-center mt-1">{createError}</p>}
                </>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main widget ───────────────────────────────────────────────────────────────

export default function ShopifyOrdersWidget() {
  const [orders, setOrders] = useState<ShopifyOrderSummary[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasNew, setHasNew] = useState(false);
  const [selected, setSelected] = useState<ShopifyOrderSummary | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/shopify/orders');
      const data: { connected: boolean; orders: ShopifyOrderSummary[] } = await res.json();
      setConnected(data.connected);
      setOrders(data.orders ?? []);

      if (data.orders?.length) {
        const latestId = String(data.orders[0].id);
        const lastSeen = typeof window !== 'undefined' ? localStorage.getItem(LAST_SEEN_KEY) : null;
        if (lastSeen && lastSeen !== latestId) setHasNew(true);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Mark as seen when widget is interacted with
  const markSeen = useCallback(() => {
    if (orders.length) {
      localStorage.setItem(LAST_SEEN_KEY, String(orders[0].id));
      setHasNew(false);
    }
  }, [orders]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  // Compute today's stats
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = orders.filter((o) => o.created_at.startsWith(todayStr));
  const todayRevenue = todayOrders.reduce((s, o) => s + parseFloat(o.total_price), 0);

  if (!connected && !loading) return null;

  return (
    <>
      <div className="rounded-xl border bg-white shadow-card flex flex-col overflow-hidden" onClick={markSeen}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 0 1-8 0"/>
              </svg>
              {hasNew && <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white" />}
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-0.5">Shopify</p>
              {loading ? (
                <div className="h-4 w-32 bg-muted animate-pulse rounded" />
              ) : (
                <p className="text-sm font-semibold text-foreground">
                  Aujourd'hui : {todayOrders.length} commande{todayOrders.length !== 1 ? 's' : ''}
                  {todayRevenue > 0 && <span className="text-emerald-600"> · {todayRevenue.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</span>}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); load(); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30"
          >
            ↻
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Aucune commande récente</div>
          ) : (
            <div className="divide-y divide-border">
              {orders.map((order) => {
                const badge = financialBadge(order.financial_status);
                const name = order.customer
                  ? `${order.customer.first_name} ${order.customer.last_name}`.trim()
                  : order.shipping_address?.name ?? '—';
                const productsSummary = order.line_items
                  .slice(0, 2)
                  .map((li) => `${li.title} ×${li.quantity}`)
                  .join(', ') + (order.line_items.length > 2 ? `…` : '');

                return (
                  <button
                    key={order.id}
                    onClick={() => setSelected(order)}
                    className="w-full text-left px-5 py-3.5 hover:bg-muted/40 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-foreground">{order.name}</span>
                          <span className="text-xs text-muted-foreground">— {name}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
                          <span className="text-[11px] text-muted-foreground">{order.line_items.length} produit{order.line_items.length !== 1 ? 's' : ''}</span>
                          <span className="text-[11px] text-muted-foreground">{timeAgo(order.created_at)}</span>
                        </div>
                        {productsSummary && (
                          <p className="text-[11px] text-muted-foreground mt-1 truncate">{productsSummary}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-foreground tabular-nums">{fmtEur(order.total_price)}</p>
                        <p className="text-[10px] text-blue-500 font-semibold mt-1 group-hover:underline">👁 Voir →</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border">
          <a
            href="/livraisons"
            className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
          >
            Voir toutes les commandes
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </a>
        </div>
      </div>

      {selected && <OrderDetailModal order={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
