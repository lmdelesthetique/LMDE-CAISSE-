'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubStatus = 'active' | 'inactive' | 'suspended' | 'expired';
type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'shipped' | 'auto' | 'en_livraison';

interface OrderItem {
  id: string;
  product_id: string | null;
  quantity: number;
  unit_sell_price: number;
  unit_buy_price: number;
  total_sell_price: number;
  product?: { id: string; name: string; image_url: string | null; ref?: string | null } | null;
}

interface SubscriptionRow {
  id: string;
  status: SubStatus;
  portal_phone: string | null;
  pin_code: string | null;
  next_billing_date: string | null;
  client: { id: string; first_name: string; last_name: string } | null;
  plan: { id: string; name: string; price: number; quota_amount: number; shipping_free: boolean; shipping_cost: number } | null;
  currentOrder?: {
    id: string;
    status: OrderStatus;
    total_products_cost: number;
    total_sell_price: number;
    benefit_amount: number;
    shipping_cost: number;
    statut_livraison: string | null;
    delivery_id: string | null;
    notified_at: string | null;
  } | null;
}

type DriverOption = { id: string; name: string; phone: string | null };

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<SubStatus, string> = {
  active: 'Actif', inactive: 'Inactif', suspended: 'Suspendu', expired: 'Expiré',
};
const STATUS_COLOR: Record<SubStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-500',
  suspended: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-600',
};
const ORDER_LABEL: Record<OrderStatus, string> = {
  open: 'En cours', confirmed: 'Confirmée', preparing: 'Préparation',
  shipped: 'Expédiée', auto: 'Auto', en_livraison: 'En livraison',
};
const ORDER_COLOR: Record<OrderStatus, string> = {
  open: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  preparing: 'bg-blue-50 text-blue-700',
  shipped: 'bg-purple-50 text-purple-700',
  auto: 'bg-gray-100 text-gray-500',
  en_livraison: 'bg-pink-50 text-pink-700',
};

// ─── BoxModal ─────────────────────────────────────────────────────────────────

