'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  clientService,
  type Client,
  type ClientPurchase,
  type LoyaltyTransaction,
  type ClientSubscription,
  type ClientInternalNote,
  getClientDiscount,
} from '@/lib/services/clientService';
import { loyaltyService, getNextTier, pointsToNextTier, REWARD_TYPE_ICONS, REWARD_TYPE_LABELS, type LoyaltyTier, type LoyaltyRedemption, type ClientLoyaltyReward } from '@/lib/services/loyaltyService';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  quota_amount: number;
  shipping_free: boolean;
  shipping_cost: number;
  description: string | null;
}

interface ClientDetailPanelProps {
  client: Client;
  purchases: ClientPurchase[];
  loyaltyTransactions: LoyaltyTransaction[];
  subscription: ClientSubscription | null;
  notes: ClientInternalNote[];
  onEdit: () => void;
  onClose: () => void;
  onClientUpdated: (c: Client) => void;
  onNotesUpdated: (notes: ClientInternalNote[]) => void;
  onSubscriptionUpdated: (sub: ClientSubscription | null) => void;
}

const TIER_CONFIG = {
  bronze: { label: 'Bronze', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  silver: { label: 'Argent', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  gold: { label: 'Or', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  platinum: { label: 'Platine', color: 'text-purple-700 bg-purple-50 border-purple-200' },
};

const STATUS_CONFIG = {
  completed: { label: 'Complété', color: 'text-emerald-700 bg-emerald-50' },
  refunded: { label: 'Remboursé', color: 'text-red-700 bg-red-50' },
  partial_refund: { label: 'Remb. partiel', color: 'text-amber-700 bg-amber-50' },
  cancelled: { label: 'Annulé', color: 'text-muted-foreground bg-muted' },
};

const SUB_STATUS_CONFIG = {
  active: { label: 'Actif', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  inactive: { label: 'Inactif', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  expired: { label: 'Expiré', color: 'text-red-700 bg-red-50 border-red-200' },
  suspended: { label: 'Suspendu', color: 'text-amber-700 bg-amber-50 border-amber-200' },
};

const CLIENT_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  particulier: { label: 'Particulier', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  professionnel: { label: 'Pro', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  vip: { label: 'VIP', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  abonne: { label: 'Abonné', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  non_abonne: { label: 'Non abonné', color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

const DISCOUNT_OPTIONS = [
  { value: 'pro_5', label: 'Pro -5%', percent: 5 },
  { value: 'pro_10', label: 'Pro -10%', percent: 10 },
  { value: 'pro_15', label: 'Pro -15%', percent: 15 },
  { value: 'vip', label: 'Avantages VIP', percent: 0 },
  { value: 'classic', label: 'Fidélité classique', percent: 0 },
  { value: 'custom', label: 'Remise personnalisée', percent: 0 },
];

type Tab = 'overview' | 'purchases' | 'loyalty' | 'subscription' | 'notes';

export default function ClientDetailPanel({
  client,
  purchases,
  loyaltyTransactions,
  subscription,
  notes,
  onEdit,
  onClose,
  onClientUpdated,
  onNotesUpdated,
  onSubscriptionUpdated,
}: ClientDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('overview');
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [showSubForm, setShowSubForm] = useState(false);
  const [subForm, setSubForm] = useState({
    subscriptionType: subscription?.subscriptionType ?? 'Abonnement Standard',
    discountPercent: subscription?.discountPercent ?? 5,
    status: (subscription?.status ?? 'active') as 'active' | 'inactive' | 'expired' | 'suspended',
    startDate: subscription?.startDate ?? new Date().toISOString().split('T')[0],
    endDate: subscription?.endDate ?? '',
    autoRenew: subscription?.autoRenew ?? false,
    notes: subscription?.notes ?? '',
  });
  const [savingSub, setSavingSub] = useState(false);
  const [savingDiscount, setSavingDiscount] = useState(false);

  // Box subscription portal state
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [portalPlanId, setPortalPlanId] = useState('');
  const [portalPhone, setPortalPhone] = useState('');
  const [portalPin, setPortalPin] = useState('');
  const [savingPortal, setSavingPortal] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);
  const [discountType, setDiscountType] = useState(client.loyaltyDiscountType ?? '');
  const [discountValue, setDiscountValue] = useState(client.loyaltyDiscountValue ?? 0);

  // Loyalty tiers & redemptions
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [clientRedemptions, setClientRedemptions] = useState<LoyaltyRedemption[]>([]);
  const [clientRewards, setClientRewards] = useState<ClientLoyaltyReward[]>([]);
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);

  useEffect(() => {
    if (tab === 'loyalty') {
      setLoadingLoyalty(true);
      Promise.all([
        loyaltyService.getTiers(),
        loyaltyService.getClientRedemptions(client.id),
        loyaltyService.getClientRewards(client.id),
      ]).then(([tiers, redemptions, rewards]) => {
        setLoyaltyTiers(tiers);
        setClientRedemptions(redemptions);
        setClientRewards(rewards);
        setLoadingLoyalty(false);
      });
    }
  }, [tab, client.id]);

  useEffect(() => {
    if (tab !== 'subscription') return;
    const supabase = createSupabaseClient();
    supabase.from('subscription_plans').select('*').eq('is_active', true).order('price').then(({ data }) => {
      if (data) setPlans(data as SubscriptionPlan[]);
    });
    if (subscription) {
      supabase
        .from('client_subscriptions')
        .select('plan_id, pin_code, portal_phone')
        .eq('id', subscription.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPortalPlanId((data as any).plan_id ?? '');
            setPortalPhone((data as any).portal_phone ?? '');
            setPortalPin((data as any).pin_code ?? '');
          }
        });
    }
  }, [tab, subscription]);

  const nextTier = loyaltyTiers.length > 0 ? getNextTier(loyaltyTiers, client.loyaltyPoints) : null;
  const ptsToNext = loyaltyTiers.length > 0 ? pointsToNextTier(loyaltyTiers, client.loyaltyPoints) : 0;

  const tier = TIER_CONFIG[client.loyaltyTier];
  const typeCfg = CLIENT_TYPE_CONFIG[client.clientType] ?? CLIENT_TYPE_CONFIG.particulier;
  const effectiveDiscount = getClientDiscount(client, subscription);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Profil', icon: 'UserIcon' },
    { id: 'purchases', label: `Achats (${purchases.length})`, icon: 'ShoppingBagIcon' },
    { id: 'loyalty', label: 'Fidélité', icon: 'StarIcon' },
    { id: 'subscription', label: 'Abonnement', icon: 'CheckBadgeIcon' },
    { id: 'notes', label: `Notes (${notes.length})`, icon: 'ChatBubbleLeftEllipsisIcon' },
  ];

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const added = await clientService.addNote(client.id, newNote.trim());
    if (added) {
      onNotesUpdated([added, ...notes]);
      setNewNote('');
    }
    setSavingNote(false);
  };

  const handleDeleteNote = async (id: string) => {
    await clientService.deleteNote(id);
    onNotesUpdated(notes.filter((n) => n.id !== id));
  };

  const handleSaveDiscount = async () => {
    setSavingDiscount(true);
    const updated = await clientService.update(client.id, {
      loyaltyDiscountType: (discountType || null) as any,
      loyaltyDiscountValue: discountValue,
    });
    if (updated) onClientUpdated(updated);
    setSavingDiscount(false);
  };

  const handleSaveSubscription = async () => {
    setSavingSub(true);
    if (subscription) {
      const updated = await clientService.updateSubscription(subscription.id, {
        subscriptionType: subForm.subscriptionType,
        discountPercent: subForm.discountPercent,
        status: subForm.status,
        startDate: subForm.startDate,
        endDate: subForm.endDate || undefined,
        autoRenew: subForm.autoRenew,
        notes: subForm.notes,
      });
      if (updated) onSubscriptionUpdated(updated);
    } else {
      const created = await clientService.createSubscription({
        clientId: client.id,
        subscriptionType: subForm.subscriptionType,
        discountPercent: subForm.discountPercent,
        status: subForm.status,
        startDate: subForm.startDate,
        endDate: subForm.endDate || undefined,
        autoRenew: subForm.autoRenew,
        notes: subForm.notes,
      });
      if (created) {
        onSubscriptionUpdated(created);
        const refreshed = await clientService.getById(client.id);
        if (refreshed) onClientUpdated(refreshed);
      }
    }
    setShowSubForm(false);
    setSavingSub(false);
  };

  const handleGeneratePin = () => {
    setPortalPin(Math.floor(1000 + Math.random() * 9000).toString());
  };

  const handleSavePortal = async () => {
    if (!subscription) return;
    setSavingPortal(true);
    const supabase = createSupabaseClient();
    await supabase
      .from('client_subscriptions')
      .update({
        plan_id: portalPlanId || null,
        pin_code: portalPin || null,
        portal_phone: portalPhone || null,
      })
      .eq('id', subscription.id);
    setSavingPortal(false);
  };

  const selectedPlan = plans.find((p) => p.id === portalPlanId) ?? null;
  const portalUrl = typeof window !== 'undefined' ? `${window.location.origin}/client-portal/login` : '/client-portal/login';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-modal w-full max-w-2xl mx-0 sm:mx-4 max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-border shrink-0">
          <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-lg font-700 text-primary">{client.firstName.charAt(0)}{client.lastName.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-[17px] font-700 text-foreground">{client.fullName}</h2>
              <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${tier.color}`}>{tier.label}</span>
              <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${typeCfg.color}`}>{typeCfg.label}</span>
              {effectiveDiscount > 0 && (
                <span className="text-[11px] font-600 px-2 py-0.5 rounded-full border text-rose-700 bg-rose-50 border-rose-200">
                  -{effectiveDiscount}% remise
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{client.phone ?? client.email ?? 'Aucun contact'}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-500 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Icon name="PencilIcon" size={14} />
              Modifier
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 divide-x divide-border border-b border-border shrink-0">
          {[
            { label: 'Total dépensé', value: `${client.totalSpent.toFixed(2)} €`, icon: 'BanknotesIcon' },
            { label: 'Points', value: `${client.loyaltyPoints} pts`, icon: 'StarIcon' },
            { label: 'Visites', value: client.totalVisits.toString(), icon: 'CalendarDaysIcon' },
            { label: 'Solde dû', value: `${client.balanceDue.toFixed(2)} €`, icon: 'ExclamationCircleIcon' },
          ].map((stat) => (
            <div key={stat.label} className="flex flex-col items-center py-3 px-2">
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
              <span className="text-sm font-700 text-foreground mt-0.5 tabular-nums">{stat.value}</span>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0 px-2 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-3 text-sm font-500 border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon name={t.icon as any} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <div className="p-6 space-y-5">
              <div>
                <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-3">Coordonnées</h3>
                <div className="space-y-2">
                  {[
                    { icon: 'PhoneIcon', label: 'Téléphone', value: client.phone },
                    { icon: 'ChatBubbleLeftIcon', label: 'WhatsApp', value: client.whatsapp },
                    { icon: 'EnvelopeIcon', label: 'Email', value: client.email },
                    { icon: 'MapPinIcon', label: 'Adresse', value: [client.address, client.postalCode, client.city, client.country].filter(Boolean).join(', ') || null },
                  ].map((item) => item.value ? (
                    <div key={item.label} className="flex items-center gap-3">
                      <Icon name={item.icon as any} size={15} className="text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground w-20 shrink-0">{item.label}</span>
                      <span className="text-sm text-foreground">{item.value}</span>
                    </div>
                  ) : null)}
                </div>
              </div>

              {/* Discount badge */}
              {effectiveDiscount > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="TagIcon" size={16} className="text-rose-600" />
                    <span className="text-sm font-500 text-rose-800">Remise automatique en caisse</span>
                  </div>
                  <span className="text-lg font-700 tabular-nums text-rose-700">-{effectiveDiscount}%</span>
                </div>
              )}

              {/* Store credit */}
              {client.storeCredit > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="CreditCardIcon" size={16} className="text-blue-600" />
                    <span className="text-sm font-500 text-blue-800">Avoir disponible</span>
                  </div>
                  <span className="text-lg font-700 tabular-nums text-blue-700">{client.storeCredit.toFixed(2)} €</span>
                </div>
              )}

              {/* Balance due */}
              {client.balanceDue > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon name="ExclamationCircleIcon" size={16} className="text-amber-600" />
                    <span className="text-sm font-500 text-amber-800">Solde restant dû</span>
                  </div>
                  <span className="text-lg font-700 tabular-nums text-amber-700">{client.balanceDue.toFixed(2)} €</span>
                </div>
              )}

              {/* Subscription summary */}
              {subscription && (
                <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${SUB_STATUS_CONFIG[subscription.status].color}`}>
                  <div className="flex items-center gap-2">
                    <Icon name="CheckBadgeIcon" size={16} />
                    <div>
                      <p className="text-sm font-600">{subscription.subscriptionType}</p>
                      <p className="text-xs opacity-70">-{subscription.discountPercent}% · {subscription.status === 'active' ? `jusqu'au ${subscription.endDate ? new Date(subscription.endDate).toLocaleDateString('fr-FR') : '∞'}` : SUB_STATUS_CONFIG[subscription.status].label}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-600 px-2 py-0.5 rounded-full border ${SUB_STATUS_CONFIG[subscription.status].color}`}>{SUB_STATUS_CONFIG[subscription.status].label}</span>
                </div>
              )}

              {/* Notes */}
              {client.notes && (
                <div>
                  <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-2">Notes</h3>
                  <p className="text-sm text-foreground bg-muted/30 rounded-lg px-4 py-3">{client.notes}</p>
                </div>
              )}

              {/* Recent purchases */}
              {purchases.length > 0 && (
                <div>
                  <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-3">Derniers achats</h3>
                  <div className="space-y-2">
                    {purchases.slice(0, 3).map((p) => (
                      <div key={p.id} className="flex items-center justify-between py-2 px-3 bg-muted/20 rounded-lg">
                        <div>
                          <p className="text-sm font-500 text-foreground">{p.receiptNumber}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(p.purchasedAt).toLocaleDateString('fr-FR')} · {p.items.length} article{p.items.length > 1 ? 's' : ''}</p>
                        </div>
                        <span className="text-sm font-700 tabular-nums text-foreground">{p.totalTtc.toFixed(2)} €</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PURCHASES ── */}
          {tab === 'purchases' && (
            <div className="p-6">
              {purchases.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Icon name="ShoppingBagIcon" size={32} className="text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Aucun achat enregistré</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {purchases.map((p) => {
                    const statusCfg = STATUS_CONFIG[p.status];
                    return (
                      <div key={p.id} className="border border-border rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
                          <div>
                            <p className="text-sm font-600 text-foreground">{p.receiptNumber}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {new Date(p.purchasedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} · {p.paymentMethod}
                            </p>
                          </div>
                          <div className="text-right flex flex-col items-end gap-1">
                            <p className="text-base font-700 tabular-nums text-foreground">{p.totalTtc.toFixed(2)} €</p>
                            <span className={`text-[10px] font-600 px-2 py-0.5 rounded-full ${statusCfg.color}`}>{statusCfg.label}</span>
                          </div>
                        </div>
                        <div className="px-4 py-3 space-y-1.5">
                          {p.items.map((item, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span className="text-foreground">{item.name} <span className="text-muted-foreground">×{item.qty}</span></span>
                              <span className="tabular-nums text-muted-foreground">{item.total.toFixed(2)} €</span>
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                          {p.discountAmount > 0 && (
                            <span className="text-[11px] text-rose-600 font-500">Remise: -{p.discountAmount.toFixed(2)} €</span>
                          )}
                          {p.loyaltyPointsEarned > 0 && (
                            <div className="flex items-center gap-1.5 ml-auto">
                              <Icon name="StarIcon" size={12} className="text-amber-500" />
                              <span className="text-[11px] text-amber-700 font-500">+{p.loyaltyPointsEarned} pts</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── LOYALTY (ENHANCED) ── */}
          {tab === 'loyalty' && (
            <div className="p-6 space-y-5">
              {loadingLoyalty ? (
                <div className="flex items-center justify-center py-12">
                  <Icon name="ArrowPathIcon" size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Points summary with next tier progress */}
                  <div className={`rounded-xl border p-5 ${tier.color}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-500 opacity-80">Solde de points</p>
                        <p className="text-3xl font-700 tabular-nums mt-1">{client.loyaltyPoints.toLocaleString('fr-FR')}</p>
                        <p className="text-xs opacity-70 mt-1">≈ {(client.loyaltyPoints / 100).toFixed(2)} € de réduction</p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-700">{tier.label}</span>
                        <p className="text-xs opacity-70 mt-1">Niveau fidélité</p>
                      </div>
                    </div>
                    {/* Next tier progress */}
                    {nextTier && (
                      <div className="mt-3 pt-3 border-t border-current/20">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-600 opacity-80">🔥 Prochain palier : {nextTier.name}</span>
                          <span className="text-xs opacity-70 tabular-nums">Encore {ptsToNext.toLocaleString('fr-FR')} pts</span>
                        </div>
                        <div className="h-2 bg-current/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-current/60 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(3, ((client.loyaltyPoints % nextTier.pointsRequired) / nextTier.pointsRequired) * 100))}%`,
                            }}
                          />
                        </div>
                        <p className="text-[10px] opacity-60 mt-1">{nextTier.rewardDescription}</p>
                      </div>
                    )}
                    {!nextTier && loyaltyTiers.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-current/20 text-center">
                        <span className="text-sm font-700 opacity-80">👑 Niveau maximum atteint !</span>
                      </div>
                    )}
                  </div>

                  {/* All tiers progress */}
                  {loyaltyTiers.length > 0 && (
                    <div className="border border-border rounded-xl p-4">
                      <h3 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                        <Icon name="TrophyIcon" size={15} className="text-amber-500" />
                        Progression des paliers
                      </h3>
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {loyaltyTiers.map((lt) => {
                          const reached = client.loyaltyPoints >= lt.pointsRequired;
                          const isNext = !reached && lt.id === nextTier?.id;
                          return (
                            <div key={lt.id} className={`flex items-center gap-3 py-1.5 px-2 rounded-lg transition-colors ${reached ? 'bg-emerald-50' : isNext ? 'bg-amber-50' : 'opacity-40'}`}>
                              <span className="text-base shrink-0">{reached ? '✅' : isNext ? '🔥' : REWARD_TYPE_ICONS[lt.rewardType] ?? '🎁'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-600 text-foreground truncate">{lt.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{lt.rewardDescription}</p>
                              </div>
                              <span className={`text-[11px] font-700 tabular-nums shrink-0 ${reached ? 'text-emerald-600' : isNext ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                {lt.pointsRequired.toLocaleString('fr-FR')} pts
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Discount configuration */}
                  <div className="border border-border rounded-xl p-4 space-y-3">
                    <h3 className="text-sm font-600 text-foreground flex items-center gap-2">
                      <Icon name="TagIcon" size={15} className="text-rose-500" />
                      Remise spéciale client
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {DISCOUNT_OPTIONS.map((opt) => (
                        <button key={opt.value} onClick={() => setDiscountType(opt.value)}
                          className={`px-3 py-2 rounded-lg text-xs font-600 border transition-colors text-left ${discountType === opt.value ? 'bg-rose-50 border-rose-300 text-rose-700' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                          {opt.label}
                        </button>
                      ))}
                      <button onClick={() => setDiscountType('')}
                        className={`px-3 py-2 rounded-lg text-xs font-600 border transition-colors ${!discountType ? 'bg-muted border-border text-foreground' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        Aucune remise
                      </button>
                    </div>
                    {(discountType === 'custom' || discountType === 'vip' || discountType === 'classic') && (
                      <div>
                        <label className="text-xs font-600 text-muted-foreground block mb-1">Pourcentage de remise</label>
                        <div className="flex items-center gap-2">
                          <input type="number" min={0} max={100} value={discountValue}
                            onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                            className="w-24 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                          <span className="text-sm text-muted-foreground">%</span>
                        </div>
                      </div>
                    )}
                    <button onClick={handleSaveDiscount} disabled={savingDiscount}
                      className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
                      {savingDiscount ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />Appliquer la remise</>}
                    </button>
                  </div>

                  {/* Redemptions history */}
                  <div>
                    <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-3">Récompenses débloquées</h3>
                    {clientRedemptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucune récompense débloquée</p>
                    ) : (
                      <div className="space-y-2">
                        {clientRedemptions.map((r) => (
                          <div key={r.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors border border-border">
                            <span className="text-lg shrink-0">{REWARD_TYPE_ICONS[r.rewardType] ?? '🎁'}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground truncate">{r.rewardDescription}</p>
                              <p className="text-[11px] text-muted-foreground">{new Date(r.redeemedAt).toLocaleDateString('fr-FR')} · {r.pointsAtRedemption.toLocaleString('fr-FR')} pts</p>
                            </div>
                            <span className={`text-[10px] font-600 px-2 py-0.5 rounded-full border shrink-0 ${r.status === 'validated' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : r.status === 'cancelled' ? 'text-red-700 bg-red-50 border-red-200' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
                              {r.status === 'validated' ? 'Validé' : r.status === 'cancelled' ? 'Annulé' : 'En attente'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── PERSISTENT REWARDS HISTORY ── */}
                  {clientRewards.length > 0 && (() => {
                    const available = clientRewards.filter((r) => r.status === 'available');
                    const used = clientRewards.filter((r) => r.status === 'used');
                    const expired = clientRewards.filter((r) => r.status === 'expired' || r.status === 'cancelled');
                    return (
                      <div className="space-y-4">
                        {/* Summary KPIs */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Disponibles', count: available.length, color: 'text-violet-700 bg-violet-50 border-violet-200', icon: '🎁' },
                            { label: 'Utilisées', count: used.length, color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: '✅' },
                            { label: 'Expirées', count: expired.length, color: 'text-slate-600 bg-slate-50 border-slate-200', icon: '⏰' },
                          ].map((kpi) => (
                            <div key={kpi.label} className={`rounded-xl border p-3 text-center ${kpi.color}`}>
                              <p className="text-lg">{kpi.icon}</p>
                              <p className="text-xl font-700 tabular-nums">{kpi.count}</p>
                              <p className="text-[10px] font-600 opacity-80">{kpi.label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Available rewards */}
                        {available.length > 0 && (
                          <div>
                            <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                              <span>🎁</span> Récompenses disponibles ({available.length})
                            </h3>
                            <div className="space-y-2">
                              {available.map((r) => {
                                const isExpiringSoon = r.expiryDate && new Date(r.expiryDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                                const daysLeft = r.expiryDate ? Math.ceil((new Date(r.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                                return (
                                  <div key={r.id} className="flex items-start gap-3 py-2.5 px-3 rounded-xl border-2 border-violet-200 bg-violet-50">
                                    <span className="text-lg shrink-0 mt-0.5">{REWARD_TYPE_ICONS[r.rewardType] ?? '🎁'}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-700 text-violet-900">{r.rewardDescription}</p>
                                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                                          {REWARD_TYPE_LABELS[r.rewardType] ?? r.rewardType}
                                        </span>
                                        {r.rewardValue > 0 && (
                                          <span className="text-[10px] font-700 text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                            -{r.rewardValue}%
                                          </span>
                                        )}
                                        {isExpiringSoon && daysLeft !== null && (
                                          <span className="text-[10px] font-600 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                            ⚠️ Expire dans {daysLeft}j
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[10px] text-violet-600 mt-1">
                                        Débloquée le {new Date(r.unlockedAt).toLocaleDateString('fr-FR')} · {r.pointsAtUnlock.toLocaleString('fr-FR')} pts
                                        {r.expiryDate && <> · Expire le {new Date(r.expiryDate).toLocaleDateString('fr-FR')}</>}
                                      </p>
                                    </div>
                                    <span className="text-[10px] font-700 px-2 py-1 rounded-full bg-violet-200 text-violet-800 shrink-0">
                                      Disponible
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Used rewards */}
                        {used.length > 0 && (
                          <div>
                            <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                              <span>✅</span> Récompenses utilisées ({used.length})
                            </h3>
                            <div className="space-y-2">
                              {used.map((r) => (
                                <div key={r.id} className="flex items-start gap-3 py-2.5 px-3 rounded-xl border border-emerald-200 bg-emerald-50">
                                  <span className="text-lg shrink-0 mt-0.5">{REWARD_TYPE_ICONS[r.rewardType] ?? '🎁'}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-600 text-emerald-900">{r.rewardDescription}</p>
                                    <p className="text-[10px] text-emerald-700 mt-0.5">
                                      Utilisée le {r.usedAt ? new Date(r.usedAt).toLocaleDateString('fr-FR') : '—'}
                                      {r.ticketRef && <> · Ticket : {r.ticketRef}</>}
                                      {r.cashierName && <> · Par : {r.cashierName}</>}
                                    </p>
                                    <p className="text-[10px] text-emerald-600 mt-0.5">
                                      Débloquée le {new Date(r.unlockedAt).toLocaleDateString('fr-FR')} · {r.pointsAtUnlock.toLocaleString('fr-FR')} pts
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-700 px-2 py-1 rounded-full bg-emerald-200 text-emerald-800 shrink-0">
                                    Utilisée
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Expired / cancelled rewards */}
                        {expired.length > 0 && (
                          <div>
                            <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                              <span>⏰</span> Récompenses expirées ({expired.length})
                            </h3>
                            <div className="space-y-2">
                              {expired.map((r) => (
                                <div key={r.id} className="flex items-start gap-3 py-2 px-3 rounded-xl border border-border bg-muted/20 opacity-60">
                                  <span className="text-base shrink-0 mt-0.5">{REWARD_TYPE_ICONS[r.rewardType] ?? '🎁'}</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm text-muted-foreground line-through">{r.rewardDescription}</p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">
                                      {r.status === 'cancelled' ? 'Annulée' : 'Expirée'}
                                      {r.expiryDate && <> le {new Date(r.expiryDate).toLocaleDateString('fr-FR')}</>}
                                    </p>
                                  </div>
                                  <span className="text-[10px] font-600 px-2 py-1 rounded-full bg-muted text-muted-foreground shrink-0">
                                    {r.status === 'cancelled' ? 'Annulée' : 'Expirée'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Transactions */}
                  <div>
                    <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-3">Historique des points</h3>
                    {loyaltyTransactions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Aucune transaction</p>
                    ) : (
                      <div className="space-y-2">
                        {loyaltyTransactions.map((tx) => (
                          <div key={tx.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/20 transition-colors">
                            <div>
                              <p className="text-sm text-foreground">{tx.reason}</p>
                              <p className="text-[11px] text-muted-foreground">{new Date(tx.createdAt).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-sm font-700 tabular-nums ${tx.pointsChange >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {tx.pointsChange >= 0 ? '+' : ''}{tx.pointsChange} pts
                              </span>
                              <p className="text-[11px] text-muted-foreground tabular-nums">Solde: {tx.balanceAfter}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── SUBSCRIPTION ── */}
          {tab === 'subscription' && (
            <div className="p-6 space-y-5">
              {/* Current subscription status */}
              {subscription ? (
                <div className={`rounded-xl border p-4 ${SUB_STATUS_CONFIG[subscription.status].color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Icon name="CheckBadgeIcon" size={18} />
                      <span className="text-base font-700">{subscription.subscriptionType}</span>
                    </div>
                    <span className={`text-xs font-600 px-2 py-0.5 rounded-full border ${SUB_STATUS_CONFIG[subscription.status].color}`}>
                      {SUB_STATUS_CONFIG[subscription.status].label}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs opacity-70">Réduction</p>
                      <p className="font-700">-{subscription.discountPercent}%</p>
                    </div>
                    <div>
                      <p className="text-xs opacity-70">Début</p>
                      <p className="font-600">{new Date(subscription.startDate).toLocaleDateString('fr-FR')}</p>
                    </div>
                    {subscription.endDate && (
                      <div>
                        <p className="text-xs opacity-70">Fin</p>
                        <p className="font-600">{new Date(subscription.endDate).toLocaleDateString('fr-FR')}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs opacity-70">Renouvellement</p>
                      <p className="font-600">{subscription.autoRenew ? 'Automatique' : 'Manuel'}</p>
                    </div>
                  </div>
                  {subscription.notes && (
                    <p className="mt-3 text-xs opacity-80 bg-white/40 rounded-lg px-3 py-2">{subscription.notes}</p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center border border-dashed border-border rounded-xl">
                  <Icon name="CheckBadgeIcon" size={32} className="text-muted-foreground mb-3" />
                  <p className="text-sm font-500 text-foreground">Aucun abonnement actif</p>
                  <p className="text-xs text-muted-foreground mt-1">Activez un abonnement pour appliquer une remise automatique</p>
                </div>
              )}

              {/* Quick status change */}
              {subscription && (
                <div>
                  <h3 className="text-xs font-600 uppercase tracking-wide text-muted-foreground mb-2">Changer le statut</h3>
                  <div className="flex gap-2 flex-wrap">
                    {(['active', 'inactive', 'suspended', 'expired'] as const).map((s) => (
                      <button key={s} onClick={async () => {
                        const updated = await clientService.updateSubscription(subscription.id, { status: s });
                        if (updated) onSubscriptionUpdated(updated);
                      }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${subscription.status === s ? `${SUB_STATUS_CONFIG[s].color} border-current` : 'border-border text-muted-foreground hover:bg-muted'}`}>
                        {SUB_STATUS_CONFIG[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Box Beauté portal config */}
              {subscription && (
                <div className="border border-border rounded-xl p-4 space-y-3 bg-rose-50/40">
                  <h3 className="text-xs font-700 uppercase tracking-wide text-rose-600 flex items-center gap-1.5">
                    <Icon name="HeartIcon" size={13} />
                    Box Beauté — Portail client
                  </h3>

                  {/* Plan selector */}
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Formule</label>
                    <select
                      value={portalPlanId}
                      onChange={(e) => setPortalPlanId(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                    >
                      <option value="">— Choisir une formule —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — {p.price} €/mois · {p.quota_amount} € quota
                        </option>
                      ))}
                    </select>
                    {selectedPlan && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Livraison : {selectedPlan.shipping_free ? 'offerte' : `${selectedPlan.shipping_cost} €`}
                        {selectedPlan.description ? ` · ${selectedPlan.description}` : ''}
                      </p>
                    )}
                  </div>

                  {/* Portal phone */}
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Téléphone portail</label>
                    <input
                      type="tel"
                      value={portalPhone}
                      onChange={(e) => setPortalPhone(e.target.value)}
                      placeholder="Ex : 0692 00 00 00"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  {/* PIN */}
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Code PIN (4 chiffres)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={portalPin}
                        onChange={(e) => setPortalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="1234"
                        className="flex-1 px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 tracking-widest"
                      />
                      <button
                        onClick={handleGeneratePin}
                        className="px-3 py-2 border border-border rounded-lg text-xs font-600 text-muted-foreground hover:bg-muted transition-colors shrink-0"
                        title="Générer un PIN aléatoire"
                      >
                        <Icon name="ArrowPathIcon" size={14} />
                      </button>
                      {portalPin && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(portalPin); setPinCopied(true); setTimeout(() => setPinCopied(false), 1500); }}
                          className="px-3 py-2 border border-border rounded-lg text-xs font-600 text-muted-foreground hover:bg-muted transition-colors shrink-0"
                          title="Copier le PIN"
                        >
                          <Icon name={pinCopied ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Portal link */}
                  <div className="flex items-center gap-2 p-2.5 bg-white rounded-lg border border-border">
                    <span className="text-xs text-muted-foreground flex-1 truncate">{portalUrl}</span>
                    <a
                      href="/client-portal/login"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors shrink-0"
                      title="Ouvrir le portail"
                    >
                      <Icon name="ArrowTopRightOnSquareIcon" size={13} />
                    </a>
                  </div>

                  <button
                    onClick={handleSavePortal}
                    disabled={savingPortal}
                    className="w-full py-2 bg-rose-500 text-white rounded-lg text-sm font-600 hover:bg-rose-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {savingPortal
                      ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</>
                      : <><Icon name="CheckIcon" size={14} />Enregistrer le portail</>
                    }
                  </button>
                </div>
              )}

              {/* Form toggle */}
              <button onClick={() => setShowSubForm(!showSubForm)}
                className="w-full py-2.5 border border-primary text-primary rounded-xl text-sm font-600 hover:bg-primary/5 transition-colors flex items-center justify-center gap-2">
                <Icon name={subscription ? 'PencilIcon' : 'PlusIcon'} size={15} />
                {subscription ? 'Modifier l\'abonnement' : 'Activer un abonnement'}
              </button>

              {/* Subscription form */}
              {showSubForm && (
                <div className="border border-border rounded-xl p-4 space-y-3">
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Type d'abonnement</label>
                    <select value={subForm.subscriptionType} onChange={(e) => setSubForm((f) => ({ ...f, subscriptionType: e.target.value }))}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                      <option>Abonnement Pro -5%</option>
                      <option>Abonnement Pro -10%</option>
                      <option>Abonnement Premium -15%</option>
                      <option>Abonnement VIP personnalisé</option>
                      <option>Abonnement Standard</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-600 text-muted-foreground block mb-1">Réduction (%)</label>
                      <input type="number" min={0} max={100} value={subForm.discountPercent}
                        onChange={(e) => setSubForm((f) => ({ ...f, discountPercent: parseFloat(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-xs font-600 text-muted-foreground block mb-1">Statut</label>
                      <select value={subForm.status} onChange={(e) => setSubForm((f) => ({ ...f, status: e.target.value as any }))}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                        <option value="active">Actif</option>
                        <option value="inactive">Inactif</option>
                        <option value="suspended">Suspendu</option>
                        <option value="expired">Expiré</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-600 text-muted-foreground block mb-1">Date de début</label>
                      <input type="date" value={subForm.startDate}
                        onChange={(e) => setSubForm((f) => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                    <div>
                      <label className="text-xs font-600 text-muted-foreground block mb-1">Date de fin</label>
                      <input type="date" value={subForm.endDate}
                        onChange={(e) => setSubForm((f) => ({ ...f, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="autoRenew" checked={subForm.autoRenew}
                      onChange={(e) => setSubForm((f) => ({ ...f, autoRenew: e.target.checked }))}
                      className="w-4 h-4 rounded border-border text-primary" />
                    <label htmlFor="autoRenew" className="text-sm text-foreground">Renouvellement automatique</label>
                  </div>
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Notes internes</label>
                    <textarea value={subForm.notes} onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowSubForm(false)} className="flex-1 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
                      Annuler
                    </button>
                    <button onClick={handleSaveSubscription} disabled={savingSub}
                      className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
                      {savingSub ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />Enregistrer</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── NOTES ── */}
          {tab === 'notes' && (
            <div className="p-6 space-y-4">
              {/* Add note */}
              <div className="border border-border rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-600 text-foreground">Ajouter une note interne</h3>
                <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={3}
                  placeholder="Commentaire, préférence, information importante…"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
                <button onClick={handleAddNote} disabled={savingNote || !newNote.trim()}
                  className="w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
                  {savingNote ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="PlusIcon" size={14} />Ajouter la note</>}
                </button>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Icon name="ChatBubbleLeftEllipsisIcon" size={32} className="text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Aucune note interne</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.map((note) => (
                    <div key={note.id} className="border border-border rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-foreground flex-1">{note.content}</p>
                        <button onClick={() => handleDeleteNote(note.id)}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Icon name="UserIcon" size={11} className="text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">{note.author} · {new Date(note.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
