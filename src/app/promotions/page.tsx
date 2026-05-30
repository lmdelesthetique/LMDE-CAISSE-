'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ─────────────────────────────────────────────────────────────────────

type PromoType = 'discount' | 'bundle' | 'bogo';
type DiscountType = 'percent' | 'amount';

interface BundleProduct {
  product_id: string;
  name: string;
  sku: string;
  qty: number;
  unit_price: number;
}

interface Promotion {
  id: string;
  name: string;
  description: string | null;
  type: PromoType;
  discount_type: DiscountType | null;
  discount_value: number | null;
  products: BundleProduct[];
  bundle_price: number | null;
  min_qty: number | null;
  min_amount: number | null;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

interface ProductRow {
  id: string;
  name: string;
  ref: string;
  sell_price_ttc: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function promoTypeLabel(t: PromoType) {
  if (t === 'discount') return 'Remise';
  if (t === 'bundle') return 'Bundle';
  if (t === 'bogo') return '1 acheté = 1 offert';
  return t;
}

function promoTypeBadge(t: PromoType) {
  if (t === 'discount') return 'bg-amber-100 text-amber-800 border-amber-200';
  if (t === 'bundle')   return 'bg-blue-100 text-blue-800 border-blue-200';
  if (t === 'bogo')     return 'bg-emerald-100 text-emerald-800 border-emerald-200';
  return 'bg-gray-100 text-gray-800 border-gray-200';
}

const EMPTY_FORM = {
  name: '',
  description: '',
  type: 'discount' as PromoType,
  discount_type: 'percent' as DiscountType,
  discount_value: '',
  bundle_price: '',
  min_qty: '',
  min_amount: '',
  is_active: true,
  starts_at: '',
  ends_at: '',
  products: [] as BundleProduct[],
};

// ─── PromoFormModal ─────────────────────────────────────────────────────────────

function PromoFormModal({
  promo,
  onClose,
  onSaved,
}: {
  promo?: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!promo;
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (promo) {
      setForm({
        name: promo.name,
        description: promo.description ?? '',
        type: promo.type,
        discount_type: promo.discount_type ?? 'percent',
        discount_value: promo.discount_value != null ? String(promo.discount_value) : '',
        bundle_price: promo.bundle_price != null ? String(promo.bundle_price) : '',
        min_qty: promo.min_qty != null ? String(promo.min_qty) : '',
        min_amount: promo.min_amount != null ? String(promo.min_amount) : '',
        is_active: promo.is_active,
        starts_at: promo.starts_at ? promo.starts_at.slice(0, 10) : '',
        ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : '',
        products: promo.products ?? [],
      });
    }
  }, [promo]);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('id, name, ref, sell_price_ttc')
      .ilike('name', `%${q}%`)
      .eq('is_active', true)
      .limit(10);
    setSearchResults((data ?? []) as ProductRow[]);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(searchQ), 300);
    return () => clearTimeout(t);
  }, [searchQ, searchProducts]);

  const addProduct = (p: ProductRow) => {
    if (form.products.find((x) => x.product_id === p.id)) return;
    setForm((f) => ({
      ...f,
      products: [...f.products, { product_id: p.id, name: p.name, sku: p.ref, qty: 1, unit_price: Number(p.sell_price_ttc) || 0 }],
    }));
    setSearchQ('');
    setSearchResults([]);
  };

  const removeProduct = (id: string) =>
    setForm((f) => ({ ...f, products: f.products.filter((x) => x.product_id !== id) }));

  const updateBundleQty = (id: string, qty: number) =>
    setForm((f) => ({
      ...f,
      products: f.products.map((x) => x.product_id === id ? { ...x, qty: Math.max(1, qty) } : x),
    }));

  const bundleOriginalTotal = form.products.reduce((s, p) => s + p.unit_price * p.qty, 0);
  const bundlePrice = parseFloat(form.bundle_price) || 0;
  const bundleSaving = bundleOriginalTotal > 0 && bundlePrice > 0 ? bundleOriginalTotal - bundlePrice : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Le nom est requis.'); return; }
    if (form.type === 'bundle' && form.products.length < 2) { setError('Un bundle nécessite au moins 2 produits.'); return; }
    if (form.type === 'discount' && !form.discount_value) { setError('La valeur de remise est requise.'); return; }
    setError('');
    setSaving(true);

    const payload: any = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      type: form.type,
      discount_type: form.type === 'discount' || form.type === 'bogo' ? form.discount_type : null,
      discount_value: form.discount_value ? parseFloat(form.discount_value) : null,
      products: form.products,
      bundle_price: form.bundle_price ? parseFloat(form.bundle_price) : null,
      min_qty: form.min_qty ? parseInt(form.min_qty) : null,
      min_amount: form.min_amount ? parseFloat(form.min_amount) : null,
      is_active: form.is_active,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };

    const supabase = createClient();
    let error: any;
    if (isEdit) {
      ({ error } = await supabase.from('promotions').update(payload).eq('id', promo!.id));
    } else {
      ({ error } = await supabase.from('promotions').insert(payload));
    }

    setSaving(false);
    if (error) {
      setError(error.message);
    } else {
      toast.success(isEdit ? 'Promotion modifiée' : 'Promotion créée');
      onSaved();
      onClose();
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-700 text-foreground">{isEdit ? 'Modifier la promotion' : 'Nouvelle promotion'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Name + type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Nom *</label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Ex: Pack Soin Complet"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                required
              />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as PromoType }))}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="discount">Remise sur produit</option>
                <option value="bundle">Bundle (lot)</option>
                <option value="bogo">1 acheté = 1 offert</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={set('description')}
              rows={2}
              placeholder="Description affichée dans le POS…"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* Discount fields */}
          {(form.type === 'discount' || form.type === 'bogo') && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Type de remise</label>
                <div className="flex rounded-xl overflow-hidden border border-border text-sm">
                  <button type="button" onClick={() => setForm((f) => ({ ...f, discount_type: 'percent' }))}
                    className={`flex-1 py-2 font-600 transition-colors ${form.discount_type === 'percent' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                    %
                  </button>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, discount_type: 'amount' }))}
                    className={`flex-1 py-2 font-600 transition-colors ${form.discount_type === 'amount' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                    €
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Valeur ({form.discount_type === 'percent' ? '%' : '€'}) *
                </label>
                <input type="number" min="0" step="0.01" value={form.discount_value} onChange={set('discount_value')}
                  placeholder={form.discount_type === 'percent' ? '10' : '5.00'}
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
          )}

          {/* Bundle products */}
          {(form.type === 'bundle' || form.type === 'bogo') && (
            <div className="space-y-3">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block">
                Produits du bundle {form.type === 'bundle' ? '(min. 2)' : ''}
              </label>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder="Rechercher un produit à ajouter…"
                  className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {(searchResults.length > 0 || searching) && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {searching ? (
                      <div className="p-3 text-center text-sm text-muted-foreground">Recherche…</div>
                    ) : searchResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 text-left text-sm"
                      >
                        <div>
                          <span className="font-500 text-foreground">{p.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground font-mono">{p.ref}</span>
                        </div>
                        <span className="text-sm font-600 text-muted-foreground">{fmt(Number(p.sell_price_ttc))} €</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected products */}
              {form.products.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {form.products.map((p) => (
                    <div key={p.product_id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => updateBundleQty(p.product_id, p.qty - 1)}
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground text-xs">−</button>
                        <span className="w-8 text-center text-sm font-600 tabular-nums">{p.qty}</span>
                        <button type="button" onClick={() => updateBundleQty(p.product_id, p.qty + 1)}
                          className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground text-xs">+</button>
                      </div>
                      <span className="text-sm font-600 text-muted-foreground tabular-nums w-20 text-right">{fmt(p.unit_price * p.qty)} €</span>
                      <button type="button" onClick={() => removeProduct(p.product_id)} className="text-muted-foreground hover:text-red-500">
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    </div>
                  ))}
                  {bundleOriginalTotal > 0 && (
                    <div className="px-4 py-2 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Total catalogue</span>
                      <span className="font-600">{fmt(bundleOriginalTotal)} €</span>
                    </div>
                  )}
                </div>
              )}

              {/* Bundle price */}
              {form.type === 'bundle' && (
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Prix du bundle (€)</label>
                  <input type="number" min="0" step="0.01" value={form.bundle_price} onChange={set('bundle_price')}
                    placeholder="Prix spécial bundle…"
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  {bundleSaving > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">✓ Économie client : {fmt(bundleSaving)} €</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Conditions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Qté minimum</label>
              <input type="number" min="1" value={form.min_qty} onChange={set('min_qty')} placeholder="—"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Montant minimum (€)</label>
              <input type="number" min="0" step="0.01" value={form.min_amount} onChange={set('min_amount')} placeholder="—"
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Début</label>
              <input type="date" value={form.starts_at} onChange={set('starts_at')}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Fin</label>
              <input type="date" value={form.ends_at} onChange={set('ends_at')}
                className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
            <span className="text-sm font-500 text-foreground">Promotion active</span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-border shrink-0">
          <button
            type="submit"
            form="promo-form"
            onClick={handleSubmit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-700 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity text-sm"
          >
            {saving ? <Icon name="ArrowPathIcon" size={16} className="animate-spin" /> : <Icon name="CheckIcon" size={16} />}
            {isEdit ? 'Enregistrer les modifications' : 'Créer la promotion'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PromotionsPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableError, setTableError] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [filterType, setFilterType] = useState<PromoType | 'all'>('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        setTableError(true);
      } else {
        toast.error('Erreur de chargement : ' + error.message);
      }
      setLoading(false);
      return;
    }
    setPromotions((data ?? []) as Promotion[]);
    setTableError(false);
    setLoading(false);
  }, []);

  useEffect(() => { loadPromotions(); }, [loadPromotions]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    const supabase = createClient();
    const { error } = await supabase.from('promotions').delete().eq('id', id);
    if (error) {
      toast.error('Erreur suppression : ' + error.message);
    } else {
      toast.success('Promotion supprimée');
      setPromotions((p) => p.filter((x) => x.id !== id));
    }
    setDeleting(null);
  };

  const handleToggleActive = async (promo: Promotion) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('promotions')
      .update({ is_active: !promo.is_active })
      .eq('id', promo.id);
    if (error) {
      toast.error('Erreur : ' + error.message);
    } else {
      setPromotions((p) => p.map((x) => x.id === promo.id ? { ...x, is_active: !x.is_active } : x));
      toast.success(promo.is_active ? 'Promotion désactivée' : 'Promotion activée');
    }
  };

  const filtered = useMemo(() => {
    return promotions.filter((p) => {
      if (filterType !== 'all' && p.type !== filterType) return false;
      if (filterActive === 'active' && !p.is_active) return false;
      if (filterActive === 'inactive' && p.is_active) return false;
      if (search.trim() && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [promotions, filterType, filterActive, search]);

  const stats = useMemo(() => ({
    total: promotions.length,
    active: promotions.filter((p) => p.is_active).length,
    bundles: promotions.filter((p) => p.type === 'bundle').length,
    discounts: promotions.filter((p) => p.type === 'discount').length,
  }), [promotions]);

  const isExpired = (p: Promotion) => !!p.ends_at && new Date(p.ends_at) < new Date();
  const isScheduled = (p: Promotion) => !!p.starts_at && new Date(p.starts_at) > new Date();

  const setupSQL = `-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'discount',
  discount_type TEXT,
  discount_value DECIMAL(10,2),
  products JSONB DEFAULT '[]',
  bundle_price DECIMAL(10,2),
  min_qty INTEGER,
  min_amount DECIMAL(10,2),
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.promotions DISABLE ROW LEVEL SECURITY;`;

  if (tableError) {
    return (
      <AppLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Icon name="ExclamationTriangleIcon" size={24} className="text-amber-600" />
              <h2 className="text-base font-700 text-amber-800">Table promotions introuvable</h2>
            </div>
            <p className="text-sm text-amber-700">Exécutez ce SQL dans Supabase → SQL Editor :</p>
            <pre className="bg-white border border-amber-200 rounded-xl p-4 text-xs text-amber-900 overflow-x-auto whitespace-pre-wrap">{setupSQL}</pre>
            <button onClick={loadPromotions} className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-600 hover:bg-amber-700 transition-colors">
              <Icon name="ArrowPathIcon" size={15} /> Réessayer
            </button>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Promotions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gérez vos remises, bundles et offres spéciales</p>
          </div>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:opacity-90 transition-opacity"
          >
            <Icon name="PlusIcon" size={16} />
            Nouvelle promotion
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total', value: stats.total, color: 'text-foreground bg-muted/40', icon: 'TicketIcon' },
            { label: 'Actives', value: stats.active, color: 'text-emerald-700 bg-emerald-50', icon: 'CheckCircleIcon' },
            { label: 'Bundles', value: stats.bundles, color: 'text-blue-700 bg-blue-50', icon: 'CubeIcon' },
            { label: 'Remises', value: stats.discounts, color: 'text-amber-700 bg-amber-50', icon: 'TagIcon' },
          ].map((k) => (
            <div key={k.label} className={`rounded-2xl border border-border p-4 flex items-center gap-3 ${k.color}`}>
              <Icon name={k.icon as any} size={20} />
              <div>
                <p className="text-xl font-700 tabular-nums">{k.value}</p>
                <p className="text-xs">{k.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-56"
          />
          <div className="flex rounded-xl border border-border overflow-hidden text-sm">
            {(['all', 'discount', 'bundle', 'bogo'] as const).map((t) => (
              <button key={t} onClick={() => setFilterType(t)}
                className={`px-3 py-2 font-500 transition-colors ${filterType === t ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                {t === 'all' ? 'Tous' : promoTypeLabel(t)}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-border overflow-hidden text-sm">
            {(['all', 'active', 'inactive'] as const).map((s) => (
              <button key={s} onClick={() => setFilterActive(s)}
                className={`px-3 py-2 font-500 transition-colors ${filterActive === s ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                {s === 'all' ? 'Tous statuts' : s === 'active' ? 'Actives' : 'Inactives'}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Icon name="ArrowPathIcon" size={32} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-16 text-center">
            <Icon name="TicketIcon" size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg font-600 text-foreground">Aucune promotion</p>
            <p className="text-sm text-muted-foreground mt-1">
              {promotions.length === 0 ? 'Créez votre première promotion.' : 'Aucune promotion ne correspond aux filtres.'}
            </p>
            {promotions.length === 0 && (
              <button onClick={() => { setEditing(null); setShowForm(true); }}
                className="mt-4 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:opacity-90 transition-opacity">
                Créer une promotion
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => {
              const expired = isExpired(p);
              const scheduled = isScheduled(p);
              return (
                <div key={p.id} className={`bg-white border rounded-2xl p-5 space-y-3 ${!p.is_active || expired ? 'opacity-60 border-border' : 'border-border shadow-sm'}`}>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-700 text-foreground">{p.name}</h3>
                        <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full border ${promoTypeBadge(p.type)}`}>
                          {promoTypeLabel(p.type)}
                        </span>
                      </div>
                      {p.description && <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleToggleActive(p)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${p.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${p.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1">
                    {p.type === 'discount' && p.discount_value != null && (
                      <p className="text-sm font-600 text-amber-700">
                        {p.discount_type === 'percent' ? `−${p.discount_value}%` : `−${fmt(p.discount_value)} €`}
                      </p>
                    )}
                    {p.type === 'bundle' && (
                      <div>
                        <p className="text-xs text-muted-foreground">{(p.products ?? []).length} produit{(p.products ?? []).length > 1 ? 's' : ''}</p>
                        {p.bundle_price != null && (
                          <p className="text-sm font-600 text-blue-700">Prix bundle : {fmt(p.bundle_price)} €</p>
                        )}
                      </div>
                    )}
                    {(p.products ?? []).length > 0 && p.type !== 'discount' && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.products.slice(0, 3).map((bp) => (
                          <span key={bp.product_id} className="text-[10px] bg-muted px-2 py-0.5 rounded-lg text-muted-foreground font-500">
                            {bp.qty}× {bp.name}
                          </span>
                        ))}
                        {p.products.length > 3 && <span className="text-[10px] text-muted-foreground">+{p.products.length - 3}</span>}
                      </div>
                    )}
                    {(p.starts_at || p.ends_at) && (
                      <p className="text-[10px] text-muted-foreground">
                        {p.starts_at && `Dès ${new Date(p.starts_at).toLocaleDateString('fr-FR')}`}
                        {p.starts_at && p.ends_at && ' → '}
                        {p.ends_at && `Jusqu'au ${new Date(p.ends_at).toLocaleDateString('fr-FR')}`}
                      </p>
                    )}
                    {expired && <span className="text-[10px] font-700 text-red-600">⚠️ Expirée</span>}
                    {scheduled && <span className="text-[10px] font-700 text-blue-600">⏰ Programmée</span>}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-1 border-t border-border">
                    <button
                      onClick={() => { setEditing(p); setShowForm(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-500 border border-border rounded-lg hover:bg-muted transition-colors"
                    >
                      <Icon name="PencilSquareIcon" size={12} /> Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-500 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === p.id ? <Icon name="ArrowPathIcon" size={12} className="animate-spin" /> : <Icon name="TrashIcon" size={12} />}
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Note about POS integration */}
        {promotions.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <Icon name="InformationCircleIcon" size={16} className="text-blue-600 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-700">
              <span className="font-600">Intégration POS :</span> Les bundles actifs apparaissent dans la grille produits de la caisse.
              Cliquer sur un bundle ajoute automatiquement tous les produits au panier avec le prix bundle appliqué.
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <PromoFormModal
          promo={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={loadPromotions}
        />
      )}
    </AppLayout>
  );
}
