'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  clientService,
  type Client,
  type ClientPurchase,
  type ClientSubscription,
  getClientDiscount,
} from '@/lib/services/clientService';
import {
  loyaltyService,
  getNextTier,
  pointsToNextTier,
  type LoyaltyTier,
  type ClientLoyaltyReward,
} from '@/lib/services/loyaltyService';

const TIER_CONFIG: Record<string, { label: string; color: string }> = {
  bronze: { label: 'Bronze', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  silver: { label: 'Argent', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  gold: { label: 'Or', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  platinum: { label: 'Platine', color: 'text-purple-700 bg-purple-50 border-purple-200' },
};

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  particulier: { label: 'Particulier', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  professionnel: { label: 'Pro', color: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
  vip: { label: 'VIP', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  abonne: { label: 'Abonné', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  non_abonne: { label: 'Non abonné', color: 'text-slate-600 bg-slate-50 border-slate-200' },
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces', card: 'Carte', alma: 'Alma', cheque: 'Chèque',
  virement: 'Virement', avoir: 'Avoir',
};

const REWARD_STATUS_BADGE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  used: 'bg-gray-100 text-gray-500 border-gray-200',
  expired: 'bg-red-100 text-red-600 border-red-200',
  cancelled: 'bg-red-100 text-red-600 border-red-200',
};

const REWARD_STATUS_LABEL: Record<string, string> = {
  available: 'Disponible', used: 'Utilisée', expired: 'Expirée', cancelled: 'Annulée',
};

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params?.id as string;

  const [client, setClient] = useState<Client | null>(null);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);
  const [subscription, setSubscription] = useState<ClientSubscription | null>(null);
  const [rewards, setRewards] = useState<ClientLoyaltyReward[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [referralData, setReferralData] = useState<{ referralCode: string | null; referralCount: number; referralPointsEarned: number; filleuls: any[] } | null>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const [c, purch, sub, tiers, rews] = await Promise.all([
        clientService.getById(clientId),
        clientService.getPurchases(clientId),
        clientService.getSubscription(clientId),
        loyaltyService.getTiers(),
        loyaltyService.getClientRewards(clientId),
      ]);
      if (!c) { setNotFound(true); setLoading(false); return; }
      setClient(c);
      setPurchases((purch ?? []).slice(0, 10));
      setSubscription(sub);
      setLoyaltyTiers(tiers);
      setRewards(rews);
      setLoading(false);

      // Load referral data (non-blocking)
      try {
        const [clientRow, refRes] = await Promise.all([
          fetch(`/api/clients/${clientId}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/referrals?clientId=${clientId}&role=parrain`).then(r => r.ok ? r.json() : []),
        ]);
        setReferralData({
          referralCode: clientRow?.referral_code ?? null,
          referralCount: clientRow?.referral_count ?? 0,
          referralPointsEarned: clientRow?.referral_points_earned ?? 0,
          filleuls: Array.isArray(refRes) ? refRes : [],
        });
      } catch { /* non-blocking */ }
    })();
  }, [clientId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-full">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (notFound || !client) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <p className="text-base font-600 text-foreground">Client introuvable</p>
          <button onClick={() => router.push('/pos-sales-terminal')}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
            <Icon name="ArrowLeftIcon" size={15} /> Retour à la caisse
          </button>
        </div>
      </AppLayout>
    );
  }

  const tier = TIER_CONFIG[client.loyaltyTier] ?? TIER_CONFIG.bronze;
  const typeConf = TYPE_CONFIG[client.clientType] ?? TYPE_CONFIG.particulier;
  const nextTier = loyaltyTiers.length > 0 ? getNextTier(loyaltyTiers, client.loyaltyPoints) : null;
  const ptsToNext = loyaltyTiers.length > 0 ? pointsToNextTier(loyaltyTiers, client.loyaltyPoints) : 0;
  const discount = getClientDiscount(client, subscription);
  const availableRewards = rewards.filter((r) => r.status === 'available');

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white shrink-0">
          <button
            onClick={() => router.push('/pos-sales-terminal')}
            className="flex items-center gap-2 text-sm font-600 text-primary hover:opacity-80 transition-opacity"
          >
            <Icon name="ArrowLeftIcon" size={15} />
            Retour à la caisse
          </button>
          <button
            onClick={() => router.push('/clients')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Voir tous les clients
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-muted/20">
          <div className="max-w-3xl mx-auto p-6 space-y-6">

            {/* Identity card */}
            <div className="bg-white rounded-xl border border-border p-6">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-2xl font-700 text-blue-700">{client.firstName.charAt(0).toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h1 className="text-xl font-700 text-foreground">{client.fullName}</h1>
                    <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${typeConf.color}`}>
                      {typeConf.label}
                    </span>
                    {subscription?.status === 'active' && (
                      <span className="text-[11px] font-600 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <Icon name="CheckBadgeIcon" size={11} /> {subscription.subscriptionType}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                    {client.phone && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon name="PhoneIcon" size={13} className="shrink-0" />
                        <span>{client.phone}</span>
                      </div>
                    )}
                    {client.email && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon name="EnvelopeIcon" size={13} className="shrink-0" />
                        <span>{client.email}</span>
                      </div>
                    )}
                    {client.address && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
                        <Icon name="MapPinIcon" size={13} className="shrink-0" />
                        <span>{[client.address, client.postalCode, client.city].filter(Boolean).join(', ')}</span>
                      </div>
                    )}
                    {client.dateOfBirth && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Icon name="CakeIcon" size={13} className="shrink-0" />
                        <span>{new Date(client.dateOfBirth).toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </div>
                  {discount > 0 && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-rose-100 border border-rose-200 rounded-lg">
                      <Icon name="TagIcon" size={12} className="text-rose-600" />
                      <span className="text-xs font-700 text-rose-700">Remise permanente : -{discount}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-700 tabular-nums text-foreground">{client.totalVisits}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Visites</p>
              </div>
              <div className="bg-white rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-700 tabular-nums text-foreground">{client.totalSpent.toFixed(2)} €</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total dépensé</p>
              </div>
              <div className="bg-white rounded-xl border border-border p-4 text-center">
                <p className="text-2xl font-700 tabular-nums text-foreground">{client.storeCredit.toFixed(2)} €</p>
                <p className="text-xs text-muted-foreground mt-0.5">Avoir</p>
              </div>
            </div>

            {/* Loyalty */}
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                <Icon name="StarIcon" size={15} className="text-amber-500" />
                Fidélité
              </h2>
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center flex-1">
                  <p className="text-3xl font-700 tabular-nums text-amber-700">{client.loyaltyPoints.toLocaleString('fr-FR')}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Points</p>
                </div>
                <div className={`rounded-xl p-4 text-center flex-1 border ${tier.color}`}>
                  <p className="text-xl font-700">{tier.label}</p>
                  <p className="text-xs mt-0.5 opacity-70">Palier</p>
                </div>
              </div>
              {nextTier && ptsToNext > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-muted-foreground">Vers : {nextTier.name}</span>
                    <span className="text-xs font-600 text-amber-600">encore {ptsToNext} pts</span>
                  </div>
                  <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.max(3,
                          ((client.loyaltyPoints % nextTier.pointsRequired) / nextTier.pointsRequired) * 100
                        ))}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Parrainage */}
            {referralData && (
              <div className="bg-white rounded-xl border border-border p-5">
                <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="UserGroupIcon" size={15} className="text-pink-500" />
                  Parrainage
                </h2>
                {referralData.referralCode ? (
                  <>
                    <div className="flex items-center gap-3 mb-4 p-3 bg-pink-50 border border-pink-200 rounded-xl">
                      <div>
                        <p className="text-[11px] text-pink-600 font-600 uppercase tracking-wide">Mon code parrainage</p>
                        <p className="text-2xl font-800 font-mono text-pink-700 tracking-widest mt-0.5">{referralData.referralCode}</p>
                      </div>
                      <div className="ml-auto flex flex-col gap-1.5">
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(referralData.referralCode ?? '');
                            import('sonner').then(({ toast }) => toast.success('Code copié !', { duration: 2000 }));
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-600 hover:bg-pink-700 transition-colors"
                        >
                          <Icon name="ClipboardDocumentIcon" size={12} />
                          Copier
                        </button>
                        <button
                          onClick={() => {
                            const msg = `Bonjour ! 👋\n\nJe te recommande Le Monde de l'Esthétique pour tes produits beauté ! 💅\n\nUtilise mon code parrainage : ${referralData.referralCode}\n\n🎁 Tu bénéficies de -10% sur ta première commande !`;
                            window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-500 text-white rounded-lg text-xs font-600 hover:bg-green-600 transition-colors"
                        >
                          <Icon name="ChatBubbleLeftRightIcon" size={12} />
                          WhatsApp
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-muted/30 rounded-lg p-3 text-center">
                        <p className="text-xl font-700 text-foreground">{referralData.referralCount}</p>
                        <p className="text-xs text-muted-foreground">Filleule{referralData.referralCount !== 1 ? 's' : ''}</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-3 text-center">
                        <p className="text-xl font-700 text-amber-700">+{referralData.referralPointsEarned}</p>
                        <p className="text-xs text-amber-600">Points gagnés</p>
                      </div>
                    </div>
                    {referralData.filleuls.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Historique</p>
                        {referralData.filleuls.map((r: any) => (
                          <div key={r.id} className="flex items-center gap-2 py-1.5 px-2 bg-muted/20 rounded-lg">
                            <Icon name="UserIcon" size={13} className="text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-500 text-foreground truncate">
                                {r.filleul ? `${r.filleul.first_name} ${r.filleul.last_name}` : 'Anonyme'}
                              </p>
                              <p className="text-[10px] text-muted-foreground">{new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                            </div>
                            {r.parrain_rewarded_at ? (
                              <span className="text-[10px] font-700 text-emerald-600 shrink-0">+{r.parrain_points} pts ✓</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground shrink-0">En attente</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">Code parrainage non encore généré</p>
                )}
              </div>
            )}

            {/* Rewards */}
            {rewards.length > 0 && (
              <div className="bg-white rounded-xl border border-border p-5">
                <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                  <Icon name="GiftIcon" size={15} className="text-violet-500" />
                  Récompenses
                  {availableRewards.length > 0 && (
                    <span className="ml-auto text-[11px] font-700 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                      {availableRewards.length} disponible{availableRewards.length > 1 ? 's' : ''}
                    </span>
                  )}
                </h2>
                <div className="space-y-2">
                  {rewards.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 px-3 bg-muted/20 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground truncate">{r.rewardDescription}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(r.unlockedAt).toLocaleDateString('fr-FR')}
                          {r.usedAt && ` · Utilisée le ${new Date(r.usedAt).toLocaleDateString('fr-FR')}`}
                        </p>
                      </div>
                      <span className={`shrink-0 text-[10px] font-700 px-2 py-0.5 rounded-full border ${REWARD_STATUS_BADGE[r.status] ?? REWARD_STATUS_BADGE.used}`}>
                        {REWARD_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Subscription detail */}
            {subscription && (
              <div className="bg-white rounded-xl border border-border p-5">
                <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                  <Icon name="CheckBadgeIcon" size={15} className="text-emerald-500" />
                  Abonnement
                </h2>
                <div className={`rounded-lg px-4 py-3 border flex items-center justify-between ${subscription.status === 'active' ? 'bg-emerald-50 border-emerald-200' : 'bg-muted/30 border-border'}`}>
                  <div>
                    <p className="text-sm font-700 text-foreground">{subscription.subscriptionType}</p>
                    {subscription.discountPercent > 0 && (
                      <p className="text-xs text-muted-foreground">Remise abonné : -{subscription.discountPercent}%</p>
                    )}
                    {subscription.endDate && (
                      <p className="text-xs text-muted-foreground">Expire : {new Date(subscription.endDate).toLocaleDateString('fr-FR')}</p>
                    )}
                  </div>
                  <span className={`text-xs font-700 px-2.5 py-1 rounded-full border ${
                    subscription.status === 'active' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                    subscription.status === 'expired' ? 'bg-red-100 text-red-600 border-red-200' :
                    'bg-muted text-muted-foreground border-border'
                  }`}>
                    {subscription.status === 'active' ? 'Actif' :
                     subscription.status === 'expired' ? 'Expiré' :
                     subscription.status === 'suspended' ? 'Suspendu' : 'Inactif'}
                  </span>
                </div>
              </div>
            )}

            {/* Purchase history */}
            <div className="bg-white rounded-xl border border-border p-5">
              <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
                <Icon name="ClockIcon" size={15} className="text-blue-500" />
                10 derniers achats
              </h2>
              {purchases.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucun achat enregistré</p>
              ) : (
                <div className="space-y-2">
                  {purchases.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 py-2.5 px-3 bg-muted/20 rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-500 text-foreground">{p.receiptNumber}</p>
                          <span className="text-[10px] text-muted-foreground">
                            {PAYMENT_LABELS[p.paymentMethod] ?? p.paymentMethod}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(p.purchasedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                          {p.loyaltyPointsEarned > 0 && ` · +${p.loyaltyPointsEarned} pts`}
                        </p>
                      </div>
                      <span className="text-sm font-700 tabular-nums text-foreground shrink-0">{p.totalTtc.toFixed(2)} €</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            {client.notes && (
              <div className="bg-white rounded-xl border border-border p-5">
                <h2 className="text-sm font-700 text-foreground mb-2 flex items-center gap-2">
                  <Icon name="DocumentTextIcon" size={15} className="text-muted-foreground" />
                  Notes
                </h2>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </AppLayout>
  );
}
