'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';

type SubStatus = 'active' | 'inactive' | 'suspended' | 'expired';
type OrderStatus = 'open' | 'confirmed' | 'preparing' | 'shipped' | 'auto';

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
  } | null;
}

const STATUS_LABEL: Record<SubStatus, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  suspended: 'Suspendu',
  expired: 'Expiré',
};
const STATUS_COLOR: Record<SubStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  inactive: 'bg-gray-100 text-gray-500',
  suspended: 'bg-amber-50 text-amber-700',
  expired: 'bg-red-50 text-red-600',
};

const ORDER_LABEL: Record<OrderStatus, string> = {
  open: 'En cours',
  confirmed: 'Confirmée',
  preparing: 'Préparation',
  shipped: 'Expédiée',
  auto: 'Auto',
};
const ORDER_COLOR: Record<OrderStatus, string> = {
  open: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-emerald-50 text-emerald-700',
  preparing: 'bg-blue-50 text-blue-700',
  shipped: 'bg-purple-50 text-purple-700',
  auto: 'bg-gray-100 text-gray-500',
};

export default function AbonnementsPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingAuto, setGeneratingAuto] = useState(false);
  const [filterStatus, setFilterStatus] = useState<SubStatus | 'all'>('active');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

    // Load current month orders for all active subs
    const subIds = subs.map((s: any) => s.id);
    const { data: orders } = await supabase
      .from('subscription_orders')
      .select('id, subscription_id, status, total_products_cost, total_sell_price, benefit_amount, shipping_cost')
      .in('subscription_id', subIds)
      .eq('order_month', currentMonth);

    const orderMap = new Map<string, any>();
    for (const o of orders ?? []) {
      orderMap.set(o.subscription_id, o);
    }

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

  // KPIs
  const active = subscriptions.filter((s) => s.status === 'active');
  const mrr = active.reduce((sum, s) => sum + (s.plan?.price ?? 0), 0);
  const totalBenefit = active.reduce((sum, s) => sum + (s.currentOrder?.benefit_amount ?? 0), 0);
  const confirmed = active.filter((s) => s.currentOrder?.status === 'confirmed').length;
  const pending = active.filter((s) => !s.currentOrder || s.currentOrder.status === 'open').length;

  const handleGenerateAuto = async () => {
    if (!isPastDeadline) {
      alert('La génération automatique n\'est disponible qu\'après le 25 du mois.');
      return;
    }
    setGeneratingAuto(true);
    const supabase = createClient();

    // Find active subs with no order or open order this month
    const toAuto = active.filter(
      (s) => !s.currentOrder || s.currentOrder.status === 'open'
    );

    for (const sub of toAuto) {
      if (!sub.currentOrder) {
        // Create auto order
        await supabase.from('subscription_orders').insert({
          subscription_id: sub.id,
          order_month: currentMonth,
          status: 'auto',
          shipping_cost: sub.plan?.shipping_free ? 0 : (sub.plan?.shipping_cost ?? 0),
        });
      } else {
        await supabase
          .from('subscription_orders')
          .update({ status: 'auto' })
          .eq('id', sub.currentOrder.id);
      }
    }

    await load();
    setGeneratingAuto(false);
  };

  const filtered = filterStatus === 'all' ? subscriptions : subscriptions.filter((s) => s.status === filterStatus);

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Abonnements</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestion des box beauté mensuelles</p>
          </div>
          <button
            onClick={handleGenerateAuto}
            disabled={generatingAuto}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-40"
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
          <KpiCard
            label={`Confirmées / En attente`}
            value={`${confirmed} / ${pending}`}
            icon="📦"
            color="bg-amber-50 text-amber-700"
          />
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap">
          {(['all', 'active', 'inactive', 'suspended', 'expired'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${
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

              return (
                <div key={sub.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : sub.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                  >
                    {/* Client name + plan */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground truncate">{clientName}</p>
                      <p className="text-xs text-muted-foreground">{sub.plan?.name ?? '—'} · {sub.plan?.price ?? '—'} €/mois</p>
                    </div>

                    {/* Sub status */}
                    <span className={`text-xs font-600 px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[sub.status]}`}>
                      {STATUS_LABEL[sub.status]}
                    </span>

                    {/* Order status */}
                    {order ? (
                      <span className={`text-xs font-600 px-2 py-0.5 rounded-full border shrink-0 ${ORDER_COLOR[order.status]}`}>
                        {ORDER_LABEL[order.status]}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground shrink-0">Pas de commande</span>
                    )}

                    {/* Benefit */}
                    {benefit !== null && benefit > 0 ? (
                      <span className="text-xs font-700 text-emerald-600 shrink-0 tabular-nums">+{benefit.toFixed(2)} €</span>
                    ) : null}

                    {/* Chevron */}
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
                          <p className="font-600 text-foreground">{sub.portal_phone ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Code PIN</p>
                          <p className="font-600 text-foreground font-mono">{sub.pin_code ?? '—'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Quota mensuel</p>
                          <p className="font-600 text-foreground">{sub.plan?.quota_amount ?? '—'} €</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-0.5">Livraison</p>
                          <p className="font-600 text-foreground">
                            {sub.plan?.shipping_free ? 'Offerte' : `${sub.plan?.shipping_cost ?? '—'} €`}
                          </p>
                        </div>
                      </div>

                      {order && (
                        <div className="border border-border rounded-xl p-3 bg-card">
                          <p className="text-xs font-600 text-muted-foreground mb-2">Commande {currentMonth}</p>
                          <div className="grid grid-cols-3 gap-2 text-xs text-center">
                            <div>
                              <p className="text-muted-foreground">Coût achat</p>
                              <p className="font-700 text-foreground tabular-nums">{order.total_products_cost.toFixed(2)} €</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Prix vente</p>
                              <p className="font-700 text-foreground tabular-nums">{order.total_sell_price.toFixed(2)} €</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Bénéfice net</p>
                              <p className="font-700 text-emerald-600 tabular-nums">{order.benefit_amount.toFixed(2)} €</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <a
                          href={`/clients?id=${sub.client?.id}`}
                          className="flex-1 py-2 text-center border border-border rounded-xl text-xs font-600 text-muted-foreground hover:bg-muted transition-colors"
                        >
                          Voir la fiche client
                        </a>
                        <a
                          href="/client-portal/login"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 text-center border border-primary text-primary rounded-xl text-xs font-600 hover:bg-primary/5 transition-colors"
                        >
                          Ouvrir le portail
                        </a>
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

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color: string }) {
  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <p className="text-xl font-700 tabular-nums">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}