function BoxModal({
  sub,
  currentMonth,
  onClose,
  onDeliver,
}: {
  sub: SubscriptionRow;
  currentMonth: string;
  onClose: () => void;
  onDeliver: () => void;
}) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const order = sub.currentOrder!;
  const clientName = sub.client ? `${sub.client.first_name} ${sub.client.last_name}` : '—';
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('subscription_order_items')
      .select('*, product:products(id, name, image_url, ref)')
      .eq('order_id', order.id)
      .then(({ data }) => { setItems(data ?? []); setLoading(false); });
  }, [order.id]);

  const isDelivered = order.statut_livraison === 'en_livraison';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📦 Box de {clientName}</h2>
            <p className="text-sm text-gray-500 capitalize mt-0.5">
              {monthLabel} — {sub.plan?.name ?? '—'} {sub.plan?.price ?? '—'}€
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-lg">×</button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucun produit dans cette box</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                PRODUITS ({items.length}) :
              </p>
              {items.map((item) => {
                const name = item.product?.name ?? '—';
                const ref = item.product?.ref;
                return (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                      {ref && <p className="text-xs text-gray-400">Réf: {ref}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">x{item.quantity}</p>
                      <p className="text-xs text-gray-500">{(item.unit_sell_price * item.quantity).toFixed(2)} €</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 space-y-1 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Sous-total produits</span>
            <span className="font-semibold tabular-nums">{order.total_sell_price.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Livraison</span>
            <span className="font-semibold tabular-nums">
              {sub.plan?.shipping_free ? 'Offerte' : `${order.shipping_cost.toFixed(2)} €`}
            </span>
          </div>
          <div className="flex justify-between font-bold text-gray-900 border-t border-gray-200 pt-1.5 mt-1.5">
            <span>Forfait abonnement</span>
            <span className="tabular-nums">{sub.plan?.price ?? '—'} €</span>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ORDER_COLOR[order.status]} border-current`}>
              {isDelivered ? '🚚 En livraison' : `✅ ${ORDER_LABEL[order.status]}`}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 pt-3 flex gap-3">
          {!isDelivered && (
            <button
              onClick={() => { onClose(); onDeliver(); }}
              className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 active:scale-95 transition-all"
            >
              🚚 Mettre en livraison
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 py-3 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeliveryModal ────────────────────────────────────────────────────────────

function DeliveryModal({
  sub,
  currentMonth,
  onClose,
  onConfirmed,
}: {
  sub: SubscriptionRow;
  currentMonth: string;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const clientName = sub.client ? `${sub.client.first_name} ${sub.client.last_name}` : '';
  const clientPhone = sub.portal_phone ?? '';
  const monthLabel = new Date(currentMonth + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  useEffect(() => {
    setNotes(`Box abonnement ${monthLabel}`);

    // Load drivers
    fetch('/api/livreurs')
      .then((r) => r.json())
      .then((d) => setDrivers(
        (d.drivers ?? []).map((dr: any) => ({
          id: dr.id,
          name: `${dr.first_name ?? ''} ${dr.last_name ?? ''}`.trim(),
          phone: dr.phone ?? null,
        }))
      ))
      .catch(() => {});

    // Load client address
    if (sub.client?.id) {
      fetch(`/api/clients/${sub.client.id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => {
          if (!d) return;
          const c = d.client ?? d;
          const addr = [c.address, c.city, c.postal_code ?? c.postalCode].filter(Boolean).join(', ');
          if (addr) setClientAddress(addr);
        })
        .catch(() => {});
    }
  }, [sub.client?.id, monthLabel]);

  const handleSubmit = async () => {
    if (!clientName.trim()) { setError('Nom client manquant.'); return; }
    if (!clientAddress.trim()) { setError('Adresse de livraison requise.'); return; }
    setSubmitting(true);
    setError('');

    try {
      // 1. Create delivery — API expects snake_case
      const deliveryPayload: any = {
        client_name: clientName,
        client_phone: clientPhone,
        delivery_address: clientAddress,
        total_amount: sub.plan?.price ?? 0,
        delivery_notes: notes,
        products: [],
      };
      if (selectedDriver) deliveryPayload.assigned_to_driver = selectedDriver;

      const res = await fetch('/api/livraisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deliveryPayload),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur création livraison.'); setSubmitting(false); return; }
      const deliveryId = json.delivery?.id ?? json.id ?? null;

      // 2. Update subscription_order
      const supabase = createClient();
      await supabase
        .from('subscription_orders')
        .update({
          statut_livraison: 'en_livraison',
          delivery_id: deliveryId,
        })
        .eq('id', sub.currentOrder!.id);

      // 3. Send push to driver (non-blocking)
      if (selectedDriver) {
        fetch('/api/push/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            driverId: selectedDriver,
            title: '🚚 Box abonnement',
            pushBody: `${clientName} — ${clientAddress}`,
            url: '/livreur/dashboard',
          }),
        }).catch(() => {});
      }

      // 4. Open WhatsApp for client
      const firstName = sub.client?.first_name ?? clientName;
      const waMsg = `Bonjour ${firstName} ! 🎁\n\nVotre box beauté du mois est en route !\n\nLe Monde de l'Esthétique 💅`;
      const phone = clientPhone.replace(/[\s+]/g, '');
      if (phone) {
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`, '_blank');
      }

      onConfirmed();
    } catch (err: any) {
      setError(err?.message ?? 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">🚚 Mettre en livraison</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors text-lg">×</button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Client info */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Client</span>
              <span className="font-semibold text-gray-900">{clientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Téléphone</span>
              <span className="font-semibold text-gray-900">{clientPhone || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Forfait</span>
              <span className="font-semibold text-gray-900">{sub.plan?.name} — {sub.plan?.price} €</span>
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Adresse de livraison *</label>
            <input
              type="text"
              value={clientAddress}
              onChange={(e) => setClientAddress(e.target.value)}
              placeholder="3 Avenue Loulou Boilaville, Fort-de-France"
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:outline-none transition-colors"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:outline-none transition-colors"
            />
          </div>

          {/* Driver */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">Livreur</label>
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-orange-400 focus:outline-none transition-colors bg-white"
            >
              <option value="">— Sélectionner un livreur —</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ''}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-3.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {submitting ? 'En cours…' : '🚚 Confirmer la livraison'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-3.5 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AbonnementsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAuto, setGeneratingAuto] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SubStatus | 'all'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newConfirmToast, setNewConfirmToast] = useState<string | null>(null);
  // Modals
  const [boxModalSub, setBoxModalSub] = useState<SubscriptionRow | null>(null);
  const [deliveryModalSub, setDeliveryModalSub] = useState<SubscriptionRow | null>(null);
  // Notify state
  const [notifyingId, setNotifyingId] = useState<string | null>(null);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const today = new Date();
  const isPastDeadline = today.getDate() > 25;

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const { data: subs } = await supabase
      .from('client_subscriptions')
      .select(`
        id, status, portal_phone, pin_code, next_billing_date,
        client:clients(id, first_name, last_name),
        plan:subscription_plans(id, name, price, quota_amount, shipping_free, shipping_cost)
      `)
      .order('created_at', { ascending: false });

    if (!subs) { setLoading(false); return; }

    const subIds = subs.map((s: any) => s.id);
    const { data: orders } = await supabase
      .from('subscription_orders')
      .select('id, subscription_id, status, total_products_cost, total_sell_price, benefit_amount, shipping_cost, statut_livraison, delivery_id, notified_at')
      .in('subscription_id', subIds)
      .eq('order_month', currentMonth);

    const orderMap = new Map<string, any>();
    for (const o of orders ?? []) orderMap.set(o.subscription_id, o);

    const rows: SubscriptionRow[] = (subs as any[]).map((s) => ({
      id: s.id,
      status: s.status,
      portal_phone: s.portal_phone,
      pin_code: s.pin_code,
      next_billing_date: s.next_billing_date,
      client: Array.isArray(s.client) ? s.client[0] : s.client,
      plan: Array.isArray(s.plan) ? s.plan[0] : s.plan,
      currentOrder: orderMap.get(s.id) ?? null,
    }));

    setSubscriptions(rows);
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { load(); }, [load]);

  // Real-time confirmation listener
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-subscription-confirmations')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'subscription_orders' }, (payload: any) => {
        if (payload.new?.status === 'confirmed') {
          const benefit = payload.new.benefit_amount ?? 0;
          setNewConfirmToast(`Nouvelle box confirmée${benefit > 0 ? ` — Bénéfice: +${benefit.toFixed(0)} €` : ''}`);
          setTimeout(() => setNewConfirmToast(null), 5000);
          load();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // KPIs
  const active = subscriptions.filter((s) => s.status === 'active');
  const mrr = active.reduce((sum, s) => sum + (s.plan?.price ?? 0), 0);
  const totalBenefit = active.reduce((sum, s) => sum + (s.currentOrder?.benefit_amount ?? 0), 0);
  const confirmed = active.filter((s) => s.currentOrder?.status === 'confirmed').length;
  const pending = active.filter((s) => !s.currentOrder || s.currentOrder.status === 'open').length;

  // Banner: subs with no order this month
  const notCompleted = active.filter((s) => !s.currentOrder || s.currentOrder.status === 'open');

  const handleGenerateAuto = async () => {
    if (!isPastDeadline) { alert('La génération automatique n\'est disponible qu\'après le 25 du mois.'); return; }
    setGeneratingAuto(true);
    const supabase = createClient();
    const toAuto = active.filter((s) => !s.currentOrder || s.currentOrder.status === 'open');
    for (const sub of toAuto) {
      if (!sub.currentOrder) {
        await supabase.from('subscription_orders').insert({
          subscription_id: sub.id, order_month: currentMonth, status: 'auto',
          shipping_cost: sub.plan?.shipping_free ? 0 : (sub.plan?.shipping_cost ?? 0),
        });
      } else {
        await supabase.from('subscription_orders').update({ status: 'auto' }).eq('id', sub.currentOrder.id);
      }
    }
    await load();
    setGeneratingAuto(false);
  };

  // WhatsApp notification for a single subscriber
  const handleNotify = async (sub: SubscriptionRow) => {
    const phone = (sub.portal_phone ?? '').replace(/[\s+\-()]/g, '');
    if (!phone) { alert('Numéro de téléphone manquant pour ce client.'); return; }

    const firstName = sub.client?.first_name ?? sub.client?.first_name ?? 'Client';
    const order = sub.currentOrder;
    const remainingQuota = order
      ? Math.max(0, (sub.plan?.quota_amount ?? 0) - (order.total_sell_price ?? 0))
      : (sub.plan?.quota_amount ?? 0);

    const message =
      `Bonjour ${firstName} ! 👋\n\n` +
      `🎁 Votre box beauté du mois est prête à être personnalisée !\n\n` +
      `💰 Quota restant : ${remainingQuota.toFixed(0)} €\n\n` +
      `Complétez votre sélection ici :\n` +
      `lmdecaisse.com/client-portal/login\n\n` +
      `📅 Date limite : le 25 du mois\n\n` +
      `Le Monde de l'Esthétique 💅`;

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');

    // Record notification time
    setNotifyingId(sub.id);
    const supabase = createClient();
    if (order) {
      await supabase
        .from('subscription_orders')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', order.id);
    } else {
      // Create an open order to record the notification
      await supabase.from('subscription_orders').insert({
        subscription_id: sub.id,
        order_month: currentMonth,
        status: 'open',
        shipping_cost: sub.plan?.shipping_free ? 0 : (sub.plan?.shipping_cost ?? 0),
        notified_at: new Date().toISOString(),
      });
    }
    setNotifyingId(null);
    await load();
  };

  // Notify all not-completed
  const handleNotifyAll = () => {
    for (const sub of notCompleted) {
      handleNotify(sub);
    }
  };

  const filtered = filterStatus === 'all' ? subscriptions : subscriptions.filter((s) => s.status === filterStatus);

  return (
    <AppLayout>
      {/* Real-time confirmation toast */}
      {newConfirmToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2.5 px-4 py-3 bg-emerald-600 text-white rounded-xl shadow-lg text-sm font-medium">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
          {newConfirmToast}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Abonnements</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestion des box beauté mensuelles</p>
          </div>
          <button
            onClick={handleGenerateAuto}
            disabled={generatingAuto}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {generatingAuto ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5l-3.9 19.5m-2.1-19.5l-3.9 19.5" />
              </svg>
            )}
            Générer box auto
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Abonnés actifs" value={active.length.toString()} icon="👥" color="bg-emerald-50 text-emerald-700" />
          <KpiCard label="Revenu récurrent" value={`${mrr.toFixed(0)} €`} icon="💳" color="bg-blue-50 text-blue-700" />
          <KpiCard label="Bénéfice total mois" value={`${totalBenefit.toFixed(0)} €`} icon="✨" color="bg-rose-50 text-rose-700" />
          <KpiCard label="Confirmées / En attente" value={`${confirmed} / ${pending}`} icon="📦" color="bg-amber-50 text-amber-700" />
        </div>

        {/* Banner: subscribers who haven't completed their box */}
        {notCompleted.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              📱 {notCompleted.length} abonné{notCompleted.length > 1 ? 's' : ''} n&apos;{notCompleted.length > 1 ? 'ont' : 'a'} pas encore complété {notCompleted.length > 1 ? 'leur' : 'sa'} box ce mois-ci
            </p>
            <button
              onClick={handleNotifyAll}
              className="shrink-0 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors"
            >
              Envoyer rappel à tous
            </button>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'inactive', 'suspended', 'expired'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                filterStatus === s
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              }`}
            >
              {s === 'all' ? 'Tous' : STATUS_LABEL[s]}
              <span className="ml-1.5 opacity-70">
                ({s === 'all' ? subscriptions.length : subscriptions.filter((x) => x.status === s).length})
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <svg className="w-7 h-7 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl">
            <p className="text-sm text-muted-foreground">Aucun abonnement</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((sub) => {
              const clientName = sub.client
                ? `${sub.client.first_name} ${sub.client.last_name}`
                : '—';
              const isExpanded = expandedId === sub.id;
              const order = sub.currentOrder;
              const benefit = order?.benefit_amount ?? null;
              const isConfirmed = order?.status === 'confirmed' || order?.status === 'preparing' || order?.status === 'shipped';
              const isEnLivraison = order?.statut_livraison === 'en_livraison';
              const noOrder = !order || order.status === 'open';
              const notifiedAt = order?.notified_at;

              return (
                <div key={sub.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{clientName}</p>
                      <p className="text-xs text-muted-foreground">{sub.plan?.name ?? '—'} · {sub.plan?.price ?? '—'} €/mois</p>
                    </div>

                    {/* Sub status */}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[sub.status]}`}>
                      {STATUS_LABEL[sub.status]}
                    </span>

                    {/* Order status badge */}
                    {isEnLivraison ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 bg-pink-50 text-pink-700 border-pink-200">
                        🚚 En livraison
                      </span>
                    ) : order ? (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 ${ORDER_COLOR[order.status]}`}>
                        {ORDER_LABEL[order.status]}
                      </span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full border shrink-0 bg-orange-50 text-orange-700 border-orange-200">
                        Pas de commande
                      </span>
                    )}

                    {/* Benefit */}
                    {benefit !== null && benefit > 0 && (
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0 tabular-nums hidden sm:inline">
                        +{benefit.toFixed(0)} €
                      </span>
                    )}

                    {/* Quick actions in row (no propagation) */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {noOrder && (
                        <button
                          onClick={() => handleNotify(sub)}
                          disabled={notifyingId === sub.id}
                          className="px-2.5 py-1 bg-amber-100 text-amber-700 border border-amber-300 rounded-lg text-[11px] font-bold hover:bg-amber-200 transition-colors disabled:opacity-50"
                          title="Envoyer rappel WhatsApp"
                        >
                          📱 Notifier
                        </button>
                      )}
                      {isConfirmed && !isEnLivraison && (
                        <>
                          <button
                            onClick={() => setBoxModalSub(sub)}
                            className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-bold hover:bg-blue-100 transition-colors"
                            title="Voir la box"
                          >
                            📦 Box
                          </button>
                          <button
                            onClick={() => setDeliveryModalSub(sub)}
                            className="px-2.5 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-[11px] font-bold hover:bg-orange-100 transition-colors"
                            title="Mettre en livraison"
                          >
                            🚚
                          </button>
                        </>
                      )}
                    </div>

                    <svg
                      className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 bg-muted/20 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-muted-foreground mb-0.5">Téléphone portail</p>
                          <p className="font-semibold text-foreground">{sub.portal_phone ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Code PIN</p>
                          <p className="font-semibold text-foreground font-mono">{sub.pin_code ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Quota mensuel</p>
                          <p className="font-semibold text-foreground">{sub.plan?.quota_amount ?? '—'} €</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Livraison</p>
                          <p className="font-semibold text-foreground">
                            {sub.plan?.shipping_free ? 'Offerte' : `${sub.plan?.shipping_cost ?? '—'} €`}
                          </p>
                        </div>
                      </div>

                      {/* Notification badge */}
                      {notifiedAt && (
                        <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                          <span>📱</span>
                          <span>Notifié le {new Date(notifiedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}

                      {/* En livraison badge */}
                      {isEnLivraison && (
                        <div className="flex items-center gap-2 text-xs text-pink-700 bg-pink-50 border border-pink-200 rounded-lg px-3 py-1.5">
                          <span>🚚</span>
                          <span>Box en livraison</span>
                        </div>
                      )}

                      {/* Order financials */}
                      {order && (
                        <div className="border border-border rounded-xl p-3 bg-card">
                          <p className="text-xs font-semibold text-muted-foreground mb-2">Commande {currentMonth}</p>
                          <div className="grid grid-cols-3 gap-2 text-xs text-center">
                            <div>
                              <p className="text-muted-foreground">Coût achat</p>
                              <p className="font-bold text-foreground tabular-nums">{(order.total_products_cost ?? 0).toFixed(2)} €</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Prix vente</p>
                              <p className="font-bold text-foreground tabular-nums">{(order.total_sell_price ?? 0).toFixed(2)} €</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Bénéfice net</p>
                              <p className="font-bold text-emerald-600 tabular-nums">{(order.benefit_amount ?? 0).toFixed(2)} €</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={`/clients?id=${sub.client?.id}`}
                          className="flex-1 min-w-[120px] py-2 text-center border border-border rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Voir la fiche client
                        </a>
                        <a
                          href="/client-portal/login"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 min-w-[120px] py-2 text-center border border-primary text-primary rounded-xl text-xs font-semibold hover:bg-primary/5 transition-colors"
                        >
                          Ouvrir le portail
                        </a>
                        {isConfirmed && !isEnLivraison && (
                          <button
                            onClick={() => setBoxModalSub(sub)}
                            className="flex-1 min-w-[120px] py-2 text-center bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
                          >
                            📦 Voir la box
                          </button>
                        )}
                        {isConfirmed && !isEnLivraison && (
                          <button
                            onClick={() => setDeliveryModalSub(sub)}
                            className="flex-1 min-w-[120px] py-2 text-center bg-orange-50 border border-orange-200 text-orange-700 rounded-xl text-xs font-semibold hover:bg-orange-100 transition-colors"
                          >
                            🚚 Mettre en livraison
                          </button>
                        )}
                        <button
                          onClick={() => handleNotify(sub)}
                          disabled={notifyingId === sub.id}
                          className="flex-1 min-w-[120px] py-2 text-center bg-amber-50 border border-amber-200 text-amber-700 rounded-xl text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50"
                        >
                          🔔 Notifier le client
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* BoxModal */}
      {boxModalSub && (
        <BoxModal
          sub={boxModalSub}
          currentMonth={currentMonth}
          onClose={() => setBoxModalSub(null)}
          onDeliver={() => setDeliveryModalSub(boxModalSub)}
        />
      )}

      {/* DeliveryModal */}
      {deliveryModalSub && (
        <DeliveryModal
          sub={deliveryModalSub}
          currentMonth={currentMonth}
          onClose={() => setDeliveryModalSub(null)}
          onConfirmed={() => { setDeliveryModalSub(null); load(); }}
        />
      )}
    </AppLayout>
  );
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
