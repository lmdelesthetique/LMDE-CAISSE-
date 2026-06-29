'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import ProductGrid from './ProductGrid';
import CartPanel, { type CartPanelHandle, type GlobalDiscount } from './CartPanel';
import HeldTicketsDrawer from './HeldTicketsDrawer';
import PaymentModal from './PaymentModal';
import OuvertureCaisseModal from './OuvertureCaisseModal';
import ClientLookupBar from './ClientLookupBar';
import FreePriceModal from './FreePriceModal';
import LoyaltyRewardNotification from './LoyaltyRewardNotification';
import { AvailableRewardsModal, NewlyUnlockedRewardsModal, RewardAppliedBanner } from './LoyaltyRewardModals';
import { usePOSAuth } from '@/contexts/POSAuthContext';
import { toast } from 'sonner';
import Icon from '@/components/ui/AppIcon';
import { useBarcodeScanner, useCameraBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { fetchProductByBarcode, deductStockForSale, fetchProductStockById, fetchProductById } from '@/lib/services/stockService';
import {
  loyaltyService,
  detectUnlockedTiers,
  getNextTier,
  getCurrentTier,
  pointsToNextTier,
  type LoyaltyTier,
  type ClientLoyaltyReward,
} from '@/lib/services/loyaltyService';
import { generateTicketHTML, generateFactureHTML, loadSettingsFromCache, openAndPrint } from '@/lib/utils/ticketPrinter';
import { clientService, type Client as FullClient, type ClientPurchase, type ClientSubscription } from '@/lib/services/clientService';
import {
  sendReceiptEmail,
  generateTicketNumber,
  todayFR,
  type ReceiptEmailData,
} from '@/lib/services/emailService';
import { saveReceipt } from '@/lib/services/posService';
import { useSettings } from '@/contexts/SettingsContext';
import { deliveryService, type CreateDeliveryInput } from '@/lib/services/deliveryService';
import { useRouter } from 'next/navigation';
import { ShopifyOrderAlert, type ShopifyNewOrder } from '@/components/ShopifyOrderAlert';
import POSMarketingPanel from './POSMarketingPanel';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  sku: string;
  price: number;
  qty: number;
  discount: number;
  discountType: 'percent' | 'amount';
  tva: number;
  isFreePrice?: boolean;
  imageUrl?: string;
  variantName?: string;
  costPrice?: number;
  stock?: number;
  isReward?: boolean;
  originalPrice?: number;
  promoName?: string;
  isDemo?: boolean;
  isKit?: boolean;
  kitComponents?: Array<{ componentId: string; name: string; quantity: number; stock: number }>;
}

export interface HeldTicket {
  id: string;
  label: string;
  items: CartItem[];
  client?: string;
  heldAt: string;
}

export interface POSClient {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  points: number;
  balance: number;
  discount?: number;
  clientType?: string;
  subscriptionStatus?: string | null;
  subscriptionType?: string | null;
  avoirApplied?: boolean;
}

const TAX_RATE = 0.085; // fallback — overridden by settings context at runtime

// ─── Client Fiche Slide-Over ──────────────────────────────────────────────────
interface ClientFicheSlideOverProps {
  client: POSClient;
  allRewards: ClientLoyaltyReward[];
  loyaltyTiers: LoyaltyTier[];
  onClose: () => void;
  onPointsUpdated?: (newPoints: number) => void;
  onUseAvoir?: (amount: number) => void;
}

