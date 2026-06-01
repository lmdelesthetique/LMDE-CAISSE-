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
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Tab = 'dashboard' | 'tiers' | 'products';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

interface SlowMoverProduct {
  id: string;
  name: string;
  ref: string;
  stock: number;
  minStock: number;
  buyPrice: number;
  category: string;
}

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
    try {
      let result: LoyaltyTier | null = null;
      if (tier) {
        const res = await fetch(`/api/loyalty/tiers/${tier.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
        result = json as LoyaltyTier;
      } else {
        result = await loyaltyService.createTier(form);
      }
      if (result) {
        toast.success(`✓ Palier ${result.name} ${tier ? 'mis à jour' : 'créé'}`);
        onSaved(result);
      } else {
        throw new Error('Réponse invalide du serveur');
      }
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? 'Impossible de sauvegarder le palier'}`);
    } finally {
      setSaving(false);
    }
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

// ── Real Product Picker Modal ──────────────────────────────────────────────────

function RealProductPickerModal({
  product,
  tiers,
  onClose,
  onSaved,
}: {
  product: LoyaltyRewardProduct | null;
  tiers: LoyaltyTier[];
  onClose: () => void;
  onSaved: (p: LoyaltyRewardProduct) => void;
}) {
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; ref: string; stock: number; category: string; sell_price_ttc: number }>>([]);
  const [searching, setSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; ref: string; stock: number } | null>(null);
  const [rewardCategory, setRewardCategory] = useState(product?.rewardCategory ?? 'gift');
  const [linkedTierId, setLinkedTierId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // When editing, pre-populate selectedProduct from existing data
  useEffect(() => {
    if (product && product.sku && UUID_RE.test(product.sku)) {
      setSelectedProduct({ id: product.sku, name: product.productName, ref: '', stock: product.stockQuantity });
    }
  }, [product]);

  // Search products table
  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const supabase = createClient();
      const { data } = await supabase
        .from('products')
        .select('id, name, ref, stock, category, sell_price_ttc')
        .neq('product_status', 'archived')
        .or(`name.ilike.%${search}%,ref.ilike.%${search}%`)
        .order('name')
        .limit(12);
      setSearchResults(data ?? []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const handleSave = async () => {
    if (!selectedProduct) return;
    setSaving(true);
    const input = {
      productName: selectedProduct.name,
      sku: selectedProduct.id,
      description: null,
      stockQuantity: selectedProduct.stock,
      rewardCategory,
      isActive: true,
    };
    let result: LoyaltyRewardProduct | null = null;
    if (product) {
      result = await loyaltyService.updateRewardProduct(product.id, input);
    } else {
      result = await loyaltyService.createRewardProduct(input);
    }
    if (result && linkedTierId) {
      await loyaltyService.updateTier(linkedTierId, { rewardProductId: result.id });
    }
    if (result) onSaved(result);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-700 text-foreground">{product ? 'Modifier le produit récompense' : 'Choisir un produit récompense'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Product search */}
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Rechercher dans le catalogue</label>
            <div className="relative">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom ou référence du produit…"
                className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searching && <Icon name="ArrowPathIcon" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            {searchResults.length > 0 && (
              <div className="mt-1 border border-border rounded-lg overflow-hidden max-h-44 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { setSelectedProduct({ id: p.id, name: p.name, ref: p.ref, stock: p.stock }); setSearch(''); setSearchResults([]); }}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.ref} · {p.stock} en stock · {p.sell_price_ttc?.toFixed(2)} €</p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{p.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected product preview */}
          {selectedProduct ? (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                <Icon name="CheckIcon" size={16} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-emerald-900 truncate">{selectedProduct.name}</p>
                <p className="text-[11px] text-emerald-700">{selectedProduct.ref && `${selectedProduct.ref} · `}{selectedProduct.stock} en stock</p>
              </div>
              <button onClick={() => setSelectedProduct(null)} className="text-emerald-400 hover:text-emerald-700 transition-colors shrink-0">
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
          ) : (
            <div className="p-3 bg-muted/30 border border-border rounded-lg text-center text-sm text-muted-foreground">
              Aucun produit sélectionné — recherchez ci-dessus
            </div>
          )}

          {/* Category */}
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Catégorie de récompense</label>
            <select value={rewardCategory} onChange={(e) => setRewardCategory(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="gift">Cadeau fidélité</option>
              <option value="old_stock">Ancien stock à écouler</option>
              <option value="surprise">Cadeau surprise</option>
              <option value="vip">Récompense VIP</option>
            </select>
          </div>

          {/* Link to tier */}
          {tiers.length > 0 && (
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Lier à un palier (optionnel)</label>
              <select value={linkedTierId} onChange={(e) => setLinkedTierId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">— Aucun palier —</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.pointsRequired} pts)</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving || !selectedProduct}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />{product ? 'Modifier' : 'Ajouter comme récompense'}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Suggestion Config Modal ────────────────────────────────────────────────────

function SuggestionConfigModal({
  product,
  tiers,
  onClose,
  onSaved,
}: {
  product: SlowMoverProduct;
  tiers: LoyaltyTier[];
  onClose: () => void;
  onSaved: (p: LoyaltyRewardProduct) => void;
}) {
  const [rewardCategory, setRewardCategory] = useState<string>('old_stock');
  const [linkedTierId, setLinkedTierId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    const result = await loyaltyService.createRewardProduct({
      productName: product.name,
      sku: product.id,
      description: null,
      stockQuantity: product.stock,
      rewardCategory,
      isActive: true,
    });
    if (result && linkedTierId) {
      await loyaltyService.updateTier(linkedTierId, { rewardProductId: result.id });
    }
    if (result) onSaved(result);
    setSaving(false);
  };

  const immobilise = product.stock * product.buyPrice;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-700 text-foreground">Ajouter comme récompense</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Product summary */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-700 text-amber-900 truncate">{product.name}</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {product.ref} · {product.stock} en stock · {immobilise.toFixed(2)} € immobilisé
            </p>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Catégorie de récompense</label>
            <select value={rewardCategory} onChange={(e) => setRewardCategory(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              <option value="old_stock">Ancien stock à écouler</option>
              <option value="gift">Cadeau fidélité</option>
              <option value="surprise">Cadeau surprise</option>
              <option value="vip">Récompense VIP</option>
            </select>
          </div>

          {tiers.length > 0 && (
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1">Lier à un palier (optionnel)</label>
              <select value={linkedTierId} onChange={(e) => setLinkedTierId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                <option value="">— Aucun palier —</option>
                {tiers.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.pointsRequired} pts)</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center justify-center gap-2">
              {saving ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="GiftIcon" size={14} />Ajouter comme récompense</>}
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
  const [slowMovers, setSlowMovers] = useState<SlowMoverProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<LoyaltyTier | null>(null);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<LoyaltyRewardProduct | null>(null);
  const [suggestionTarget, setSuggestionTarget] = useState<SlowMoverProduct | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const handleRecalculatePaliers = async () => {
    setRecalculating(true);
    try {
      const res = await fetch('/api/admin/recalculate-paliers', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      toast.success(`✓ ${json.rewardsInserted} récompense(s) ajoutée(s) pour ${json.clientsProcessed} clientes`);
      await loadData();
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? 'Recalcul impossible'}`);
    } finally {
      setRecalculating(false);
    }
  };

  const loadSlowMovers = useCallback(async (existingRewardProducts: LoyaltyRewardProduct[]) => {
    const supabase = createClient();
    const linkedProductIds = new Set(
      existingRewardProducts
        .map((p) => p.sku)
        .filter((sku): sku is string => sku !== null && UUID_RE.test(sku))
    );
    const { data } = await supabase
      .from('products')
      .select('id, name, ref, stock, min_stock, buy_price, category')
      .eq('product_status', 'active')
      .order('stock', { ascending: false })
      .limit(50);

    const filtered = (data ?? [])
      .filter((p: any) => {
        const threshold = Math.max((Number(p.min_stock) || 0) * 2, 5);
        return Number(p.stock) >= threshold && !linkedProductIds.has(p.id);
      })
      .slice(0, 8)
      .map((p: any): SlowMoverProduct => ({
        id: p.id,
        name: p.name,
        ref: p.ref ?? '',
        stock: Number(p.stock) || 0,
        minStock: Number(p.min_stock) || 0,
        buyPrice: Number(p.buy_price) || 0,
        category: p.category ?? '',
      }));

    setSlowMovers(filtered);
  }, []);

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
    await loadSlowMovers(productsData);
    setLoading(false);
  }, [loadSlowMovers]);

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
    setSlowMovers((prev) => prev.filter((s) => s.id !== p.sku));
    setShowProductForm(false);
    setEditingProduct(null);
    setSuggestionTarget(null);
  };

  const handleDeleteProduct = async (id: string) => {
    await loyaltyService.deleteRewardProduct(id);
    setRewardProducts((prev) => prev.filter((p) => p.id !== id));
  };

  // Find which tier is linked to a reward product
  const tierForProduct = (productId: string): LoyaltyTier | undefined =>
    tiers.find((t) => t.rewardProductId === productId);

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
            {tab === 'dashboard' && (
              <button onClick={handleRecalculatePaliers} disabled={recalculating}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-40">
                {recalculating
                  ? <><Icon name="ArrowPathIcon" size={15} className="animate-spin" />Calcul…</>
                  : <><Icon name="SparklesIcon" size={15} />Recalculer tous les paliers</>
                }
              </button>
            )}
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
                                {c.loyaltyTier && (
                                  <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full border ${TIER_BADGE[c.loyaltyTier] ?? 'text-muted-foreground bg-muted border-border'}`}>
                                    {TIER_LABEL[c.loyaltyTier] ?? c.loyaltyTier}
                                  </span>
                                )}
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
                <div className="p-6 space-y-6">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
                    <strong>💡 Conseil :</strong> Tous les produits récompenses sont liés au catalogue réel. En caisse, le stock est automatiquement déduit quand une récompense &quot;Produit offert&quot; est utilisée.
                  </div>

                  {/* Registered reward products */}
                  {rewardProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-border">
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
                      {rewardProducts.map((p) => {
                        const isLinkedToCatalogue = p.sku !== null && UUID_RE.test(p.sku);
                        const linkedTier = tierForProduct(p.id);
                        return (
                          <div key={p.id} className="bg-white rounded-xl border border-border p-4">
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <p className="text-sm font-700 text-foreground truncate">{p.productName}</p>
                                  {isLinkedToCatalogue && (
                                    <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
                                      Lié catalogue
                                    </span>
                                  )}
                                </div>
                                {linkedTier && (
                                  <p className="text-[11px] text-purple-600 font-600">
                                    Palier : {linkedTier.name}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => { setEditingProduct(p); setShowProductForm(true); }}
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Icon name="PencilIcon" size={13} />
                                </button>
                                <button onClick={() => handleDeleteProduct(p.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors">
                                  <Icon name="TrashIcon" size={13} />
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
                        );
                      })}
                    </div>
                  )}

                  {/* Suggestions intelligentes */}
                  {slowMovers.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Icon name="LightBulbIcon" size={16} className="text-amber-500" />
                        <h2 className="text-sm font-700 text-foreground">Suggestions intelligentes — stocks dormants</h2>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">Ces produits ont un stock bien supérieur au minimum requis. Les proposer en récompense permet de les écouler intelligemment.</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        {slowMovers.map((p) => {
                          const immobilise = p.stock * p.buyPrice;
                          return (
                            <div key={p.id} className="bg-white rounded-xl border border-amber-200 p-3 hover:border-amber-400 transition-colors">
                              <p className="text-sm font-600 text-foreground truncate mb-0.5">{p.name}</p>
                              <p className="text-[11px] text-muted-foreground mb-2">{p.ref} · {p.category}</p>
                              <div className="flex items-center gap-1.5 mb-1">
                                <Icon name="ArchiveBoxIcon" size={11} className="text-amber-600" />
                                <span className="text-xs font-700 text-amber-700">{p.stock} en stock</span>
                              </div>
                              {p.buyPrice > 0 && (
                                <p className="text-[11px] text-muted-foreground mb-3">{immobilise.toFixed(2)} € immobilisé</p>
                              )}
                              <button
                                onClick={() => setSuggestionTarget(p)}
                                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-600 hover:bg-amber-100 transition-colors"
                              >
                                <Icon name="GiftIcon" size={12} />
                                Ajouter comme récompense
                              </button>
                            </div>
                          );
                        })}
                      </div>
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
        <RealProductPickerModal
          product={editingProduct}
          tiers={tiers}
          onClose={() => { setShowProductForm(false); setEditingProduct(null); }}
          onSaved={handleProductSaved}
        />
      )}
      {suggestionTarget && (
        <SuggestionConfigModal
          product={suggestionTarget}
          tiers={tiers}
          onClose={() => setSuggestionTarget(null)}
          onSaved={handleProductSaved}
        />
      )}
    </AppLayout>
  );
}
