'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  loyaltyService,
  type LoyaltyTier,
  type LoyaltyRewardProduct,
  type LoyaltyDashboardStats,
  REWARD_TYPE_LABELS,
  REWARD_TYPE_ICONS,
  type RewardType,
  type CreateTierInput,
} from '@/lib/services/loyaltyService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Tab = 'dashboard' | 'tiers' | 'products';

const REWARD_TYPES: { value: RewardType; label: string; icon: string }[] = [
  { value: 'discount', label: 'Réduction %', icon: '🏷️' },
  { value: 'free_product', label: 'Produit offert', icon: '🎁' },
  { value: 'double_points', label: 'Points doublés', icon: '⚡' },
  { value: 'private_offer', label: 'Offre privée', icon: '🔒' },
  { value: 'vip_access', label: 'Accès VIP', icon: '💎' },
  { value: 'buy_one_get_one', label: '1 acheté = 1 offert', icon: '🛍️' },
  { value: 'free_shipping', label: 'Livraison offerte', icon: '📦' },
  { value: 'surprise_gift', label: 'Cadeau surprise', icon: '🎀' },
  { value: 'category_discount', label: 'Remise catégorie', icon: '✂️' },
];

const TIER_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#f97316', '#06b6d4', '#84cc16', '#ef4444', '#6366f1',
  '#14b8a6', '#f43f5e', '#a855f7',
];

const TIER_BADGE: Record<string, string> = {
  bronze: 'text-amber-700 bg-amber-50 border-amber-200',
  silver: 'text-slate-600 bg-slate-50 border-slate-200',
  gold: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  platinum: 'text-purple-700 bg-purple-50 border-purple-200',
};

const TIER_LABEL: Record<string, string> = {
  bronze: 'Bronze', silver: 'Argent', gold: 'Or', platinum: 'Platine',
};

const STATUS_BADGE: Record<string, string> = {
  pending: 'text-amber-700 bg-amber-50 border-amber-200',
  validated: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-red-700 bg-red-50 border-red-200',
};
const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente', validated: 'Validé', cancelled: 'Annulé',
};

const CATEGORY_LABELS: Record<string, string> = {
  gift: 'Cadeau', old_stock: 'Ancien stock', surprise: 'Surprise', vip: 'VIP',
};

// ── Tier Form Modal ────────────────────────────────────────────────────────────