function ClientFicheSlideOver({ client, allRewards, loyaltyTiers, onClose, onPointsUpdated, onUseAvoir }: ClientFicheSlideOverProps) {
  const [fullClient, setFullClient] = useState<FullClient | null>(null);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [loading, setLoading] = useState(true);

  // Local display points (updated immediately after save, without closing slide-over)
  const [displayPoints, setDisplayPoints] = useState(client.points);
  const [showEditPoints, setShowEditPoints] = useState(false);
  const [newPointsInput, setNewPointsInput] = useState('');
  const [pointsReason, setPointsReason] = useState('Correction manuelle');
  const [savingPoints, setSavingPoints] = useState(false);

  // Parrainage
  const [sendingReferral, setSendingReferral] = useState(false);
  const [referralSent, setReferralSent] = useState(false);
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [generatingReferral, setGeneratingReferral] = useState(false);

  const handleSendReferralEmail = async () => {
    setSendingReferral(true);
    try {
      await fetch('/api/subscriptions/send-referral-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      setReferralSent(true);
      setTimeout(() => setReferralSent(false), 5000);
    } catch {}
    setSendingReferral(false);
  };

  const handleGenerateReferral = async () => {
    setGeneratingReferral(true);
    try {
      const res = await fetch(`/api/clients/${client.id}/generate-referral-code`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.referral_code) {
        setFullClient(prev => prev ? { ...prev, referralCode: json.referral_code } : prev);
      }
    } catch {}
    setGeneratingReferral(false);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [fc, purch, sub] = await Promise.all([
        clientService.getById(client.id),
        clientService.getPurchases(client.id),
        clientService.getSubscription(client.id),
      ]);
      setFullClient(fc);
      setPurchases((purch ?? []).slice(0, 10));
      setSubscription(sub);
      setLoading(false);
    })();
  }, [client.id]);

  const handleSavePoints = async () => {
    const newVal = parseInt(newPointsInput, 10);
    if (isNaN(newVal) || newVal < 0) return;
    setSavingPoints(true);
    const delta = newVal - displayPoints;
    const result = await clientService.adjustLoyaltyPoints(
      client.id,
      delta,
      `${pointsReason} (manuel) — ${displayPoints} → ${newVal} pts`
    );
    if (result.ok) {
      const prev = displayPoints;
      setDisplayPoints(newVal);
      onPointsUpdated?.(newVal);
      setShowEditPoints(false);
      setNewPointsInput('');
      toast.success(`Points mis à jour : ${prev} → ${newVal}`, { duration: 3000, icon: '⭐' });
    } else {
      toast.error(`Erreur : ${result.error ?? 'mise à jour des points échouée'}`, { duration: 6000 });
    }
    setSavingPoints(false);
  };

  const nextTier = loyaltyTiers.length > 0 ? getNextTier(loyaltyTiers, displayPoints) : null;
  const ptsToNext = loyaltyTiers.length > 0 ? pointsToNextTier(loyaltyTiers, displayPoints) : 0;
  const currentTier = loyaltyTiers.length > 0 ? getCurrentTier(loyaltyTiers, displayPoints) : null;

  // Load rewards independently so the slide-over always has them regardless of
  // whether handleClientSelect ran the backfill before the slide-over opened.
  const [localRewards, setLocalRewards] = useState<ClientLoyaltyReward[]>([]);
  useEffect(() => {
    fetch(`/api/loyalty/client-rewards?clientId=${client.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.all) setLocalRewards(json.all.map((r: any) => ({
        id: r.id, clientId: r.client_id, tierId: r.tier_id ?? null,
        rewardType: r.reward_type, rewardDescription: r.reward_description,
        rewardValue: parseFloat(r.reward_value ?? 0), rewardProductId: r.reward_product_id ?? null,
        status: r.status, unlockedAt: r.unlocked_at, pointsAtUnlock: r.points_at_unlock ?? 0,
        expiryDate: r.expiry_date ?? null, usedAt: r.used_at ?? null,
        ticketRef: r.ticket_ref ?? null, cashierName: r.cashier_name ?? null,
        notes: r.notes ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
      }))); })
      .catch(() => {});
  }, [client.id]);

  const dbRewards = localRewards.length > 0 ? localRewards : allRewards;
  // Fallback: compute earned tiers from points vs thresholds when no DB rows exist yet
  const computedRewards: ClientLoyaltyReward[] = dbRewards.length === 0 && loyaltyTiers.length > 0
    ? loyaltyTiers
        .filter(t => t.isActive !== false && displayPoints >= t.pointsRequired)
        .map(t => ({
          id: `computed-${t.id}`,
          clientId: client.id,
          tierId: t.id,
          rewardType: t.rewardType,
          rewardDescription: t.rewardDescription,
          rewardValue: t.rewardValue,
          rewardProductId: t.rewardProductId ?? null,
          status: 'available' as const,
          unlockedAt: new Date().toISOString(),
          pointsAtUnlock: t.pointsRequired,
          expiryDate: null,
          usedAt: null,
          ticketRef: null,
          cashierName: null,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
    : [];
  const displayRewards = dbRewards.length > 0 ? dbRewards : computedRewards;
  const availableCount = displayRewards.filter((r) => r.status === 'available').length;

  const TYPE_LABELS: Record<string, string> = {
    particulier: 'Particulier', professionnel: 'Pro', vip: 'VIP',
    abonne: 'Abonné', non_abonne: 'Non abonné',
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-blue-50 shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 text-sm font-600 text-blue-700 hover:text-blue-900 transition-colors">
            <Icon name="ArrowLeftIcon" size={15} /> Retour à la caisse
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-blue-100 text-blue-400 hover:text-blue-700 transition-colors">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Identity */}
            <div className="p-4 border-b border-border">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-xl font-700 text-blue-700">{client.name.charAt(0).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-base font-700 text-foreground">{client.name}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {client.clientType && (
                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                        {TYPE_LABELS[client.clientType] ?? client.clientType}
                      </span>
                    )}
                    {client.subscriptionStatus === 'active' && (
                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                        <Icon name="CheckBadgeIcon" size={10} /> {client.subscriptionType ?? 'Abonné'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                {fullClient?.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon name="EnvelopeIcon" size={12} className="shrink-0" />
                    <span>{fullClient.email}</span>
                  </div>
                )}
                {client.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon name="PhoneIcon" size={12} className="shrink-0" />
                    <span>{client.phone}</span>
                  </div>
                )}
                {fullClient?.address && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon name="MapPinIcon" size={12} className="shrink-0" />
                    <span>{[fullClient.address, fullClient.city, fullClient.postalCode].filter(Boolean).join(', ')}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Loyalty */}
            <div className="p-4 border-b border-border">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Fidélité</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center relative">
                  <p className="text-xl font-700 text-amber-700 tabular-nums">{displayPoints.toLocaleString('fr-FR')}</p>
                  <p className="text-[10px] text-amber-600">Points</p>
                  <button
                    onClick={() => { setShowEditPoints((v) => !v); setNewPointsInput(String(displayPoints)); }}
                    className="absolute top-1.5 right-1.5 p-1 rounded hover:bg-amber-200 text-amber-500 hover:text-amber-800 transition-colors"
                    title="Modifier les points"
                  >
                    <Icon name="PencilIcon" size={10} />
                  </button>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                  <p className="text-sm font-700 text-amber-700 leading-tight">{currentTier?.name ?? '—'}</p>
                  <p className="text-[10px] text-amber-600">Palier</p>
                </div>
              </div>

              {/* Inline edit points form */}
              {showEditPoints && (
                <div className="mb-2 p-3 bg-white border border-amber-200 rounded-xl shadow-sm">
                  <p className="text-xs font-700 text-foreground mb-2">Modifier les points</p>
                  <p className="text-[11px] text-muted-foreground mb-2">Solde actuel : <strong>{displayPoints} pts</strong></p>
                  <div className="mb-2">
                    <label className="text-[10px] font-600 text-muted-foreground block mb-1">Nouveau solde</label>
                    <input
                      type="number"
                      min={0}
                      value={newPointsInput}
                      onChange={(e) => setNewPointsInput(e.target.value)}
                      placeholder="Ex: 750"
                      className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                  </div>
                  <div className="mb-3">
                    <label className="text-[10px] font-600 text-muted-foreground block mb-1">Raison</label>
                    <select
                      value={pointsReason}
                      onChange={(e) => setPointsReason(e.target.value)}
                      className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300"
                    >
                      <option value="Correction manuelle">Correction manuelle</option>
                      <option value="Geste commercial">Geste commercial</option>
                      <option value="Migration points">Migration points</option>
                      <option value="Autre">Autre</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowEditPoints(false); setNewPointsInput(''); }}
                      className="flex-1 py-1.5 border border-border rounded-lg text-xs font-600 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleSavePoints}
                      disabled={savingPoints || newPointsInput === '' || parseInt(newPointsInput, 10) < 0}
                      className="flex-1 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-700 hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center justify-center gap-1"
                    >
                      {savingPoints ? <Icon name="ArrowPathIcon" size={11} className="animate-spin" /> : <Icon name="CheckIcon" size={11} />}
                      Enregistrer
                    </button>
                  </div>
                </div>
              )}

              {nextTier && ptsToNext > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-muted-foreground">Prochaine récompense : {nextTier.name}</span>
                    <span className="text-[10px] font-600 text-amber-600">{ptsToNext} pts</span>
                  </div>
                  <div className="h-1.5 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(3, ((displayPoints - (currentTier?.pointsRequired ?? 0)) / Math.max(1, nextTier.pointsRequired - (currentTier?.pointsRequired ?? 0))) * 100))}%` }}
                    />
                  </div>
                </div>
              )}
              {client.balance > 0 && !client.avoirApplied && (
                <div className="mt-2 flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                  <div>
                    <p className="text-xs text-emerald-700 font-500">Avoir disponible</p>
                    <p className="text-sm font-700 tabular-nums text-emerald-700">{client.balance.toFixed(2)} €</p>
                  </div>
                  {onUseAvoir && (
                    <button
                      onClick={() => onUseAvoir(client.balance)}
                      className="text-[11px] font-700 px-2.5 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                      Utiliser
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Subscription */}
            {subscription && (
              <div className="p-4 border-b border-border">
                <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Abonnement</p>
                <div className={`rounded-lg px-3 py-2 flex items-center justify-between border ${subscription.status === 'active' ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30 border-border'}`}>
                  <div>
                    <p className="text-sm font-600 text-foreground">{subscription.subscriptionType}</p>
                    {subscription.endDate && (
                      <p className="text-[10px] text-muted-foreground">Expire : {new Date(subscription.endDate).toLocaleDateString('fr-FR')}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full ${subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                    {subscription.status === 'active' ? 'Actif' : 'Inactif'}
                  </span>
                </div>
              </div>
            )}

            {/* Rewards */}
            {displayRewards.length > 0 && (
              <div className="p-4 border-b border-border">
                <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">
                  Récompenses{availableCount > 0 && <span className="text-violet-600 font-700"> · {availableCount} disponible{availableCount > 1 ? 's' : ''}</span>}
                </p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {displayRewards.map((r) => {
                    const isAvail = r.status === 'available';
                    return (
                      <div key={r.id} className="flex items-center gap-2 bg-muted/20 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-600 text-foreground truncate">{r.rewardDescription}</p>
                          <p className="text-[10px] text-muted-foreground">{r.pointsAtUnlock} pts</p>
                        </div>
                        <span className={`shrink-0 text-[9px] font-700 px-1.5 py-0.5 rounded-full ${isAvail ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {isAvail ? 'DISPO' : 'UTILISÉE'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Parrainage */}
            <div className="p-4 border-b border-border">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Parrainage</p>
              {fullClient?.referralCode ? (
                <div className="space-y-2">
                  <div className="bg-pink-50 border border-pink-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-pink-500 font-600 mb-1">Code parrainage</p>
                    <p className="text-xl font-900 text-pink-600 tracking-[6px] font-mono">{fullClient.referralCode}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-sm font-700 text-foreground">{fullClient.referralCount ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Filleul{(fullClient.referralCount ?? 0) > 1 ? 's' : ''}</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-sm font-700 text-amber-600">{fullClient.referralPointsEarned ?? 0} pts</p>
                      <p className="text-[10px] text-muted-foreground">Pts gagnés</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`https://mondedelesthetique.fr/?ref=${fullClient.referralCode}`);
                        setCopiedReferral(true);
                        setTimeout(() => setCopiedReferral(false), 2000);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 border border-pink-200 rounded-lg text-xs font-600 text-pink-600 hover:bg-pink-50 transition-colors"
                    >
                      <Icon name={copiedReferral ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={12} />
                      {copiedReferral ? 'Copié !' : 'Copier'}
                    </button>
                    <button
                      onClick={handleSendReferralEmail}
                      disabled={sendingReferral || !fullClient?.email}
                      title={!fullClient?.email ? 'Aucun email dans la fiche' : 'Envoyer le code par email'}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-pink-500 text-white rounded-lg text-xs font-600 hover:bg-pink-600 disabled:opacity-50 transition-colors"
                    >
                      {sendingReferral
                        ? <Icon name="ArrowPathIcon" size={12} className="animate-spin" />
                        : <Icon name="EnvelopeIcon" size={12} />}
                      {sendingReferral ? 'Envoi…' : referralSent ? 'Envoyé ✓' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateReferral}
                  disabled={generatingReferral}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-pink-50 border border-dashed border-pink-300 rounded-xl text-xs font-600 text-pink-600 hover:bg-pink-100 disabled:opacity-50 transition-colors"
                >
                  {generatingReferral
                    ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" />
                    : <Icon name="GiftIcon" size={13} />}
                  {generatingReferral ? 'Génération…' : 'Générer un code parrainage'}
                </button>
              )}
            </div>

            {/* Purchase history */}
            <div className="p-4">
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">10 derniers achats</p>
              {purchases.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Aucun achat enregistré</p>
              ) : (
                <div className="space-y-1.5">
                  {purchases.map((p) => (
                    <div key={p.id} className="flex items-center justify-between bg-muted/20 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-500 text-foreground">
                          {new Date(p.purchasedAt).toLocaleDateString('fr-FR')} · {p.receiptNumber}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{p.paymentMethod}</p>
                      </div>
                      <span className="text-xs font-700 tabular-nums text-foreground ml-2 shrink-0">{p.totalTtc.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              )}
              {(fullClient || purchases.length > 0) && (() => {
                const computedVisits = purchases.length > 0 ? purchases.length : (fullClient?.totalVisits ?? 0);
                const computedSpent = purchases.length > 0
                  ? purchases.reduce((s, p) => s + p.totalTtc, 0)
                  : (fullClient?.totalSpent ?? 0);
                return (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-sm font-700 tabular-nums text-foreground">{computedVisits}</p>
                      <p className="text-[10px] text-muted-foreground">Visites</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-sm font-700 tabular-nums text-foreground">{computedSpent.toFixed(2)} €</p>
                      <p className="text-[10px] text-muted-foreground">Total dépensé</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function calcItemTotal(item: CartItem): number {
  const base = item.price * item.qty;
  const disc = item.discountType === 'percent' ? base * (item.discount / 100) : item.discount;
  return Math.max(0, base - disc);
}

export default function POSTerminal() {
  const { employee, isLocked, logout, changeEmployee, logAction } = usePOSAuth();
  const router = useRouter();
  const [showEmployeeMenu, setShowEmployeeMenu] = useState(false);
  const { tvaRate: settingsTvaRate } = useSettings();
  // Use live TVA rate from settings (e.g. 8.5% → 0.085)
  const LIVE_TAX_RATE = settingsTvaRate;

  // ── Shopify new order alerts ───────────────────────────────────────────────
  const [newShopifyOrders, setNewShopifyOrders] = useState<ShopifyNewOrder[]>([]);
  const lastCheckedRef = useRef<string>(new Date().toISOString());

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(600, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch { /* sound not critical */ }
  }, []);

  const checkNewShopifyOrders = useCallback(async () => {
    try {
      const res = await fetch(`/api/shopify/orders/new?since=${encodeURIComponent(lastCheckedRef.current)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.orders?.length > 0) {
        setNewShopifyOrders(data.orders);
        lastCheckedRef.current = new Date().toISOString();
        playNotificationSound();
      }
    } catch { /* non-blocking */ }
  }, [playNotificationSound]);

  useEffect(() => {
    checkNewShopifyOrders();
    const interval = setInterval(checkNewShopifyOrders, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkNewShopifyOrders]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const isDemoCart = cart.some(i => i.isDemo);
  const [globalDiscount, setGlobalDiscount] = useState<GlobalDiscount | null>(null);
  // Avoir manual entry
  const [showAvoirInput, setShowAvoirInput] = useState(false);
  const [avoirInputValue, setAvoirInputValue] = useState('');
  const [avoirLookupLoading, setAvoirLookupLoading] = useState(false);
  const [avoirLookupError, setAvoirLookupError] = useState<string | null>(null);
  // Referral (parrainage) state
  const [showReferralInput, setShowReferralInput] = useState(false);
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [referralCodeLoading, setReferralCodeLoading] = useState(false);
  const [referralCodeError, setReferralCodeError] = useState<string | null>(null);
  const [clientReferralCode, setClientReferralCode] = useState<string | undefined>(undefined);
  const [referralValidated, setReferralValidated] = useState<{ parrainId: string; firstName: string; code: string } | null>(null);
  const [pendingReferral, setPendingReferral] = useState<{ referralId: string; parrainId: string; discountPct: number } | null>(null);
  const [demoProductRef, setDemoProductRef] = useState<{ id: string; name: string; ref: string } | null>(null);
  const [client, setClient] = useState<POSClient | null>(null);
  const [heldTickets, setHeldTickets] = useState<HeldTicket[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showFreePrice, setShowFreePrice] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'immediate' | 'acompte' | 'installment'>('immediate');
  const cartPanelRef = useRef<CartPanelHandle>(null);

  const openPayment = useCallback((mode: 'immediate' | 'acompte' | 'installment') => {
    cartPanelRef.current?.applyPendingDiscount();
    setPaymentMode(mode);
    setShowPayment(true);
  }, []);

  // ── Fond de caisse ────────────────────────────────────────────────────────
  const [sessionChecked, setSessionChecked] = useState(false);
  const [showOuverture, setShowOuverture] = useState(false);
  const [caisseSession, setCaisseSession] = useState<{ fond_ouverture: number; cash_in_today: number } | null>(null);

  useEffect(() => {
    fetch('/api/caisse/sessions')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.fond_ouverture !== undefined) {
          setCaisseSession(data);
          setShowOuverture(false);
        } else {
          setShowOuverture(true);
        }
      })
      .catch(() => setShowOuverture(false))
      .finally(() => setSessionChecked(true));
  }, []);

  const handleOuvertureConfirm = async (fond: number, detail: Record<string, number>) => {
    try {
      const res = await fetch('/api/caisse/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fond_ouverture: fond, fond_detail: detail, caissier_name: employee?.fullName || 'Caisse' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Erreur');
      const session = await res.json();
      setCaisseSession({ fond_ouverture: session.fond_ouverture, cash_in_today: 0 });
      setShowOuverture(false);
      toast.success(`✓ Caisse ouverte avec ${fond.toFixed(2)} € de fond`);
    } catch (e: any) {
      toast.error(`Erreur ouverture : ${e?.message ?? 'inconnue'}`);
      throw e;
    }
  };

  const tiroir = caisseSession
    ? caisseSession.fond_ouverture + (caisseSession.cash_in_today ?? 0)
    : null;

  // Camera scanner state
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [cameraManualBarcode, setCameraManualBarcode] = useState('');
  const [paying, setPaying] = useState(false);

  // Loyalty state
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [loyaltyNotification, setLoyaltyNotification] = useState<{
    unlockedTiers: LoyaltyTier[];
    nextTier: LoyaltyTier | null;
    pointsToNext: number;
    currentPoints: number;
    pointsEarned: number;
  } | null>(null);

  // Available rewards state (shown when client is selected)
  const [availableRewards, setAvailableRewards] = useState<ClientLoyaltyReward[]>([]);
  const [showAvailableRewards, setShowAvailableRewards] = useState(false);
  const [appliedReward, setAppliedReward] = useState<ClientLoyaltyReward | null>(null);
  const [allClientRewards, setAllClientRewards] = useState<ClientLoyaltyReward[]>([]);
  const [showAllRewards, setShowAllRewards] = useState(false);
  const [showClientFiche, setShowClientFiche] = useState(false);
  // Newly unlocked rewards (shown after payment)
  const [newlyUnlockedRewards, setNewlyUnlockedRewards] = useState<{
    rewards: ClientLoyaltyReward[];
    nextTier: LoyaltyTier | null;
    pointsToNext: number;
    currentPoints: number;
    pointsEarned: number;
  } | null>(null);

  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'found' | 'notfound'>('idle');
  const [showMarketing, setShowMarketing] = useState(false);

  // Load loyalty tiers + demo product on mount
  useEffect(() => {
    fetch('/api/loyalty/tiers')
      .then(r => r.ok ? r.json() : [])
      .then(tiers => { if (Array.isArray(tiers)) setLoyaltyTiers(tiers); })
      .catch(() => loyaltyService.getTiers().then(setLoyaltyTiers));
    import('@/lib/supabase/client').then(({ createClient }) => {
      createClient()
        .from('products')
        .select('id, name, ref')
        .eq('ref', 'DEMO-001')
        .eq('is_demo', true)
        .maybeSingle()
        .then(({ data }) => { if (data) setDemoProductRef(data as { id: string; name: string; ref: string }); });
    });
  }, []);

  const addToCart = useCallback(async (product: { id: string; name: string; sku: string; price: number; imageUrl?: string; stock?: number; variantName?: string; costPrice?: number; promoDiscount?: number; promoDiscountType?: 'percent' | 'amount'; promoName?: string; isDemo?: boolean; isKit?: boolean; kitComponents?: CartItem['kitComponents'] }) => {
    // Fetch stock for display purposes only — never blocks the sale
    let availableStock = product.stock;
    if (product.stock === undefined && !product.id.startsWith('free-')) {
      const stockInfo = await fetchProductStockById(product.id);
      if (stockInfo !== null) availableStock = stockInfo.stock;
    }

    setCart((prev) => {
      // Kits with custom components always create a new line (not merged)
      const existing = !product.isKit
        ? prev.find((i) => i.productId === product.id && i.variantName === product.variantName && !i.isFreePrice)
        : undefined;
      if (existing) {
        return prev.map((i) => i.productId === product.id && i.variantName === product.variantName && !i.isFreePrice ? { ...i, qty: i.qty + 1 } : i);
      }
      const displayName = product.variantName ? `${product.name} — ${product.variantName}` : product.name;
      return [...prev, {
        id: `ci-${product.id}-${product.variantName ?? ''}-${Date.now()}`,
        productId: product.id,
        name: displayName,
        sku: product.sku,
        price: product.price,
        qty: 1,
        discount: product.promoDiscount ?? 0,
        discountType: product.promoDiscountType ?? 'percent',
        tva: LIVE_TAX_RATE,
        imageUrl: product.imageUrl,
        variantName: product.variantName,
        costPrice: product.costPrice,
        stock: availableStock,
        promoName: product.promoName,
        isDemo: product.isDemo || false,
        isKit: product.isKit || false,
        kitComponents: product.kitComponents,
      }];
    });
  }, [cart]);

  // ── Barcode scanner handler ───────────────────────────────────────────────
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setBarcodeStatus('scanning');
    const product = await fetchProductByBarcode(barcode);
    if (product) {
      await addToCart({
        id: product.id,
        name: product.name,
        sku: product.ref,
        price: product.sellPriceTtc,
        imageUrl: product.imageUrl || undefined,
        stock: product.stock,
        costPrice: product.costPrice,
      });
      setBarcodeStatus('found');
      toast.success(`📦 ${product.name} ajouté au panier`, { duration: 2000 });
    } else {
      setBarcodeStatus('notfound');
      toast.error(
        `Code-barres non reconnu : ${barcode}`,
        {
          duration: 4000,
          description: 'Vérifiez la référence ou créez le produit dans la gestion produits',
        }
      );
    }
    setTimeout(() => setBarcodeStatus('idle'), 1500);
  }, [addToCart]);

  useBarcodeScanner({ onScan: handleBarcodeScan, enabled: !isLocked && !showCameraScanner });

  // Camera scanner
  const cameraScanner = useCameraBarcodeScanner({
    onScan: async (barcode) => {
      await handleBarcodeScan(barcode);
    },
    enabled: showCameraScanner,
  });

  const handleOpenCamera = useCallback(async () => {
    setShowCameraScanner(true);
    await cameraScanner.startCamera();
  }, [cameraScanner]);

  const handleCloseCamera = useCallback(() => {
    cameraScanner.stopCamera();
    setShowCameraScanner(false);
    setCameraManualBarcode('');
  }, [cameraScanner]);

  const addFreePriceItem = useCallback((name: string, price: number) => {
    const id = `free-${Date.now()}`;
    setCart((prev) => [...prev, {
      id,
      productId: id,
      name,
      sku: 'PRIX-LIBRE',
      price,
      qty: 1,
      discount: 0,
      discountType: 'percent',
      tva: LIVE_TAX_RATE,
      isFreePrice: true,
    }]);
    setShowFreePrice(false);
    toast.success(`"${name}" ajouté au panier`);
    logAction('free_price', `Article prix libre ajouté : ${name}`, price, { name, price });
  }, [logAction]);

  // ── Handle client selection: load available rewards ───────────────────────
  const handleClientSelect = useCallback(async (posClient: import('./POSTerminal').POSClient) => {
    setClient(posClient);
    setAppliedReward(null);
    setClientReferralCode(undefined);
    // Non-blocking fetch of referral code for ticket printing
    fetch(`/api/clients/${posClient.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.referral_code) setClientReferralCode(data.referral_code); })
      .catch(() => {});
    // Notify cashier immediately if client has store credit (avoir)
    if (posClient.balance > 0) {
      toast(`💳 ${posClient.name} a un avoir de ${posClient.balance.toFixed(2)} € disponible`, {
        duration: 5000,
        style: { background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7' },
      });
    }
    // Use server API to backfill any tier rewards the client earned outside
    // the POS flow (manual point adjustments, imports, etc.), then return
    // the up-to-date list of available rewards.
    try {
      const res = await fetch(`/api/loyalty/client-rewards?clientId=${posClient.id}`);
      if (res.ok) {
        const json = await res.json();
        const available: ClientLoyaltyReward[] = (json.available ?? []).map((r: any) => ({
          id: r.id,
          clientId: r.client_id,
          tierId: r.tier_id ?? null,
          rewardType: r.reward_type,
          rewardDescription: r.reward_description,
          rewardValue: parseFloat(r.reward_value ?? 0),
          rewardProductId: r.reward_product_id ?? null,
          status: r.status,
          unlockedAt: r.unlocked_at,
          pointsAtUnlock: r.points_at_unlock ?? 0,
          expiryDate: r.expiry_date ?? null,
          usedAt: r.used_at ?? null,
          ticketRef: r.ticket_ref ?? null,
          cashierName: r.cashier_name ?? null,
          notes: r.notes ?? null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        const all: ClientLoyaltyReward[] = (json.all ?? []).map((r: any) => ({
          id: r.id,
          clientId: r.client_id,
          tierId: r.tier_id ?? null,
          rewardType: r.reward_type,
          rewardDescription: r.reward_description,
          rewardValue: parseFloat(r.reward_value ?? 0),
          rewardProductId: r.reward_product_id ?? null,
          status: r.status,
          unlockedAt: r.unlocked_at,
          pointsAtUnlock: r.points_at_unlock ?? 0,
          expiryDate: r.expiry_date ?? null,
          usedAt: r.used_at ?? null,
          ticketRef: r.ticket_ref ?? null,
          cashierName: r.cashier_name ?? null,
          notes: r.notes ?? null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
        setAvailableRewards(available);
        setAllClientRewards(all);
        if (available.length > 0) setShowAvailableRewards(true);
        return;
      }
    } catch { /* fall through to direct fetch */ }
    // Fallback: direct Supabase fetch (no backfill)
    const rewards = await loyaltyService.getClientAvailableRewards(posClient.id);
    setAvailableRewards(rewards);
    if (rewards.length > 0) setShowAvailableRewards(true);
    const allRewards = await loyaltyService.getClientRewards(posClient.id);
    setAllClientRewards(allRewards);

    // Check for pending referral discount (filleul who hasn't used their -10% yet)
    try {
      const refRes = await fetch(`/api/referrals?clientId=${posClient.id}&role=filleul`);
      if (refRes.ok) {
        const refs = await refRes.json();
        const pending = (refs as any[]).find((r: any) => r.statut === 'valide' && !r.filleul_discount_used);
        if (pending) {
          setPendingReferral({ referralId: pending.id, parrainId: pending.parrain_id ?? pending.parrain?.id, discountPct: pending.filleul_discount_percent ?? 10 });
          toast(`🤝 ${posClient.name} a une réduction parrainage -${pending.filleul_discount_percent ?? 10}% disponible !`, {
            duration: 5000,
            style: { background: '#fdf2f8', color: '#86198f', border: '1px solid #f0abfc' },
          });
        }
      }
    } catch { /* non-blocking */ }
  }, []);

  const handleClientClear = useCallback(() => {
    setClient(null);
    setAppliedReward(null);
    setAvailableRewards([]);
    setShowAvailableRewards(false);
    setClientReferralCode(undefined);
    setAllClientRewards([]);
    setShowAllRewards(false);
    setPendingReferral(null);
    if (globalDiscount?.isReferral) setGlobalDiscount(null);
  }, [globalDiscount]);

  const handleAvoirLookup = useCallback(async () => {
    const num = avoirInputValue.trim();
    if (!num) return;
    setAvoirLookupLoading(true);
    setAvoirLookupError(null);
    try {
      const res = await fetch(`/api/returns/lookup?numero=${encodeURIComponent(num)}`);
      const data = await res.json();
      if (!res.ok) { setAvoirLookupError(data.error ?? 'Avoir introuvable'); return; }
      setGlobalDiscount({ type: 'amount', value: data.amount, isAvoir: true, avoirRecordId: data.id });
      setShowAvoirInput(false);
      setAvoirInputValue('');
      setAvoirLookupError(null);
      toast.success(`Avoir ${data.avoirNumber} — ${data.amount.toFixed(2)} € appliqué${data.clientName ? ` (${data.clientName})` : ''}`, { duration: 3000 });
    } catch {
      setAvoirLookupError('Erreur réseau');
    } finally {
      setAvoirLookupLoading(false);
    }
  }, [avoirInputValue]);

  // ── Referral code validation ──────────────────────────────────────────────
  const handleReferralValidate = useCallback(async () => {
    const code = referralCodeInput.trim().toUpperCase();
    if (!code) return;
    setReferralCodeLoading(true);
    setReferralCodeError(null);
    try {
      const res = await fetch('/api/referrals/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, filleulId: client?.id ?? null }),
      });
      const data = await res.json();
      if (!data.valid) {
        setReferralCodeError(data.error ?? 'Code invalide');
        return;
      }
      setReferralValidated({ parrainId: data.parrain.id, firstName: data.parrain.firstName, code });
      setGlobalDiscount({ type: 'percent', value: 10, isReferral: true, parrainId: data.parrain.id, referralCode: code });
      setShowReferralInput(false);
      toast.success(`Code parrainage de ${data.parrain.firstName} validé — -10% appliqué !`, { duration: 4000 });
    } catch {
      setReferralCodeError('Erreur réseau');
    } finally {
      setReferralCodeLoading(false);
    }
  }, [referralCodeInput, client]);

  // ── Handle reward use now ─────────────────────────────────────────────────
   const handleUseRewardNow = useCallback(async (reward: ClientLoyaltyReward) => {
    setAppliedReward(reward);
    setShowAvailableRewards(false);

    if ((reward.rewardType === 'free_product' || reward.rewardType === 'surprise_gift') && reward.rewardProductId) {
      const rewardProd = await loyaltyService.getRewardProductById(reward.rewardProductId);
      if (rewardProd) {
        // Try to find real product by SKU first, fall back to reward product data
        let cartName = `🎁 ${rewardProd.productName} (offert)`;
        let cartSku = rewardProd.sku ?? '';
        let cartImage: string | undefined;
        let cartStock: number | undefined;
        let cartOriginalPrice: number | undefined;

        if (rewardProd.sku) {
          try {
            const byBarcode = await fetchProductByBarcode(rewardProd.sku);
            if (byBarcode) {
              cartName = `🎁 ${byBarcode.name} (offert)`;
              cartSku = byBarcode.ref;
              cartImage = byBarcode.imageUrl || undefined;
              cartStock = byBarcode.stock;
              cartOriginalPrice = byBarcode.sellPriceTtc;
            }
          } catch { /* use rewardProd data */ }
        }

        setCart((prev) => [
          ...prev,
          {
            id: `reward-${reward.id}`,
            productId: reward.rewardProductId ?? `reward-${reward.id}`,
            name: cartName,
            sku: cartSku,
            price: 0,
            qty: 1,
            discount: 0,
            discountType: 'percent' as const,
            tva: LIVE_TAX_RATE,
            imageUrl: cartImage,
            stock: cartStock,
            isReward: true,
            originalPrice: cartOriginalPrice,
          },
        ]);
        toast.success(`🎁 ${rewardProd.productName} ajouté au panier (offert)`, { duration: 3000 });
        return;
      }
      toast.warning(
        'Aucun produit lié à cette récompense. Configurez-le dans Fidélité → Produits récompenses.',
        { duration: 5000 }
      );
    } else {
      toast.success(`🎁 Récompense appliquée : ${reward.rewardDescription}`, { duration: 3000 });
    }
  }, []);


  // ── Handle keep reward for later ──────────────────────────────────────────
  const handleKeepRewardForLater = useCallback(() => {
    setShowAvailableRewards(false);
    if (availableRewards.length > 0) {
      toast.info(`Récompense conservée pour plus tard`, { duration: 2500, icon: '🕐' });
    }
  }, [availableRewards.length]);

   // ── Remove applied reward from cart ─────────────────────────────────────────────────────────────
  const handleRemoveAppliedReward = useCallback(() => {
    if (appliedReward) {
      setCart((prev) => prev.filter((i) => i.id !== `reward-${appliedReward.id}`));
    }
    setAppliedReward(null);
    toast.info('Récompense retirée du panier');
  }, [appliedReward]);


  const updateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      setCart((prev) => prev.filter((i) => i.id !== id));
    } else {
      setCart((prev) => prev.map((i) => i.id === id ? { ...i, qty } : i));
    }
  }, []);

  const updateDiscount = useCallback((id: string, discount: number, type: 'percent' | 'amount') => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item && discount > 0) {
        logAction(
          'discount',
          `Remise appliquée sur "${item.name}" : ${discount}${type === 'percent' ? '%' : '€'}`,
          discount,
          { itemId: id, itemName: item.name, discountType: type }
        );
      }
      return prev.map((i) => i.id === id ? { ...i, discount, discountType: type } : i);
    });
  }, [logAction]);

  const updatePrice = useCallback((id: string, newPrice: number) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        logAction(
          'price_change',
          `Prix modifié pour "${item.name}" : ${item.price.toFixed(2)}€ → ${newPrice.toFixed(2)}€`,
          newPrice,
          { itemId: id, itemName: item.name, oldPrice: item.price, newPrice }
        );
      }
      return prev.map((i) => i.id === id ? { ...i, price: newPrice } : i);
    });
    toast.success('Prix modifié et enregistré dans l\'historique');
  }, [logAction]);

  const removeItem = useCallback((id: string) => {
    setCart((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) {
        logAction('cancel', `Article supprimé du panier : "${item.name}"`, item.price * item.qty, { itemId: id, itemName: item.name });
      }
      return prev.filter((i) => i.id !== id);
    });
  }, [logAction]);

  const holdTicket = useCallback(() => {
    if (cart.length === 0) return;
    const ticket: HeldTicket = {
      id: `held-${Date.now()}`,
      label: `Ticket mis en attente`,
      items: [...cart],
      client: client?.name,
      heldAt: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    };
    setHeldTickets((prev) => [...prev, ticket]);
    const total = cart.reduce((s, i) => s + calcItemTotal(i), 0);
    logAction('hold', `Ticket mis en attente${client ? ` — Client : ${client.name}` : ''}`, total, { itemsCount: cart.length, clientName: client?.name });
    setCart([]);
    setClient(null);
    setGlobalDiscount(null);
    toast.success('Ticket mis en attente');
  }, [cart, client, logAction]);

  const recallTicket = useCallback((ticket: HeldTicket) => {
    setCart(ticket.items);
    setHeldTickets((prev) => prev.filter((t) => t.id !== ticket.id));
    setShowHeld(false);
    toast.info(`Ticket ${ticket.label} récupéré`);
  }, []);

  const clearCart = useCallback(() => {
    if (cart.length > 0) {
      const total = cart.reduce((s, i) => s + calcItemTotal(i), 0);
      logAction('cancel', `Ticket annulé${client ? ` — Client : ${client.name}` : ''}`, total, { itemsCount: cart.length, clientName: client?.name });
    }
    setCart([]);
    setClient(null);
    setGlobalDiscount(null);
  }, [cart, client, logAction]);

  const handleLogout = useCallback(async () => {
    await logout();
    toast.info('Session caisse fermée');
  }, [logout]);

  // ── Loyalty: handle payment confirmation with points ──────────────────────
  // Prices in the catalog are already TTC (VAT-inclusive) — extract HT and TVA from the total
  const cartTotalTTC = cart.reduce((s, i) => s + calcItemTotal(i), 0);
  const subtotalHT = cartTotalTTC / (1 + LIVE_TAX_RATE);
  const totalTVA = cartTotalTTC - subtotalHT;
  const globalDiscountAmount = globalDiscount
    ? globalDiscount.type === 'percent'
      ? Math.min(cartTotalTTC, cartTotalTTC * (globalDiscount.value / 100))
      : Math.min(cartTotalTTC, globalDiscount.value)
    : 0;
  const totalTTC = Math.max(0, cartTotalTTC - globalDiscountAmount);
  const rewardDiscountAmount =
    appliedReward &&
    appliedReward.rewardValue > 0 &&
    appliedReward.rewardType !== 'free_product' &&
    appliedReward.rewardType !== 'surprise_gift'
      ? Math.min(totalTTC, totalTTC * (appliedReward.rewardValue / 100))
      : 0;
  const finalTTC = Math.max(0, totalTTC - rewardDiscountAmount);

  const handlePaymentConfirm = useCallback(async (method: string) => {
    if (paying) return;
    setPaying(true);
    const total = finalTTC;
    const itemsCount = cart.length;
    const clientName = client?.name;
    const ticketRef = generateTicketNumber();

    logAction(
      paymentMode === 'acompte' ? 'acompte' : 'sale',
      `Vente encaissée${clientName ? ` — Client : ${clientName}` : ''} — ${total.toFixed(2)}€ via ${method}`,
      total,
      { method, itemsCount, clientName, mode: paymentMode }
    );

    // ── Deduct stock (skipped for demo/training sales) ────────────────────
    if (!isDemoCart) {
      const stockItems = cart.map((i) => ({
        productId: i.productId,
        name: i.name,
        qty: i.qty,
        isFreePrice: i.isFreePrice,
        kitComponents: i.kitComponents,
      }));
      const { errors: stockErrors } = await deductStockForSale(
        stockItems,
        ticketRef,
        method,
        employee?.fullName || 'Caisse',
        'completed',
        'vente'
      );
      if (stockErrors.length > 0) {
        console.warn('Stock deduction errors:', stockErrors);
        toast.warning(`Stock mis à jour avec ${stockErrors.length} avertissement(s)`, { duration: 3000 });
      }
    }

    // ── Save receipt to DB ────────────────────────────────────────────────
    const itemDiscountAmount = cart.reduce((s, i) => {
      const base = i.price * i.qty;
      const disc = i.discountType === 'percent' ? base * (i.discount / 100) : i.discount;
      return s + disc;
    }, 0);
    const discountAmount = itemDiscountAmount + globalDiscountAmount + rewardDiscountAmount;

    let loyaltyPointsEarned = 0;
    let loyaltyRewardUsed: string | undefined;

    // Award loyalty points if client is selected (skipped for demo sales)
    if (client && loyaltyTiers.length > 0 && !isDemoCart) {
      loyaltyPointsEarned = Math.floor(total);
      const previousPoints = client.points;
      const newPoints = previousPoints + loyaltyPointsEarned;

      // Persist points to DB
      const { ok: ptsOk, error: ptsErr } = await clientService.adjustLoyaltyPoints(
        client.id,
        loyaltyPointsEarned,
        `Achat en caisse — ${total.toFixed(2)} € — ${new Date().toLocaleDateString('fr-FR')}`
      );
      if (!ptsOk) console.error('[handleCompleteSale] adjustLoyaltyPoints failed:', ptsErr);

      // If a reward was applied, mark it as used
      if (appliedReward) {
        loyaltyRewardUsed = appliedReward.rewardDescription;
        await loyaltyService.useReward({
          rewardId: appliedReward.id,
          ticketRef,
          cashierName: employee?.fullName,
          notes: `Utilisé en caisse — ${total.toFixed(2)} € via ${method}`,
        });
        await loyaltyService.createRedemption({
          clientId: client.id,
          rewardType: appliedReward.rewardType,
          rewardDescription: appliedReward.rewardDescription,
          rewardValue: appliedReward.rewardValue,
          rewardProductId: appliedReward.rewardProductId,
          pointsAtRedemption: newPoints,
          cashierName: employee?.fullName,
          notes: `Récompense utilisée — ticket ${ticketRef}`,
        });

        // If the reward product was NOT pre-added to cart (e.g. no linked product), add stock
        // deduction manually. When already in cart, the main deductStockForSale handles it.
        const rewardAlreadyInCart = cart.some((i) => i.id === `reward-${appliedReward.id}`);
        if (
          !rewardAlreadyInCart &&
          (appliedReward.rewardType === 'free_product' || appliedReward.rewardType === 'surprise_gift') &&
          appliedReward.rewardProductId
        ) {
          const rewardProd = await loyaltyService.getRewardProductById(appliedReward.rewardProductId);
          const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (rewardProd && rewardProd.sku && UUID_RE.test(rewardProd.sku)) {
            await deductStockForSale(
              [{ productId: rewardProd.sku, name: rewardProd.productName, qty: 1 }],
              ticketRef,
              method,
              employee?.fullName || 'Caisse',
              'completed',
              'vente'
            );
          }
        }
      }

      // Detect newly unlocked tiers
      const unlocked = detectUnlockedTiers(loyaltyTiers, previousPoints, newPoints);
      const next = getNextTier(loyaltyTiers, newPoints);
      const ptsToNext = pointsToNextTier(loyaltyTiers, newPoints);

      // Update local client state
      setClient((prev) => prev ? { ...prev, points: newPoints } : prev);

      // Save receipt to DB — reward item already in cart if pre-added
      const receiptItems = cart;
      const receiptSubHT = total / (1 + LIVE_TAX_RATE);
      const receiptTVA = total - receiptSubHT;
      const saved = await saveReceipt({
        ticketNumber: ticketRef,
        items: receiptItems,
        subtotalHT: receiptSubHT,
        totalTVA: receiptTVA,
        totalTTC: total,
        discountAmount,
        paymentMethod: method,
        paymentType: paymentMode === 'acompte' ? 'acompte' : 'sale',
        clientId: client.id,
        clientName: client.name,
        cashierName: employee?.fullName || 'Caisse',
        employeeId: employee?.id !== 'default' ? employee?.id : undefined,
        loyaltyPointsEarned,
        loyaltyRewardUsed,
        isDemo: isDemoCart,
      });
      if (!saved) toast.error('Ticket non enregistré — vérifiez la connexion', { duration: 8000 });

      // Complete referral if one was applied
      if (globalDiscount?.isReferral && globalDiscount.parrainId && !isDemoCart) {
        fetch('/api/referrals/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parrainId: globalDiscount.parrainId,
            filleulId: client.id,
            receiptId: saved?.id ?? null,
            codeUtilise: globalDiscount.referralCode ?? '',
            referralId: globalDiscount.referralId ?? pendingReferral?.referralId ?? null,
          }),
        }).catch(() => {});
        setPendingReferral(null);
        setReferralValidated(null);
        setReferralCodeInput('');
      }

      // Deduct avoir from client store_credit if used
      if (globalDiscount?.isAvoir && !isDemoCart) {
        const remaining = Math.max(0, client.balance - globalDiscountAmount);
        fetch(`/api/clients/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_credit: remaining }),
        }).catch(() => {});
        // Mark specific return record as used if applied by avoir number
        if (globalDiscount.avoirRecordId) {
          fetch(`/api/returns/${globalDiscount.avoirRecordId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avoir_status: 'used', avoir_used_amount_delta: globalDiscountAmount, total_amount_ref: globalDiscount.value }),
          }).catch(() => {});
        }
      }

      if (unlocked.length > 0) {
        const persistedRewards: ClientLoyaltyReward[] = [];
        for (const tier of unlocked) {
          const reward = await loyaltyService.unlockRewardForClient(
            client.id,
            tier,
            newPoints,
            90
          );
          if (reward) persistedRewards.push(reward);
          await loyaltyService.createRedemption({
            clientId: client.id,
            tierId: tier.id,
            pointsAtRedemption: newPoints,
            rewardType: tier.rewardType,
            rewardDescription: tier.rewardDescription,
            rewardValue: tier.rewardValue,
            rewardProductId: tier.rewardProductId,
            cashierName: employee?.fullName,
          });
        }

        setShowPayment(false);
        setAppliedReward(null);
        setAvailableRewards([]);

        // Always show doc choice modal after payment
        setLastSaleTotal(total);
        setLastSaleGlobalDiscount(globalDiscountAmount);
        setLastSaleClient(client);
        setLastSaleItems([...cart]);
        setLastSaleMethod(method);
        setLastSaleTicketRef(ticketRef);
        setLastSaleLoyalty({
          pointsEarned: loyaltyPointsEarned,
          totalPoints: newPoints,
          nextTier: next,
          pointsToNext: ptsToNext,
          currentTierName: getCurrentTier(loyaltyTiers, newPoints)?.name ?? null,
        });

        setCart([]);
        setGlobalDiscount(null);
        setClient(null);

        if (persistedRewards.length > 0) {
          setNewlyUnlockedRewards({
            rewards: persistedRewards,
            nextTier: next,
            pointsToNext: ptsToNext,
            currentPoints: newPoints,
            pointsEarned: loyaltyPointsEarned,
          });
        }

        setShowDocChoice(true);
        toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
      } else {
        if (next) {
          toast.success(`+${loyaltyPointsEarned} pts fidélité · Encore ${ptsToNext} pts avant "${next.name}"`, {
            duration: 4000,
            icon: '⭐',
          });
        } else {
          toast.success(`+${loyaltyPointsEarned} pts fidélité · Total : ${newPoints.toLocaleString('fr-FR')} pts`, {
            duration: 3000,
            icon: '⭐',
          });
        }

        setShowPayment(false);
        setLastSaleTotal(total);
        setLastSaleRewardDiscount(rewardDiscountAmount);
        setLastSaleClient(client);
        setLastSaleItems([...cart]);
        setLastSaleMethod(method);
        setLastSaleTicketRef(ticketRef);
        setLastSaleLoyalty({
          pointsEarned: loyaltyPointsEarned,
          totalPoints: newPoints,
          nextTier: next,
          pointsToNext: ptsToNext,
          currentTierName: getCurrentTier(loyaltyTiers, newPoints)?.name ?? null,
        });
        setCart([]);
        setAppliedReward(null);
        setAvailableRewards([]);
        setClient(null);
        setShowDocChoice(true);
        toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
      }
    } else {
      // No client / no loyalty — save receipt and show doc choice
      const receiptSubHT2 = total / (1 + LIVE_TAX_RATE);
      const receiptTVA2 = total - receiptSubHT2;
      const saved2 = await saveReceipt({
        ticketNumber: ticketRef,
        items: cart,
        subtotalHT: receiptSubHT2,
        totalTVA: receiptTVA2,
        totalTTC: total,
        discountAmount,
        paymentMethod: method,
        paymentType: paymentMode === 'acompte' ? 'acompte' : 'sale',
        clientId: client?.id,
        clientName: client?.name,
        cashierName: employee?.fullName || 'Caisse',
        employeeId: employee?.id !== 'default' ? employee?.id : undefined,
        isDemo: isDemoCart,
      });
      if (!saved2) toast.error('Ticket non enregistré — vérifiez la connexion', { duration: 8000 });

      // Complete referral if one was applied (anonymous checkout with referral code)
      if (globalDiscount?.isReferral && globalDiscount.parrainId && !isDemoCart) {
        fetch('/api/referrals/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parrainId: globalDiscount.parrainId,
            filleulId: null,
            receiptId: saved2?.id ?? null,
            codeUtilise: globalDiscount.referralCode ?? '',
            referralId: null,
          }),
        }).catch(() => {});
        setReferralValidated(null);
        setReferralCodeInput('');
      }

      // Deduct avoir from client store_credit if used
      if (globalDiscount?.isAvoir && client && !isDemoCart) {
        const remaining = Math.max(0, client.balance - globalDiscountAmount);
        fetch(`/api/clients/${client.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ store_credit: remaining }),
        }).catch(() => {});
        // Mark specific return record as used if applied by avoir number
        if (globalDiscount.avoirRecordId) {
          fetch(`/api/returns/${globalDiscount.avoirRecordId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ avoir_status: 'used', avoir_used_amount_delta: globalDiscountAmount, total_amount_ref: globalDiscount.value }),
          }).catch(() => {});
        }
      }

      setShowPayment(false);
      setLastSaleTotal(total);
      setLastSaleRewardDiscount(rewardDiscountAmount);
      setLastSaleGlobalDiscount(globalDiscountAmount);
      setLastSaleClient(client);
      setLastSaleItems([...cart]);
      setLastSaleMethod(method);
      setLastSaleTicketRef(ticketRef);
      setLastSaleLoyalty(null);
      setCart([]);
      setAppliedReward(null);
      setGlobalDiscount(null);
      setClient(null);
      setShowDocChoice(true);
      toast.success(`Paiement encaissé — ${total.toFixed(2)} € via ${method}`);
    }
    setPaying(false);
  }, [cart, client, paymentMode, totalTTC, subtotalHT, totalTVA, globalDiscountAmount, rewardDiscountAmount, finalTTC, loyaltyTiers, logAction, employee, appliedReward, paying]);

  const handleLoyaltyValidate = useCallback((tier: LoyaltyTier) => {
    toast.success(`🎁 Récompense validée : ${tier.rewardDescription}`, { duration: 4000 });
  }, []);

  const handleLoyaltyDismiss = useCallback(() => {
    setLoyaltyNotification(null);
    setShowPayment(false);
    setCart([]);
    setGlobalDiscount(null);
    setClient(null);
  }, []);

  const handleNewlyUnlockedDismiss = useCallback(() => {
    setNewlyUnlockedRewards(null);
    setClient(null);
  }, []);

  // Post-payment document choice
  const [showDocChoice, setShowDocChoice] = useState(false);
  const [lastSaleTotal, setLastSaleTotal] = useState(0);
  const [lastSaleClient, setLastSaleClient] = useState<POSClient | null>(null);
  const [lastSaleItems, setLastSaleItems] = useState<CartItem[]>([]);
  const [lastSaleMethod, setLastSaleMethod] = useState('');
  const [lastSaleTicketRef, setLastSaleTicketRef] = useState('');
  const [lastSaleLoyalty, setLastSaleLoyalty] = useState<{ pointsEarned: number; totalPoints: number; nextTier: LoyaltyTier | null; pointsToNext: number; currentTierName: string | null } | null>(null);
  const [lastSaleRewardDiscount, setLastSaleRewardDiscount] = useState(0);
  const [lastSaleGlobalDiscount, setLastSaleGlobalDiscount] = useState(0);

  const handleDocChoiceClose = useCallback(() => {
    setShowDocChoice(false);
    setLastSaleTotal(0);
    setLastSaleClient(null);
    setLastSaleItems([]);
    setLastSaleMethod('');
    setLastSaleLoyalty(null);
  }, []);

  // Format session start time
  const [dateStr, setDateStr] = useState('');
  const [timeStr, setTimeStr] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      setDateStr(now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
    };
    update();
    const interval = setInterval(update, 30000);
    return () => clearInterval(interval);
  }, []);

  // Next tier progress bar for cart panel
  const nextTierForClient = client && loyaltyTiers.length > 0 ? getNextTier(loyaltyTiers, client.points) : null;
  const currentTierForClient = client && loyaltyTiers.length > 0 ? getCurrentTier(loyaltyTiers, client.points) : null;
  const ptsToNextForClient = client && loyaltyTiers.length > 0 ? pointsToNextTier(loyaltyTiers, client.points) : 0;

  // If the DB has no reward rows yet, compute earned rewards from tier thresholds
  const cartComputedRewards: ClientLoyaltyReward[] = allClientRewards.length === 0 && client && loyaltyTiers.length > 0
    ? loyaltyTiers
        .filter(t => t.isActive !== false && client.points >= t.pointsRequired)
        .map(t => ({
          id: `computed-${t.id}`,
          clientId: client.id,
          tierId: t.id,
          rewardType: t.rewardType,
          rewardDescription: t.rewardDescription,
          rewardValue: t.rewardValue,
          rewardProductId: t.rewardProductId ?? null,
          status: 'available' as const,
          unlockedAt: new Date().toISOString(),
          pointsAtUnlock: t.pointsRequired,
          expiryDate: null,
          usedAt: null,
          ticketRef: null,
          cashierName: null,
          notes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }))
    : [];
  const effectiveAllRewards = allClientRewards.length > 0 ? allClientRewards : cartComputedRewards;
  const effectiveAvailableCount = effectiveAllRewards.filter(r => r.status === 'available').length;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Shopify new order alert */}
      <ShopifyOrderAlert
        orders={newShopifyOrders}
        onView={() => {
          setNewShopifyOrders([]);
          router.push('/shopify-sync');
        }}
        onDismiss={() => setNewShopifyOrders([])}
      />
      {/* Top bar */}
      <div className="h-14 bg-white border-b border-border flex items-center justify-between px-4 shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm font-600 text-foreground">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Caisse ouverte
          </div>
          {tiroir !== null && (
            <>
              <span className="text-muted-foreground text-xs">·</span>
              <div className="flex items-center gap-1 text-xs font-600 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg" title="Fond de caisse + ventes espèces du jour">
                💰 {tiroir.toFixed(2)} €
              </div>
            </>
          )}
          <span className="text-muted-foreground text-xs">·</span>
          <div className="relative">
            <button
              onClick={() => setShowEmployeeMenu((v) => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-700 text-primary">
                {employee?.avatarInitials}
              </div>
              <span className="text-xs font-500 text-foreground">{employee?.fullName || 'Caissier'}</span>
              <Icon name="ChevronDownIcon" size={11} className="text-muted-foreground" />
            </button>
            {showEmployeeMenu && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-xl shadow-lg py-1 min-w-[180px]">
                <div className="px-3 py-2 border-b border-border">
                  <p className="text-xs font-600 text-foreground">{employee?.fullName}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{employee?.role}</p>
                </div>
                <button
                  onClick={() => { setShowEmployeeMenu(false); changeEmployee(); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="ArrowsRightLeftIcon" size={14} className="text-primary" />
                  Changer de caissier
                </button>
              </div>
            )}
          </div>
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground font-mono">{dateStr} {timeStr}</span>
          {/* Barcode scanner status indicator */}
          <span className="text-muted-foreground text-xs">·</span>
          <div className={`flex items-center gap-1 text-xs font-500 transition-colors ${
            barcodeStatus === 'scanning' ? 'text-amber-600' :
            barcodeStatus === 'found' ? 'text-emerald-600' :
            barcodeStatus === 'notfound'? 'text-red-500' : 'text-muted-foreground'
          }`}>
            <Icon name="QrCodeIcon" size={13} />
            <span>
              {barcodeStatus === 'scanning' ? 'Scan...' :
               barcodeStatus === 'found' ? 'Trouvé ✓' :
               barcodeStatus === 'notfound'? 'Inconnu ✗' : 'Scanner actif'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Marketing IA button */}
          <button
            onClick={() => setShowMarketing(true)}
            title="Lancer une campagne marketing IA"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-pink-200 bg-pink-50 rounded-lg text-sm font-500 text-pink-700 hover:bg-pink-100 transition-colors"
          >
            <Icon name="MegaphoneIcon" size={14} />
            <span>Marketing IA</span>
          </button>
          {/* Camera scanner button */}
          <button
            onClick={handleOpenCamera}
            title="Scanner avec la caméra"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-sky-200 bg-sky-50 rounded-lg text-sm font-500 text-sky-700 hover:bg-sky-100 transition-colors"
          >
            <Icon name="CameraIcon" size={14} />
            <span>Caméra</span>
          </button>
          <button
            onClick={() => setShowFreePrice(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-violet-200 bg-violet-50 rounded-lg text-sm font-500 text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <span>+ Prix libre</span>
          </button>
          <button
            onClick={() => setShowHeld(true)}
            className="relative flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <span>Tickets en attente</span>
            {heldTickets.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-700 rounded-full px-1.5 py-0.5 tabular-nums">
                {heldTickets.length}
              </span>
            )}
          </button>
          <button
            onClick={holdTicket}
            disabled={cart.length === 0}
            className="px-3 py-1.5 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Mettre en attente
          </button>
          <button
            onClick={() => {
              if (isDemoCart) {
                setCart(prev => prev.filter(i => !i.isDemo));
              } else if (demoProductRef) {
                addToCart({ id: demoProductRef.id, name: demoProductRef.name, sku: demoProductRef.ref, price: 0.01, stock: 999, isDemo: true });
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm font-medium transition-colors ${
              isDemoCart
                ? 'border-amber-400 bg-amber-100 text-amber-800 hover:bg-amber-200'
                : 'border-amber-200 text-amber-700 hover:bg-amber-50'
            }`}
            title="Mode formation — ne compte pas dans le CA"
          >
            🎓 {isDemoCart ? 'Quitter formation' : 'Formation'}
          </button>
          <button
            onClick={clearCart}
            disabled={cart.length === 0}
            className="px-3 py-1.5 border border-red-200 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Annuler ticket
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title="Verrouiller la caisse"
          >
            <Icon name="LockClosedIcon" size={14} />
            <span>Verrouiller</span>
          </button>
        </div>
      </div>

      {/* Shopify new orders persistent card */}
      {newShopifyOrders.length > 0 && (
        <button
          onClick={() => { setNewShopifyOrders([]); router.push('/shopify-sync'); }}
          className="w-full flex items-center justify-between gap-3 px-4 py-2.5 bg-pink-50 border-b-2 border-pink-400 hover:bg-pink-100 transition-colors group shrink-0"
        >
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              <span className="text-xl">🛍️</span>
              <span className="absolute -top-1 -right-1 bg-pink-600 text-white text-[9px] font-900 rounded-full w-4 h-4 flex items-center justify-center">
                {newShopifyOrders.length}
              </span>
            </div>
            <div className="text-left">
              <p className="text-xs font-900 text-pink-700 uppercase tracking-wider leading-tight">
                🔔 Nouvelle commande Shopify
              </p>
              <p className="text-[11px] text-pink-600 font-500 mt-0.5">
                {newShopifyOrders.length > 1
                  ? `${newShopifyOrders.length} commandes en attente de traitement`
                  : `#${newShopifyOrders[0].order_number} — ${
                      newShopifyOrders[0].customer
                        ? `${newShopifyOrders[0].customer.first_name ?? ''} ${newShopifyOrders[0].customer.last_name ?? ''}`.trim()
                        : 'Client inconnu'
                    } — ${parseFloat(newShopifyOrders[0].total_price || '0').toFixed(2)} €`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-700 text-pink-700 bg-pink-200 px-3 py-1 rounded-full group-hover:bg-pink-300 transition-colors">
              Voir les commandes →
            </span>
          </div>
        </button>
      )}

      {/* Main split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: product grid */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <ProductGrid onAddToCart={addToCart} />
        </div>

        {/* Right: cart */}
        <div className="w-[400px] xl:w-[440px] 2xl:w-[480px] shrink-0 flex flex-col bg-white border-l border-border overflow-hidden">
          <ClientLookupBar
            client={client}
            onSelect={handleClientSelect}
            onClear={handleClientClear}
          />

          {/* Scrollable middle: client info + cart */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">

          {/* Voir fiche client */}
          {client && (
            <button
              onClick={() => setShowClientFiche(true)}
              className="mx-3 mt-1 flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors w-[calc(100%-24px)]"
            >
              <Icon name="UserIcon" size={13} className="text-blue-600" />
              <span className="text-xs font-600 text-blue-700">Voir fiche client</span>
              <Icon name="ChevronRightIcon" size={13} className="text-blue-400 ml-auto" />
            </button>
          )}

          {/* Avoir disponible — client balance */}
          {client && client.balance > 0 && !globalDiscount?.isAvoir && (
            <button
              onClick={() => {
                setGlobalDiscount({ type: 'amount', value: client.balance, isAvoir: true });
                setClient(prev => prev ? { ...prev, avoirApplied: true } : prev);
                toast.success(`Avoir de ${client.balance.toFixed(2)} € appliqué`, { duration: 2000 });
              }}
              className="mx-3 mt-1 flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors w-[calc(100%-24px)]"
            >
              <Icon name="GiftIcon" size={13} className="text-emerald-600" />
              <span className="text-xs font-600 text-emerald-700">
                💳 Utiliser avoir — {client.balance.toFixed(2)} €
              </span>
              <Icon name="ChevronRightIcon" size={13} className="text-emerald-400 ml-auto" />
            </button>
          )}

          {/* Parrainage — pending referral for existing client */}
          {client && pendingReferral && !globalDiscount?.isReferral && !globalDiscount?.isAvoir && (
            <div className="mx-3 mt-1 bg-pink-50 border border-pink-200 rounded-lg p-2.5 w-[calc(100%-24px)]">
              <p className="text-xs font-700 text-pink-700">🤝 Réduction parrainage -{pendingReferral.discountPct}% disponible !</p>
              <button
                onClick={() => setGlobalDiscount({ type: 'percent', value: pendingReferral.discountPct, isReferral: true, parrainId: pendingReferral.parrainId, referralId: pendingReferral.referralId })}
                className="mt-1.5 bg-pink-600 text-white px-3 py-1 rounded text-xs font-600 hover:bg-pink-700 transition-colors"
              >
                Appliquer la réduction
              </button>
            </div>
          )}

          {/* Parrainage applied — show badge */}
          {globalDiscount?.isReferral && (
            <div className="mx-3 mt-1 flex items-center justify-between px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg w-[calc(100%-24px)]">
              <div className="flex items-center gap-2">
                <Icon name="UserGroupIcon" size={13} className="text-pink-600" />
                <span className="text-xs font-600 text-pink-700">Parrainage -{globalDiscount.value}% appliqué (-{globalDiscountAmount.toFixed(2)} €)</span>
              </div>
              <button onClick={() => { setGlobalDiscount(null); setReferralValidated(null); }} className="text-[10px] text-pink-600 hover:text-red-500">Retirer</button>
            </div>
          )}

          {/* Avoir applied — show badge */}
          {globalDiscount?.isAvoir && (
            <div className="mx-3 mt-1 flex items-center justify-between px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg w-[calc(100%-24px)]">
              <div className="flex items-center gap-2">
                <Icon name="GiftIcon" size={13} className="text-emerald-600" />
                <div>
                  <span className="text-xs font-600 text-emerald-700">Avoir appliqué — -{globalDiscountAmount.toFixed(2)} €</span>
                  {globalDiscount.avoirRecordId && (
                    <p className="text-[10px] text-emerald-600">Bon de retour</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setGlobalDiscount(null);
                  setClient(prev => prev ? { ...prev, avoirApplied: false } : prev);
                }}
                className="text-[10px] text-emerald-600 hover:text-red-500"
              >
                Retirer
              </button>
            </div>
          )}

          {/* Saisir N° Avoir manually */}
          {!globalDiscount?.isAvoir && (
            <div className="mx-3 mt-1 w-[calc(100%-24px)]">
              {!showAvoirInput ? (
                <button
                  onClick={() => { setShowAvoirInput(true); setAvoirLookupError(null); }}
                  className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-emerald-400 hover:text-emerald-700 transition-colors w-full"
                >
                  <Icon name="QrCodeIcon" size={12} />
                  Saisir N° Avoir (ex: AV-26-1001)
                </button>
              ) : (
                <div className="border border-emerald-300 rounded-lg p-2 bg-emerald-50 space-y-1.5">
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={avoirInputValue}
                      onChange={e => { setAvoirInputValue(e.target.value.toUpperCase()); setAvoirLookupError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleAvoirLookup()}
                      placeholder="AV-26-1001"
                      className="flex-1 px-2 py-1 text-xs border border-emerald-200 rounded-md font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
                    />
                    <button
                      onClick={handleAvoirLookup}
                      disabled={avoirLookupLoading || !avoirInputValue.trim()}
                      className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {avoirLookupLoading ? '…' : 'OK'}
                    </button>
                    <button
                      onClick={() => { setShowAvoirInput(false); setAvoirInputValue(''); setAvoirLookupError(null); }}
                      className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  {avoirLookupError && (
                    <p className="text-[10px] text-red-600">{avoirLookupError}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Referral code input — for client WITH no pending referral */}
          {client && !pendingReferral && !globalDiscount?.isReferral && !globalDiscount?.isAvoir && (
            <div className="mx-3 mt-1 w-[calc(100%-24px)]">
              {!showReferralInput ? (
                <button
                  onClick={() => { setShowReferralInput(true); setReferralCodeError(null); }}
                  className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-pink-200 rounded-lg text-xs text-pink-500 hover:border-pink-400 hover:text-pink-700 transition-colors w-full"
                >
                  <Icon name="UserGroupIcon" size={12} />
                  Saisir un code parrainage (optionnel)
                </button>
              ) : (
                <div className="border border-pink-300 rounded-lg p-2 bg-pink-50 space-y-1.5">
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={referralCodeInput}
                      onChange={e => { setReferralCodeInput(e.target.value.toUpperCase()); setReferralCodeError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleReferralValidate()}
                      placeholder="Ex: MARIE15"
                      maxLength={10}
                      className="flex-1 px-2 py-1 text-xs border border-pink-200 rounded-md font-mono uppercase focus:outline-none focus:ring-1 focus:ring-pink-400 bg-white"
                    />
                    <button
                      onClick={handleReferralValidate}
                      disabled={referralCodeLoading || !referralCodeInput.trim()}
                      className="px-2.5 py-1 bg-pink-600 text-white text-xs font-600 rounded-md hover:bg-pink-700 disabled:opacity-50 transition-colors"
                    >
                      {referralCodeLoading ? '…' : 'OK'}
                    </button>
                    <button
                      onClick={() => { setShowReferralInput(false); setReferralCodeInput(''); setReferralCodeError(null); }}
                      className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  {referralCodeError && <p className="text-[10px] text-red-600">{referralCodeError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Referral code input — for anonymous / no-client checkout */}
          {!client && !globalDiscount?.isReferral && (
            <div className="mx-3 mt-1 w-[calc(100%-24px)]">
              {!showReferralInput ? (
                <button
                  onClick={() => { setShowReferralInput(true); setReferralCodeError(null); }}
                  className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-pink-200 rounded-lg text-xs text-pink-500 hover:border-pink-400 hover:text-pink-700 transition-colors w-full"
                >
                  <Icon name="UserGroupIcon" size={12} />
                  Saisir un code parrainage (optionnel)
                </button>
              ) : (
                <div className="border border-pink-300 rounded-lg p-2 bg-pink-50 space-y-1.5">
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={referralCodeInput}
                      onChange={e => { setReferralCodeInput(e.target.value.toUpperCase()); setReferralCodeError(null); }}
                      onKeyDown={e => e.key === 'Enter' && handleReferralValidate()}
                      placeholder="Ex: MARIE15"
                      maxLength={10}
                      className="flex-1 px-2 py-1 text-xs border border-pink-200 rounded-md font-mono uppercase focus:outline-none focus:ring-1 focus:ring-pink-400 bg-white"
                    />
                    <button
                      onClick={handleReferralValidate}
                      disabled={referralCodeLoading || !referralCodeInput.trim()}
                      className="px-2.5 py-1 bg-pink-600 text-white text-xs font-600 rounded-md hover:bg-pink-700 disabled:opacity-50 transition-colors"
                    >
                      {referralCodeLoading ? '…' : 'OK'}
                    </button>
                    <button
                      onClick={() => { setShowReferralInput(false); setReferralCodeInput(''); setReferralCodeError(null); }}
                      className="px-2 py-1 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  {referralCodeError && <p className="text-[10px] text-red-600">{referralCodeError}</p>}
                </div>
              )}
            </div>
          )}

          {/* Referral validated confirmation (anonymous) */}
          {!client && globalDiscount?.isReferral && referralValidated && (
            <div className="mx-3 mt-1 flex items-center justify-between px-3 py-1.5 bg-pink-50 border border-pink-200 rounded-lg w-[calc(100%-24px)]">
              <div className="flex items-center gap-2">
                <Icon name="UserGroupIcon" size={13} className="text-pink-600" />
                <span className="text-xs font-600 text-pink-700">🤝 Parrainage {referralValidated.firstName} -{globalDiscount.value}% (-{globalDiscountAmount.toFixed(2)} €)</span>
              </div>
              <button onClick={() => { setGlobalDiscount(null); setReferralValidated(null); setShowReferralInput(false); setReferralCodeInput(''); }} className="text-[10px] text-pink-600 hover:text-red-500">Retirer</button>
            </div>
          )}

          {/* Loyalty progress bar for selected client */}
          {client && nextTierForClient && (
            <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-amber-700 font-600 flex items-center gap-1">
                  <span>⭐</span> {client.points.toLocaleString('fr-FR')} pts
                </span>
                <span className="text-[10px] text-amber-600">
                  🔥 Encore {ptsToNextForClient} pts → {nextTierForClient.name}
                </span>
              </div>
              <div className="h-1.5 bg-amber-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(3, ((client.points - (currentTierForClient?.pointsRequired ?? 0)) / Math.max(1, nextTierForClient.pointsRequired - (currentTierForClient?.pointsRequired ?? 0))) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Voir récompenses button */}
          {client && (
            <button
              onClick={() => setShowAllRewards(!showAllRewards)}
              className="mx-3 mb-1 w-[calc(100%-24px)] flex items-center justify-between bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">🎁</span>
                <span className="text-xs font-600 text-violet-800">Voir récompenses disponibles</span>
              </div>
              <div className="flex items-center gap-1">
                {effectiveAvailableCount > 0 && (
                  <span className="text-[10px] font-700 bg-violet-500 text-white rounded-full px-1.5 py-0.5">{effectiveAvailableCount}</span>
                )}
                <Icon name={showAllRewards ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={13} className="text-violet-500" />
              </div>
            </button>
          )}

          {/* Expandable all rewards panel */}
          {client && showAllRewards && (
            <div className="mx-3 mb-2 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
              {effectiveAllRewards.length === 0 ? (
                <p className="text-xs text-violet-600 text-center py-3">Aucune récompense débloquée</p>
              ) : (
                <div className="max-h-48 overflow-y-auto divide-y divide-violet-100">
                  {effectiveAllRewards.map((r) => {
                    const isAvailable = r.status === 'available';
                    return (
                      <div key={r.id} className="px-3 py-2 flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-600 text-violet-900 truncate">{r.rewardDescription}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-700 px-1.5 py-0.5 rounded-full ${
                              isAvailable ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {isAvailable ? 'DISPONIBLE' : r.status === 'used' ? 'UTILISÉE' : r.status.toUpperCase()}
                            </span>
                            {r.expiryDate && isAvailable && (
                              <span className="text-[9px] text-amber-600">Expire {new Date(r.expiryDate).toLocaleDateString('fr-FR')}</span>
                            )}
                          </div>
                        </div>
                        {isAvailable && !appliedReward && (
                          <button
                            onClick={() => { handleUseRewardNow(r); setShowAllRewards(false); }}
                            className="shrink-0 text-[10px] font-700 px-2 py-1 bg-violet-500 text-white rounded-lg hover:bg-violet-600 transition-colors"
                          >
                            Appliquer
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Applied reward banner */}
          {appliedReward && (
            <RewardAppliedBanner
              reward={appliedReward}
              discountAmount={rewardDiscountAmount}
              onRemove={handleRemoveAppliedReward}
            />
          )}

          {/* Available rewards notification strip */}
          {client && availableRewards.length > 0 && !showAvailableRewards && !appliedReward && (
            <button
              onClick={() => setShowAvailableRewards(true)}
              className="mx-3 mb-1 w-[calc(100%-24px)] flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 hover:bg-violet-100 transition-colors"
            >
              <span className="text-base">🎁</span>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-700 text-violet-800">
                  {availableRewards.length === 1
                    ? '1 récompense disponible'
                    : `${availableRewards.length} récompenses disponibles`}
                </p>
                <p className="text-[10px] text-violet-600 truncate">
                  {availableRewards[0].rewardDescription}
                </p>
              </div>
              <Icon name="ChevronRightIcon" size={14} className="text-violet-500 shrink-0" />
            </button>
          )}

          <CartPanel
            ref={cartPanelRef}
            items={cart}
            onUpdateQty={updateQty}
            onUpdateDiscount={updateDiscount}
            onUpdatePrice={updatePrice}
            onRemove={removeItem}
            subtotalHT={subtotalHT}
            totalTVA={totalTVA}
            totalTTC={finalTTC}
            globalDiscount={globalDiscount}
            globalDiscountAmount={globalDiscountAmount}
            onGlobalDiscountChange={setGlobalDiscount}
            rewardDiscountAmount={rewardDiscountAmount}
            tvaRate={LIVE_TAX_RATE}
            cashierName={employee?.fullName || 'Caisse'}
          />
          </div>{/* end scrollable middle */}

          {/* Payment buttons — always visible at bottom */}
          <div className="border-t border-border p-4 space-y-3 shrink-0">
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'pay-cb', label: 'Carte bancaire', mode: 'immediate' as const, sub: 'CB / Sans contact' },
                { id: 'pay-cash', label: 'Espèces', mode: 'immediate' as const, sub: 'Rendu monnaie' },
                { id: 'pay-mix', label: 'Paiement mixte', mode: 'immediate' as const, sub: 'CB + Espèces' },
                { id: 'pay-inst', label: 'Plusieurs fois', mode: 'installment' as const, sub: '2x / 3x / 4x' },
              ].map((btn) => (
                <button
                  key={btn.id}
                  onClick={() => openPayment(btn.mode)}
                  disabled={cart.length === 0}
                  className="flex flex-col items-center justify-center py-2.5 px-3 border border-border rounded-lg hover:border-primary/40 hover:bg-primary/5 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  <span className="text-sm font-600 text-foreground">{btn.label}</span>
                  <span className="text-[10px] text-muted-foreground mt-0.5">{btn.sub}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => openPayment('acompte')}
              disabled={cart.length === 0}
              className="w-full py-2.5 border border-amber-300 bg-amber-50 rounded-lg text-sm font-600 text-amber-800 hover:bg-amber-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
            >
              Acompte / Réservation
            </button>
            <button
              onClick={() => openPayment('immediate')}
              disabled={cart.length === 0 || paying}
              className="w-full py-3 bg-primary text-primary-foreground rounded-lg text-[15px] font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
            >
              {paying ? 'Traitement…' : `Encaisser — ${finalTTC.toFixed(2)} €`}
            </button>
          </div>
        </div>
      </div>

      {/* Camera Barcode Scanner Modal */}
      {showCameraScanner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Icon name="CameraIcon" size={18} className="text-sky-600" />
                <h2 className="font-700 text-foreground text-sm">Scanner avec la caméra</h2>
              </div>
              <button onClick={handleCloseCamera} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Camera status messages */}
              {cameraScanner.status === 'denied' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-sm font-600 text-red-700 mb-1">Accès caméra refusé</p>
                  <p className="text-xs text-red-600">Autorisez l'accès à la caméra dans les paramètres de votre navigateur, puis réessayez.</p>
                </div>
              )}
              {(cameraScanner.status === 'requesting' || cameraScanner.status === 'active' || cameraScanner.status === 'error') && (
                <div className="space-y-3">
                  <div className="relative rounded-xl overflow-hidden bg-black" style={{ height: '260px' }}>
                    {/* Quagga injects <video> + <canvas> into this div */}
                    <div
                      ref={cameraScanner.containerRef}
                      className="absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                    />
                    {cameraScanner.status === 'requesting' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3 z-10">
                        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-white">Accès caméra…</p>
                      </div>
                    )}
                    {cameraScanner.status === 'active' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                        <div className="w-48 h-32 border-2 border-sky-400 rounded-lg relative">
                          <span className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-sky-400 rounded-tl" />
                          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-sky-400 rounded-tr" />
                          <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-sky-400 rounded-bl" />
                          <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-sky-400 rounded-br" />
                          <div className="absolute inset-x-0 top-1/2 h-px bg-sky-400/60 animate-pulse" />
                        </div>
                      </div>
                    )}
                  </div>
                  {cameraScanner.status === 'error' && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                      <p className="text-sm font-600 text-amber-700 mb-1">Caméra indisponible</p>
                      <p className="text-xs text-amber-600">Vérifiez les permissions dans les réglages du navigateur.</p>
                    </div>
                  )}
                  {cameraScanner.status === 'active' && (
                    <p className="text-xs text-center text-muted-foreground">Pointez la caméra vers le code-barres du produit</p>
                  )}
                </div>
              )}
              {/* Manual barcode input fallback */}
              <div className="space-y-2">
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Saisie manuelle du code-barres</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={cameraManualBarcode}
                    onChange={(e) => setCameraManualBarcode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && cameraManualBarcode.trim().length >= 3) {
                        handleBarcodeScan(cameraManualBarcode.trim());
                        setCameraManualBarcode('');
                      }
                    }}
                    placeholder="Ex: 3760123456789"
                    className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    autoFocus={cameraScanner.status !== 'active'}
                  />
                  <button
                    onClick={() => {
                      if (cameraManualBarcode.trim().length >= 3) {
                        handleBarcodeScan(cameraManualBarcode.trim());
                        setCameraManualBarcode('');
                      }
                    }}
                    disabled={cameraManualBarcode.trim().length < 3}
                    className="px-4 py-2 bg-primary text-primary-foreground text-sm font-600 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                  >
                    Rechercher
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Free Price Modal */}
      {showFreePrice && (
        <FreePriceModal
          onClose={() => setShowFreePrice(false)}
          onConfirm={addFreePriceItem}
        />
      )}

      {/* Held Tickets Drawer */}
      {showHeld && (
        <HeldTicketsDrawer
          tickets={heldTickets}
          onRecall={recallTicket}
          onClose={() => setShowHeld(false)}
        />
      )}

      {/* Payment Modal */}
      {showPayment && (
        <PaymentModal
          mode={paymentMode}
          totalTTC={finalTTC}
          client={client}
          cartItems={cart}
          onClose={() => setShowPayment(false)}
          onConfirm={handlePaymentConfirm}
          cashierName={employee?.fullName || 'Caisse'}
        />
      )}

      {/* Loyalty Reward Notification (legacy - kept for backward compat) */}
      {loyaltyNotification && (
        <LoyaltyRewardNotification
          unlockedTiers={loyaltyNotification.unlockedTiers}
          nextTier={loyaltyNotification.nextTier}
          pointsToNext={loyaltyNotification.pointsToNext}
          currentPoints={loyaltyNotification.currentPoints}
          pointsEarned={loyaltyNotification.pointsEarned}
          onValidate={handleLoyaltyValidate}
          onDismiss={handleLoyaltyDismiss}
        />
      )}

      {/* Available Rewards Modal (shown when client selected) */}
      {showAvailableRewards && client && availableRewards.length > 0 && (
        <AvailableRewardsModal
          clientName={client.name}
          availableRewards={availableRewards}
          nextTier={nextTierForClient}
          pointsToNext={ptsToNextForClient}
          currentPoints={client.points}
          onUseNow={handleUseRewardNow}
          onKeepForLater={handleKeepRewardForLater}
        />
      )}

      {/* Newly Unlocked Rewards Modal (shown after payment) */}
      {newlyUnlockedRewards && (
        <NewlyUnlockedRewardsModal
          unlockedRewards={newlyUnlockedRewards.rewards}
          nextTier={newlyUnlockedRewards.nextTier}
          pointsToNext={newlyUnlockedRewards.pointsToNext}
          currentPoints={newlyUnlockedRewards.currentPoints}
          pointsEarned={newlyUnlockedRewards.pointsEarned}
          onDismiss={handleNewlyUnlockedDismiss}
        />
      )}

      {/* Post-payment document choice */}
      {showDocChoice && (
        <PostPaymentDocModal
          total={lastSaleTotal}
          client={lastSaleClient}
          items={lastSaleItems}
          paymentMethod={lastSaleMethod}
          ticketRef={lastSaleTicketRef}
          loyaltyInfo={lastSaleLoyalty}
          rewardDiscountAmount={lastSaleRewardDiscount}
          globalDiscountAmount={lastSaleGlobalDiscount}
          referralCode={clientReferralCode}
          onClose={handleDocChoiceClose}
        />
      )}

      {/* Client fiche slide-over */}
      {showClientFiche && client && (
        <ClientFicheSlideOver
          client={client}
          allRewards={allClientRewards}
          loyaltyTiers={loyaltyTiers}
          onClose={() => setShowClientFiche(false)}
          onPointsUpdated={(newPts) => setClient((prev) => prev ? { ...prev, points: newPts } : prev)}
          onUseAvoir={(amount) => {
            setGlobalDiscount({ type: 'amount', value: amount, isAvoir: true });
            setClient((prev) => prev ? { ...prev, avoirApplied: true } : prev);
            setShowClientFiche(false);
            toast.success(`Avoir de ${amount.toFixed(2)} € appliqué`, { duration: 2000 });
          }}
        />
      )}

      {/* Ouverture de caisse modal */}
      {showOuverture && sessionChecked && (
        <OuvertureCaisseModal onConfirm={handleOuvertureConfirm} />
      )}

      {/* Marketing IA panel */}
      {showMarketing && (
        <POSMarketingPanel onClose={() => setShowMarketing(false)} />
      )}
    </div>
  );
}

// ─── Post-Payment Document Choice Modal ──────────────────────────────────────

interface PostPaymentDocModalProps {
  total: number;
  client: POSClient | null;
  items: CartItem[];
  paymentMethod?: string;
  ticketRef?: string;
  loyaltyInfo?: { pointsEarned: number; totalPoints: number; nextTier: LoyaltyTier | null; pointsToNext: number; currentTierName?: string | null } | null;
  rewardDiscountAmount?: number;
  globalDiscountAmount?: number;
  referralCode?: string;
  onClose: () => void;
}

type ActionKey = 'print' | 'facture' | 'devis' | 'email' | 'whatsapp' | 'livraison';
type ActionStatus = 'idle' | 'running' | 'done' | 'error';

const ACTION_LABELS: Record<ActionKey, string> = {
  print:    'Impression ticket',
  facture:  'Création facture',
  devis:    'Création devis',
  email:    'Envoi email',
  whatsapp: 'Envoi WhatsApp',
  livraison:'Création livraison',
};

function ActionStatusIcon({ status }: { status?: ActionStatus }) {
  if (!status || status === 'idle') return null;
  if (status === 'running') return <Icon name="ArrowPathIcon" size={13} className="animate-spin text-blue-500 shrink-0" />;
  if (status === 'done') return <Icon name="CheckCircleIcon" size={13} className="text-emerald-500 shrink-0" />;
  return <Icon name="ExclamationCircleIcon" size={13} className="text-red-500 shrink-0" />;
}

interface ActionRowProps {
  checked: boolean;
  onToggle: () => void;
  emoji: string;
  label: string;
  desc: string;
  status?: ActionStatus;
  errorMsg?: string;
  children?: React.ReactNode;
}

function ActionRow({ checked, onToggle, emoji, label, desc, status, errorMsg, children }: ActionRowProps) {
  return (
    <div
      className={`rounded-xl border-2 transition-all ${checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/20'}`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3.5 text-left"
      >
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${checked ? 'bg-primary border-primary' : 'border-border'}`}>
          {checked && <Icon name="CheckIcon" size={11} className="text-white" />}
        </div>
        <span className="text-lg shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-600 text-foreground leading-tight">{label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{desc}</p>
        </div>
        <ActionStatusIcon status={status} />
      </button>
      {(checked || (status && status !== 'idle')) && (children || errorMsg) && (
        <div className="px-3.5 pb-3.5">
          {children}
          {errorMsg && (
            <p className="mt-1.5 text-xs text-red-600 font-500">⚠️ {errorMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PostPaymentDocModal({ total, client, items, paymentMethod, ticketRef, loyaltyInfo, rewardDiscountAmount = 0, globalDiscountAmount = 0, referralCode, onClose }: PostPaymentDocModalProps) {
  const clientEmail = client?.email ?? '';
  const hasClientEmail = clientEmail.includes('@');

  const [actions, setActions] = useState<Record<ActionKey, boolean>>(() => ({
    print: !hasClientEmail,
    facture: total > 100,
    devis: false,
    email: hasClientEmail,
    whatsapp: false,
    livraison: false,
  }));

  const [email, setEmail] = useState(clientEmail);
  const [whatsappPhone, setWhatsappPhone] = useState(client?.phone ?? '');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryPhone, setDeliveryPhone] = useState(client?.phone ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [statuses, setStatuses] = useState<Partial<Record<ActionKey, ActionStatus>>>({});
  const [errorMsgs, setErrorMsgs] = useState<Partial<Record<ActionKey, string>>>({});
  const [executing, setExecuting] = useState(false);
  const [allDone, setAllDone] = useState(false);

  const selectedKeys = (Object.keys(actions) as ActionKey[]).filter((k) => actions[k]);
  const selectedCount = selectedKeys.length;

  const toggle = (key: ActionKey) => setActions((prev) => ({ ...prev, [key]: !prev[key] }));
  const setSt = (key: ActionKey, s: ActionStatus) => setStatuses((prev) => ({ ...prev, [key]: s }));
  const setErr = (key: ActionKey, msg: string) => setErrorMsgs((prev) => ({ ...prev, [key]: msg }));

  const handleExecute = async () => {
    if (selectedCount === 0 || executing) return;
    setExecuting(true);

    const now = new Date();
    const ticketNumber = ticketRef || generateTicketNumber();
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const s = loadSettingsFromCache();
    const subtotalHT = total / (1 + s.tvaRate / 100);
    const totalTVA = total - subtotalHT;
    const loyaltyBlock = client && loyaltyInfo && loyaltyInfo.pointsEarned > 0 ? {
      pointsEarned: loyaltyInfo.pointsEarned,
      totalPoints: loyaltyInfo.totalPoints,
      currentTierName: loyaltyInfo.currentTierName ?? null,
      nextTierName: loyaltyInfo.nextTier?.name ?? null,
      pointsToNext: loyaltyInfo.pointsToNext,
    } : undefined;

    const isDemoMode = items.some(i => i.isDemo);

    if (actions.print) {
      setSt('print', 'running');
      try {
        openAndPrint(generateTicketHTML({
          ...s, ticketNumber, dateStr, timeStr,
          clientName: client?.name,
          items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType, promoName: i.promoName })),
          subtotalHT, totalTVA, totalTTC: total,
          paymentMethod: paymentMethod || 'Carte / Espèces',
          loyalty: loyaltyBlock,
          isDemo: isDemoMode,
          globalDiscount: globalDiscountAmount > 0 ? globalDiscountAmount : undefined,
          rewardDiscountAmount: rewardDiscountAmount > 0 ? rewardDiscountAmount : undefined,
          referralCode: referralCode,
        }));
        setSt('print', 'done');
      } catch { setSt('print', 'error'); setErr('print', "Erreur ouverture impression"); }
    }

    if (actions.facture) {
      setSt('facture', 'running');
      try {
        openAndPrint(generateFactureHTML({
          ...s, numero: 'FAC-…', docType: 'facture',
          dateStr, timeStr,
          clientName: client?.name,
          items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType })),
          subtotalHT, totalTVA, totalTTC: total,
          paymentMethod: paymentMethod || 'Carte / Espèces',
          globalDiscount: globalDiscountAmount > 0 ? globalDiscountAmount : undefined,
        }));
        const res = await fetch('/api/factures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc_type: 'facture',
            client_name: client?.name ?? null,
            items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
            total_ht: subtotalHT, total_tva: totalTVA, total_ttc: total,
            tva_rate: s.tvaRate, payment_method: paymentMethod || 'Carte / Espèces',
            status: 'payee', receipt_ref: ticketNumber,
            is_counted_in_ca: true,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        setSt('facture', 'done');
      } catch (e: unknown) {
        setSt('facture', 'error');
        setErr('facture', e instanceof Error ? e.message : 'Erreur sauvegarde facture');
      }
    }

    if (actions.devis) {
      setSt('devis', 'running');
      try {
        // Save to DB first to get the server-assigned numero
        const res = await fetch('/api/factures', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc_type: 'devis',
            client_name: client?.name ?? null,
            items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
            total_ht: subtotalHT, total_tva: totalTVA, total_ttc: total,
            tva_rate: s.tvaRate, status: 'en_attente', receipt_ref: ticketNumber,
            is_counted_in_ca: false,  // devis never counts in CA
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }
        const saved = await res.json();
        const devisNum = saved.numero ?? `DEV-${now.getFullYear()}-????`;
        openAndPrint(generateFactureHTML({
          ...s, numero: devisNum, docType: 'devis',
          dateStr, timeStr,
          clientName: client?.name,
          items: items.map(i => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType })),
          subtotalHT, totalTVA, totalTTC: total,
        }));
        setSt('devis', 'done');
      } catch (e: unknown) {
        setSt('devis', 'error');
        setErr('devis', e instanceof Error ? e.message : 'Erreur sauvegarde devis');
      }
    }

    if (actions.email) {
      setSt('email', 'running');
      if (!email.includes('@')) {
        setSt('email', 'error'); setErr('email', 'Adresse email invalide');
      } else {
        try {
          const result = await sendReceiptEmail(email, {
            ticketNumber, date: todayFR(), clientName: client?.name,
            items: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount > 0 ? i.discount : undefined })),
            subtotalHT, totalTVA, totalTTC: total,
            paymentMethod: paymentMethod || 'Carte / Espèces',
          });
          if (result.success) {
            setSt('email', 'done');
            // Save email to client profile if new or updated
            if (client?.id && email !== (client.email ?? '')) {
              fetch(`/api/clients/${client.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
              }).catch(() => {});
            }
          }
          else { setSt('email', 'error'); setErr('email', result.error ?? 'Erreur inconnue'); }
        } catch (e: any) { setSt('email', 'error'); setErr('email', e.message ?? 'Erreur'); }
      }
    }

    if (actions.whatsapp) {
      setSt('whatsapp', 'running');
      const normalized = whatsappPhone.replace(/\s+/g, '').replace(/^0/, '33');
      const msg = `Bonjour${client?.name ? ` ${client.name}` : ''}, merci pour votre achat de ${total.toFixed(2)} €. Bonne journée !`;
      window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, '_blank');
      setSt('whatsapp', 'done');
    }

    if (actions.livraison) {
      if (!deliveryAddress.trim()) {
        setSt('livraison', 'error'); setErr('livraison', 'Adresse requise');
      } else {
        setSt('livraison', 'running');
        try {
          await deliveryService.create({
            clientName: client?.name ?? 'Client caisse',
            clientPhone: deliveryPhone || client?.phone || undefined,
            deliveryAddress: deliveryAddress.trim(),
            deliveryNotes: deliveryNotes || undefined,
            products: items.map((i) => ({ name: i.name, qty: i.qty, sku: i.sku || undefined, price: i.price })),
            totalAmount: total,
          });
          setSt('livraison', 'done');
        } catch (e: any) { setSt('livraison', 'error'); setErr('livraison', e.message ?? 'Erreur création'); }
      }
    }

    setExecuting(false);
    setAllDone(true);
  };

  const doneCount = (Object.values(statuses) as ActionStatus[]).filter((s) => s === 'done').length;
  const hasErrors = (Object.values(statuses) as ActionStatus[]).some((s) => s === 'error');


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Icon name="CheckCircleIcon" size={20} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-700 text-foreground">Paiement encaissé</h2>
              <p className="text-sm text-muted-foreground">{total.toFixed(2)} € · Que souhaitez-vous faire ?</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4 space-y-2">
          {allDone ? (
            <div className="space-y-3 py-1">
              <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-600 ${hasErrors ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
                <Icon name={hasErrors ? 'ExclamationTriangleIcon' : 'CheckCircleIcon'} size={16} className={hasErrors ? 'text-amber-600 shrink-0' : 'text-emerald-600 shrink-0'} />
                {hasErrors
                  ? `⚠️ ${doneCount} action${doneCount !== 1 ? 's' : ''} réussie${doneCount !== 1 ? 's' : ''}, erreurs ci-dessous`
                  : `✅ ${doneCount} action${doneCount !== 1 ? 's' : ''} effectuée${doneCount !== 1 ? 's' : ''}`}
              </div>
              {(Object.entries(statuses) as [ActionKey, ActionStatus][]).map(([key, st]) => (
                <div key={key} className="flex items-center gap-2.5 px-1 text-sm">
                  <ActionStatusIcon status={st} />
                  <span className={st === 'error' ? 'text-red-600' : 'text-foreground'}>
                    {ACTION_LABELS[key]}{st === 'error' && errorMsgs[key] ? ` — ${errorMsgs[key]}` : ''}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-[11px] font-600 text-muted-foreground uppercase tracking-wide pb-1">
                Sélectionnez une ou plusieurs actions :
              </p>

              <ActionRow checked={actions.print} onToggle={() => toggle('print')}
                emoji="🖨️" label="Imprimer le ticket" desc="Ticket thermique 80mm"
                status={statuses.print} errorMsg={errorMsgs.print} />

              <ActionRow checked={actions.facture} onToggle={() => toggle('facture')}
                emoji="📄" label="Créer une facture" desc="Facture légale avec TVA — compte dans le CA"
                status={statuses.facture} errorMsg={errorMsgs.facture} />

              <ActionRow checked={actions.devis} onToggle={() => toggle('devis')}
                emoji="📋" label="Créer un devis" desc="⚠️ Ne compte pas dans le CA tant que non converti"
                status={statuses.devis} errorMsg={errorMsgs.devis} />

              <ActionRow checked={actions.email} onToggle={() => toggle('email')}
                emoji="📧" label="Envoyer par email" desc={hasClientEmail ? `Email enregistré : ${clientEmail}` : "Ticket de caisse HTML par email"}
                status={statuses.email} errorMsg={errorMsgs.email}>
                {actions.email && (
                  <div className="mt-2 space-y-1">
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="email@client.fr" autoFocus
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {client?.id && !hasClientEmail && email.includes('@') && (
                      <p className="text-[11px] text-blue-600">
                        📁 Cet email sera enregistré dans la fiche client après envoi
                      </p>
                    )}
                    {client?.id && hasClientEmail && email !== clientEmail && (
                      <p className="text-[11px] text-amber-600">
                        ✏️ L'email de la fiche sera mis à jour avec cette adresse
                      </p>
                    )}
                  </div>
                )}
              </ActionRow>

              <ActionRow checked={actions.whatsapp} onToggle={() => toggle('whatsapp')}
                emoji="📱" label="Envoyer par WhatsApp" desc="Ouvre WhatsApp avec message de confirmation"
                status={statuses.whatsapp} errorMsg={errorMsgs.whatsapp}>
                {actions.whatsapp && (
                  <input
                    type="tel" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="06 XX XX XX XX"
                    className="mt-2 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                )}
              </ActionRow>

              <ActionRow checked={actions.livraison} onToggle={() => toggle('livraison')}
                emoji="🚚" label="Créer une livraison" desc="Programmer la livraison à domicile"
                status={statuses.livraison} errorMsg={errorMsgs.livraison}>
                {actions.livraison && (
                  <div className="mt-2 space-y-2">
                    <input type="text" value={deliveryAddress} onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="Adresse de livraison *"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    <input type="tel" value={deliveryPhone} onChange={(e) => setDeliveryPhone(e.target.value)}
                      placeholder="Téléphone client"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                    <input type="text" value={deliveryNotes} onChange={(e) => setDeliveryNotes(e.target.value)}
                      placeholder="Notes (digicode, étage…)"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300" />
                  </div>
                )}
              </ActionRow>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-border shrink-0 space-y-2">
          {allDone ? (
            <button onClick={onClose}
              className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-all">
              Fermer
            </button>
          ) : (
            <>
              <button
                onClick={handleExecute}
                disabled={selectedCount === 0 || executing}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {executing ? (
                  <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />En cours…</>
                ) : (
                  <><Icon name="CheckIcon" size={14} />
                  {selectedCount === 0
                    ? 'Sélectionnez des actions'
                    : `Exécuter ${selectedCount} action${selectedCount > 1 ? 's' : ''} sélectionnée${selectedCount > 1 ? 's' : ''}`}
                  </>
                )}
              </button>
              <button onClick={onClose}
                className="w-full py-2.5 border border-border rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                Fermer sans action
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