function TierFormModal({
  tier,
  rewardProducts,
  onClose,
  onSaved,
}: {
  tier: LoyaltyTier | null;
  rewardProducts: LoyaltyRewardProduct[];
  onClose: () => void;
  onSaved: (t: LoyaltyTier) => void;
}) {
  const [form, setForm] = useState<CreateTierInput>({
    name: tier?.name ?? '',
    pointsRequired: tier?.pointsRequired ?? 100,
    rewardType: tier?.rewardType ?? 'discount',
    rewardDescription: tier?.rewardDescription ?? '',
    rewardValue: tier?.rewardValue ?? 0,
    rewardProductId: tier?.rewardProductId ?? null,
    isActive: tier?.isActive ?? true,
    sortOrder: tier?.sortOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim() || !form.rewardDescription.trim()) return;
    setSaving(true);
    let result: LoyaltyTier | null = null;
    if (tier) {
      result = await loyaltyService.updateTier(tier.id, form);
    } else {
      result = await loyaltyService.createTier(form);
    }
    if (result) onSaved(result);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-700 text-foreground">{tier ? 'Modifier le palier' : 'Nouveau palier fidélité'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Nom du palier</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex: Palier VIP — 500 points" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Points requis</label>
              <input type="number" min={1} value={form.pointsRequired}
                onChange={(e) => setForm((f) => ({ ...f, pointsRequired: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Ordre d'affichage</label>
              <input type="number" min={0} value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-2">Type de récompense</label>
            <div className="grid grid-cols-3 gap-2">
              {REWARD_TYPES.map((rt) => (
                <button key={rt.value} onClick={() => setForm((f) => ({ ...f, rewardType: rt.value }))}
                  className={`flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg border text-xs font-600 transition-colors ${form.rewardType === rt.value ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  <span className="text-base">{rt.icon}</span>
                  <span className="text-center leading-tight">{rt.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Description de la récompense</label>
            <textarea value={form.rewardDescription}
              onChange={(e) => setForm((f) => ({ ...f, rewardDescription: e.target.value }))}
              rows={2} placeholder="Ex: Réduction -10% sur votre prochain achat"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          {(form.rewardType === 'discount' || form.rewardType === 'category_discount') && (
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Valeur de la réduction (%)</label>
              <input type="number" min={0} max={100} value={form.rewardValue}
                onChange={(e) => setForm((f) => ({ ...f, rewardValue: parseFloat(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          )}
          {(form.rewardType === 'free_product' || form.rewardType === 'surprise_gift') && rewardProducts.length > 0 && (
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Produit récompense (optionnel)</label>
              <select value={form.rewardProductId ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, rewardProductId: e.target.value || null }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">— Sélectionner un produit —</option>
                {rewardProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.productName} (stock: {p.stockQuantity})</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="tierActive" checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary" />
            <label htmlFor="tierActive" className="text-sm text-foreground">Palier actif</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !form.name.trim() || !form.rewardDescription.trim()}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />{tier ? 'Modifier' : 'Créer le palier'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Product Form Modal ─────────────────────────────────────────────────────────

function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product: LoyaltyRewardProduct | null;
  onClose: () => void;
  onSaved: (p: LoyaltyRewardProduct) => void;
}) {
  const [form, setForm] = useState({
    productName: product?.productName ?? '',
    sku: product?.sku ?? '',
    description: product?.description ?? '',
    stockQuantity: product?.stockQuantity ?? 0,
    rewardCategory: product?.rewardCategory ?? 'gift',
    isActive: product?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.productName.trim()) return;
    setSaving(true);
    let result: LoyaltyRewardProduct | null = null;
    if (product) {
      result = await loyaltyService.updateRewardProduct(product.id, {
        productName: form.productName,
        sku: form.sku || null,
        description: form.description || null,
        stockQuantity: form.stockQuantity,
        rewardCategory: form.rewardCategory,
        isActive: form.isActive,
      });
    } else {
      result = await loyaltyService.createRewardProduct({
        productName: form.productName,
        sku: form.sku || null,
        description: form.description || null,
        stockQuantity: form.stockQuantity,
        rewardCategory: form.rewardCategory,
        isActive: form.isActive,
      });
    }
    if (result) onSaved(result);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-700 text-foreground">{product ? 'Modifier le produit' : 'Nouveau produit récompense'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Nom du produit</label>
            <input value={form.productName} onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Ex: Vernis collection printemps" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">SKU / Référence</label>
              <input value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="VER-001" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Stock disponible</label>
              <input type="number" min={0} value={form.stockQuantity}
                onChange={(e) => setForm((f) => ({ ...f, stockQuantity: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Catégorie</label>
            <select value={form.rewardCategory} onChange={(e) => setForm((f) => ({ ...f, rewardCategory: e.target.value }))}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="gift">Cadeau fidélité</option>
              <option value="old_stock">Ancien stock à écouler</option>
              <option value="surprise">Cadeau surprise</option>
              <option value="vip">Récompense VIP</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="prodActive" checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              className="w-4 h-4 rounded border-border text-primary" />
            <label htmlFor="prodActive" className="text-sm text-foreground">Produit actif</label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !form.productName.trim()}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />{product ? 'Modifier' : 'Ajouter'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LoyaltyPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<LoyaltyDashboardStats | null>(null);
  const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
  const [rewardProducts, setRewardProducts] = useState<LoyaltyRewardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LoyaltyRewardProduct | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [statsData, tiersData, productsData] = await Promise.all([
      loyaltyService.getDashboardStats(),
      loyaltyService.getTiers(),
      loyaltyService.getRewardProducts(),
    ]);
    setStats(statsData);
    setTiers(tiersData);
    setRewardProducts(productsData);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleTierSaved = (t: LoyaltyTier) => {
    setTiers((prev) => {
      const idx = prev.findIndex((x) => x.id === t.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = t; return next.sort((a, b) => a.pointsRequired - b.pointsRequired); }
      return [...prev, t].sort((a, b) => a.pointsRequired - b.pointsRequired);
    });
    setShowTierForm(false);
    setEditingTier(null);
  };

  const handleDeleteTier = async (id: string) => {
    await loyaltyService.deleteTier(id);
    setTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleProductSaved = (p: LoyaltyRewardProduct) => {
    setRewardProducts((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
      return [...prev, p];
    });
    setShowProductForm(false);
    setEditingProduct(null);
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: 'ChartBarIcon' },
    { id: 'tiers', label: `Paliers (${tiers.length})`, icon: 'TrophyIcon' },
    { id: 'products', label: `Produits récompenses (${rewardProducts.length})`, icon: 'GiftIcon' },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white shrink-0">
          <div>
            <h1 className="text-xl font-700 text-foreground flex items-center gap-2">
              <span className="text-2xl">💎</span> Système Fidélité
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Paliers automatiques, récompenses intelligentes, dashboard complet</p>
          </div>
          <div className="flex items-center gap-2">
            {tab === 'tiers' && (
              <button onClick={() => { setEditingTier(null); setShowTierForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
                <Icon name="PlusIcon" size={15} />
                Nouveau palier
              </button>
            )}
            {tab === 'products' && (
              <button onClick={() => { setEditingProduct(null); setShowProductForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
                <Icon name="PlusIcon" size={15} />
                Ajouter produit
              </button>
            )}
            <button onClick={loadData} className="p-2 border border-border rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="ArrowPathIcon" size={16} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border bg-white shrink-0 px-4">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-500 border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              <Icon name={t.icon as any} size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-muted/20">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Icon name="ArrowPathIcon" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* ── DASHBOARD ── */}
              {tab === 'dashboard' && stats && (
                <div className="p-6 space-y-6">
                  {/* KPI Strip */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: 'Clientes fidélité', value: stats.totalClients.toString(), icon: 'UsersIcon', color: 'text-blue-600 bg-blue-50' },
                      { label: 'Points émis', value: stats.totalPointsIssued.toLocaleString('fr-FR'), icon: 'StarIcon', color: 'text-amber-600 bg-amber-50' },
                      { label: 'Récompenses utilisées', value: stats.totalRedemptions.toString(), icon: 'GiftIcon', color: 'text-emerald-600 bg-emerald-50' },
                      { label: 'Panier moyen', value: `${stats.avgBasket.toFixed(2)} €`, icon: 'ShoppingBagIcon', color: 'text-purple-600 bg-purple-50' },
                    ].map((kpi) => (
                      <div key={kpi.label} className="bg-white rounded-xl border border-border p-4 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                          <Icon name={kpi.icon as any} size={20} />
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">{kpi.label}</p>
                          <p className="text-xl font-700 text-foreground tabular-nums">{kpi.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Clients */}
                    <div className="bg-white rounded-xl border border-border p-5">
                      <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                        <Icon name="TrophyIcon" size={16} className="text-amber-500" />
                        Top 10 clientes par points
                      </h2>
                      {stats.topClients.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée disponible</p>
                      ) : (
                        <div className="space-y-2">
                          {stats.topClients.map((c, idx) => (
                            <div key={c.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-700 shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-700' : idx === 1 ? 'bg-slate-100 text-slate-600' : idx === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                                {idx + 1}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-600 text-foreground truncate">{c.fullName}</p>
                                <p className="text-[11px] text-muted-foreground">{c.totalSpent.toFixed(2)} € dépensés · {c.totalVisits} visites</p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-700 tabular-nums text-amber-600">{c.loyaltyPoints.toLocaleString('fr-FR')} pts</p>
                                <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full border ${TIER_BADGE[c.loyaltyTier] ?? TIER_BADGE.bronze}`}>
                                  {TIER_LABEL[c.loyaltyTier] ?? c.loyaltyTier}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reward Breakdown */}
                    <div className="bg-white rounded-xl border border-border p-5">
                      <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                        <Icon name="GiftIcon" size={16} className="text-emerald-500" />
                        Récompenses utilisées par type
                      </h2>
                      {stats.rewardBreakdown.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-8">Aucune récompense utilisée</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={stats.rewardBreakdown} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip formatter={(v: any) => [`${v} utilisations`, 'Récompenses']} />
                            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                              {stats.rewardBreakdown.map((_, i) => (
                                <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>

                  {/* Recent Redemptions */}
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
                      <Icon name="ClockIcon" size={16} className="text-blue-500" />
                      Dernières récompenses débloquées
                    </h2>
                    {stats.recentRedemptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">Aucune récompense enregistrée</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-2 px-3 text-xs font-600 text-muted-foreground">Cliente</th>
                              <th className="text-left py-2 px-3 text-xs font-600 text-muted-foreground">Récompense</th>
                              <th className="text-left py-2 px-3 text-xs font-600 text-muted-foreground">Points</th>
                              <th className="text-left py-2 px-3 text-xs font-600 text-muted-foreground">Date</th>
                              <th className="text-left py-2 px-3 text-xs font-600 text-muted-foreground">Statut</th>
                            </tr>
                          </thead>
                          <tbody>
                            {stats.recentRedemptions.map((r) => (
                              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                <td className="py-2.5 px-3 font-500 text-foreground">{r.clientName}</td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span>{REWARD_TYPE_ICONS[r.rewardType] ?? '🎁'}</span>
                                    <span className="text-foreground truncate max-w-[180px]">{r.rewardDescription}</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 tabular-nums text-amber-600 font-600">{r.pointsAtRedemption.toLocaleString('fr-FR')}</td>
                                <td className="py-2.5 px-3 text-muted-foreground">{new Date(r.redeemedAt).toLocaleDateString('fr-FR')}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`text-[10px] font-600 px-2 py-0.5 rounded-full border ${STATUS_BADGE[r.status] ?? STATUS_BADGE.pending}`}>
                                    {STATUS_LABEL[r.status] ?? r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Points summary */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">⭐</span>
                        <div>
                          <p className="text-xs text-amber-700 font-600">Points émis au total</p>
                          <p className="text-3xl font-700 text-amber-800 tabular-nums">{stats.totalPointsIssued.toLocaleString('fr-FR')}</p>
                        </div>
                      </div>
                      <p className="text-xs text-amber-600">≈ {(stats.totalPointsIssued / 100).toFixed(2)} € de valeur fidélité</p>
                    </div>
                    <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-5">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">🎁</span>
                        <div>
                          <p className="text-xs text-emerald-700 font-600">Points utilisés</p>
                          <p className="text-3xl font-700 text-emerald-800 tabular-nums">{stats.totalPointsUsed.toLocaleString('fr-FR')}</p>
                        </div>
                      </div>
                      <p className="text-xs text-emerald-600">
                        Points restants: {(stats.totalPointsIssued - stats.totalPointsUsed).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ── TIERS ── */}
              {tab === 'tiers' && (
                <div className="p-6">
                  <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
                    <strong>💡 Conseil :</strong> Les paliers se déclenchent automatiquement en caisse quand une cliente atteint le nombre de points requis. Le système affiche une notification de récompense et indique combien de points il reste avant le prochain palier.
                  </div>
                  {tiers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="text-5xl mb-4">🏆</span>
                      <p className="text-base font-600 text-foreground">Aucun palier configuré</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">Créez votre premier palier fidélité</p>
                      <button onClick={() => setShowTierForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
                        <Icon name="PlusIcon" size={15} />
                        Créer un palier
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tiers.map((tier, idx) => (
                        <div key={tier.id} className={`bg-white rounded-xl border border-border p-4 flex items-center gap-4 ${!tier.isActive ? 'opacity-50' : ''}`}>
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white text-sm font-700"
                            style={{ backgroundColor: TIER_COLORS[idx % TIER_COLORS.length] }}>
                            {tier.pointsRequired >= 1000 ? `${(tier.pointsRequired / 1000).toFixed(tier.pointsRequired % 1000 === 0 ? 0 : 1)}k` : tier.pointsRequired}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-700 text-foreground">{tier.name}</p>
                              {!tier.isActive && (
                                <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">Inactif</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              <span className="text-xs text-muted-foreground font-mono font-600">{tier.pointsRequired.toLocaleString('fr-FR')} pts</span>
                              <span className="text-muted-foreground">·</span>
                              <span className="text-xs">{REWARD_TYPE_ICONS[tier.rewardType]} {REWARD_TYPE_LABELS[tier.rewardType] ?? tier.rewardType}</span>
                              {tier.rewardValue > 0 && (
                                <span className="text-xs text-rose-600 font-600">-{tier.rewardValue}%</span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{tier.rewardDescription}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button onClick={() => { setEditingTier(tier); setShowTierForm(true); }}
                              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Icon name="PencilIcon" size={14} />
                            </button>
                            <button onClick={() => handleDeleteTier(tier.id)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                              <Icon name="TrashIcon" size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── PRODUCTS ── */}
              {tab === 'products' && (
                <div className="p-6">
                  <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                    <strong>💡 Conseil :</strong> Assignez ici vos anciens stocks comme produits récompenses. Cela permet d'écouler intelligemment certains articles sans donner l'impression d'une liquidation.
                  </div>
                  {rewardProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <span className="text-5xl mb-4">🎁</span>
                      <p className="text-base font-600 text-foreground">Aucun produit récompense</p>
                      <p className="text-sm text-muted-foreground mt-1 mb-4">Ajoutez des produits à offrir en récompense fidélité</p>
                      <button onClick={() => setShowProductForm(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity">
                        <Icon name="PlusIcon" size={15} />
                        Ajouter un produit
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {rewardProducts.map((p) => (
                        <div key={p.id} className="bg-white rounded-xl border border-border p-4">
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-700 text-foreground truncate">{p.productName}</p>
                              {p.sku && <p className="text-[11px] text-muted-foreground font-mono">{p.sku}</p>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => { setEditingProduct(p); setShowProductForm(true); }}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                <Icon name="PencilIcon" size={13} />
                              </button>
                            </div>
                          </div>
                          {p.description && (
                            <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{p.description}</p>
                          )}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-600 px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                              {CATEGORY_LABELS[p.rewardCategory] ?? p.rewardCategory}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Icon name="ArchiveBoxIcon" size={12} className="text-muted-foreground" />
                              <span className={`text-xs font-700 tabular-nums ${p.stockQuantity <= 3 ? 'text-red-600' : p.stockQuantity <= 10 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {p.stockQuantity} en stock
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showTierForm && (
        <TierFormModal
          tier={editingTier}
          rewardProducts={rewardProducts}
          onClose={() => { setShowTierForm(false); setEditingTier(null); }}
          onSaved={handleTierSaved}
        />
      )}
      {showProductForm && (
        <ProductFormModal
          product={editingProduct}
          onClose={() => { setShowProductForm(false); setEditingProduct(null); }}
          onSaved={handleProductSaved}
        />
      )}
    </AppLayout>
  );
}
