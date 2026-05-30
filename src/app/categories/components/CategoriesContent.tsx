'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import StatusBadge from '@/components/ui/StatusBadge';
import { Category, CategoryFormData, fetchCategories, createCategory, updateCategory, deleteCategory } from '@/lib/services/categoryService';
import { categoryStore } from '@/lib/stores/dataStore';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

const ICON_OPTIONS = [
  'SparklesIcon','BeakerIcon','PaintBrushIcon','EyeIcon','StarIcon',
  'TagIcon','HomeIcon','CpuChipIcon','ArchiveBoxIcon','AcademicCapIcon',
  'GiftIcon','BriefcaseIcon','ShoppingBagIcon','HeartIcon','FireIcon',
];

const COLOR_OPTIONS = [
  '#EC4899','#8B5CF6','#F59E0B','#06B6D4','#10B981',
  '#F97316','#6B7280','#3B82F6','#84CC16','#A855F7',
  '#EF4444','#0EA5E9','#14B8A6','#F43F5E','#D97706',
];

interface CategoryProduct {
  id: string;
  name: string;
  ref: string;
  image_url?: string;
  stock: number;
  sell_price_ttc: number;
  status: string;
  product_status: string;
  category: string;
}

// ─── Category Form Modal ──────────────────────────────────────────────────────
interface CategoryFormModalProps {
  category: Category | null;
  onClose: () => void;
  onSave: (data: CategoryFormData) => Promise<void>;
}

function CategoryFormModal({ category, onClose, onSave }: CategoryFormModalProps) {
  const [form, setForm] = useState<CategoryFormData>({
    name: category?.name || '',
    description: category?.description || '',
    color: category?.color || '#8B5CF6',
    icon: category?.icon || 'TagIcon',
    image_url: category?.image_url || '',
    is_active: category?.is_active ?? true,
    sort_order: category?.sort_order || 0,
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); onClose(); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/20">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: form.color + '20' }}>
              <Icon name={form.icon as Parameters<typeof Icon>[0]['name']} size={20} style={{ color: form.color }} />
            </div>
            <div>
              <p className="text-sm font-600 text-foreground">{form.name || 'Nom de la catégorie'}</p>
              <p className="text-xs text-muted-foreground">{form.description || 'Description…'}</p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Nom *</label>
            <input required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Ex: Onglerie" />
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2} className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" placeholder="Description courte…" />
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Couleur</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button key={c} type="button" onClick={() => setForm((p) => ({ ...p, color: c }))}
                  className={`w-7 h-7 rounded-lg transition-transform hover:scale-110 ${form.color === c ? 'ring-2 ring-offset-2 ring-foreground scale-110' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Icône</label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((ic) => (
                <button key={ic} type="button" onClick={() => setForm((p) => ({ ...p, icon: ic }))}
                  className={`w-9 h-9 rounded-lg border flex items-center justify-center transition-all hover:bg-muted ${form.icon === ic ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  <Icon name={ic as Parameters<typeof Icon>[0]['name']} size={16} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Ordre d'affichage</label>
              <input type="number" min={0} value={form.sort_order} onChange={(e) => setForm((p) => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button type="button" onClick={() => setForm((p) => ({ ...p, is_active: !p.is_active }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${form.is_active ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-sm text-muted-foreground">Active</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="px-5 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60 active:scale-95">
              {saving ? 'Enregistrement…' : category ? 'Mettre à jour' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Move Product Modal ───────────────────────────────────────────────────────
interface MoveProductModalProps {
  product: CategoryProduct;
  categories: Category[];
  currentCategory: string;
  onClose: () => void;
  onMoved: () => void;
}

function MoveProductModal({ product, categories, currentCategory, onClose, onMoved }: MoveProductModalProps) {
  const [targetCategory, setTargetCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleMove = async () => {
    if (!targetCategory) return;
    setSaving(true);
    await supabase.from('products').update({ category: targetCategory, updated_at: new Date().toISOString() }).eq('id', product.id);
    setSaving(false);
    onMoved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Icon name="ArrowsRightLeftIcon" size={20} className="text-blue-600" />
          </div>
          <div>
            <p className="font-600 text-foreground">Déplacer le produit</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.name}</p>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Nouvelle catégorie</label>
          <select value={targetCategory} onChange={(e) => setTargetCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
            <option value="">Sélectionner…</option>
            {categories.filter((c) => c.name !== currentCategory).map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Annuler</button>
          <button onClick={handleMove} disabled={!targetCategory || saving}
            className="flex-1 px-4 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? 'Déplacement…' : 'Déplacer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Products to Category Modal (Multi-select) ────────────────────────────
interface AddProductModalProps {
  categoryName: string;
  onClose: () => void;
  onAdded: () => void;
}

function AddProductModal({ categoryName, onClose, onAdded }: AddProductModalProps) {
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetchAll<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, image_url, stock, sell_price_ttc, status, product_status, category')
        .neq('category', categoryName)
        .order('name')
        .range(from, to)
    ).then((data) => {
      setProducts(data as any[]);
      setLoading(false);
    });
  }, [categoryName]);

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.ref || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const handleAddSelected = async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    const ids = Array.from(selectedIds);
    // Update all selected products in parallel
    await Promise.all(
      ids.map((id) =>
        supabase.from('products').update({ category: categoryName, updated_at: new Date().toISOString() }).eq('id', id)
      )
    );
    setSaving(false);
    onAdded();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[85vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-600 text-foreground">Ajouter des produits</h2>
            <p className="text-xs text-muted-foreground">Catégorie : <strong>{categoryName}</strong> · Sélection multiple activée</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Search + select all */}
        <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un produit…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          {filtered.length > 0 && (
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="accent-primary w-4 h-4"
                />
                Tout sélectionner ({filtered.length})
              </label>
              {selectedIds.size > 0 && (
                <span className="text-xs font-600 text-primary">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </div>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">Aucun produit disponible</div>
          ) : (
            filtered.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="accent-primary w-4 h-4 shrink-0"
                  />
                  <div className="w-10 h-10 rounded-lg bg-muted/60 overflow-hidden shrink-0">
                    {p.image_url ? (
                      <AppImage src={p.image_url} alt={p.name} width={40} height={40} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">{p.ref} · {p.category || 'Sans catégorie'}</p>
                  </div>
                  <span className="text-sm font-600 text-primary tabular-nums shrink-0">{Number(p.sell_price_ttc).toFixed(2)} €</span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0 flex items-center gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            Annuler
          </button>
          <button
            onClick={handleAddSelected}
            disabled={selectedIds.size === 0 || saving}
            className="flex-1 px-4 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Ajout…</>
            ) : (
              <><Icon name="PlusIcon" size={15} />Ajouter {selectedIds.size > 0 ? `${selectedIds.size} produit${selectedIds.size > 1 ? 's' : ''}` : 'à la catégorie'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Remove Multiple Products Modal ──────────────────────────────────────────
interface RemoveMultipleModalProps {
  selectedProducts: CategoryProduct[];
  categoryName: string;
  onClose: () => void;
  onRemoved: () => void;
}

function RemoveMultipleModal({ selectedProducts, categoryName, onClose, onRemoved }: RemoveMultipleModalProps) {
  const [removing, setRemoving] = useState(false);

  const handleRemove = async () => {
    setRemoving(true);
    await Promise.all(
      selectedProducts.map((p) =>
        supabase.from('products').update({ category: '', updated_at: new Date().toISOString() }).eq('id', p.id)
      )
    );
    setRemoving(false);
    onRemoved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
            <Icon name="TrashIcon" size={20} className="text-red-600" />
          </div>
          <div>
            <p className="font-600 text-foreground">Retirer {selectedProducts.length} produit{selectedProducts.length > 1 ? 's' : ''}</p>
            <p className="text-xs text-muted-foreground">de la catégorie "{categoryName}"</p>
          </div>
        </div>
        <div className="bg-muted/30 rounded-xl p-3 mb-4 max-h-32 overflow-y-auto space-y-1">
          {selectedProducts.map((p) => (
            <p key={p.id} className="text-xs text-foreground truncate">• {p.name}</p>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Annuler</button>
          <button onClick={handleRemove} disabled={removing}
            className="flex-1 px-4 py-2 text-sm font-600 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50">
            {removing ? 'Retrait…' : 'Retirer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category Detail Panel ────────────────────────────────────────────────────
interface CategoryDetailPanelProps {
  category: Category;
  allCategories: Category[];
  onBack: () => void;
  onCategoryUpdated: () => void;
}

function CategoryDetailPanel({ category, allCategories, onBack, onCategoryUpdated }: CategoryDetailPanelProps) {
  const [products, setProducts] = useState<CategoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [moveProduct, setMoveProduct] = useState<CategoryProduct | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showRemoveMultiple, setShowRemoveMultiple] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const data = await fetchAll<any>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, image_url, stock, sell_price_ttc, status, product_status, category')
        .eq('category', category.name)
        .order('name')
        .range(from, to)
    );
    setProducts(data as any[]);
    setSelectedIds(new Set());
    setLoading(false);
  }, [category.name]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const handleRemove = async (product: CategoryProduct) => {
    setRemovingId(product.id);
    await supabase.from('products').update({ category: '', updated_at: new Date().toISOString() }).eq('id', product.id);
    setRemovingId(null);
    showToast(`"${product.name}" retiré de la catégorie`);
    loadProducts();
  };

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(search.toLowerCase()) || (p.ref || '').toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((p) => p.id)));
    }
  };

  const selectedProductsList = products.filter((p) => selectedIds.has(p.id));

  const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
  const avgPrice = products.length > 0 ? products.reduce((s, p) => s + Number(p.sell_price_ttc), 0) / products.length : 0;

  return (
    <div className="flex flex-col flex-1">
      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-500 text-white bg-emerald-500 animate-slide-up">{toast}</div>
      )}

      {/* Sub-header */}
      <div className="border-b border-border bg-white px-6 lg:px-8 xl:px-10 py-4 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <Icon name="ArrowLeftIcon" size={18} />
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: category.color + '20' }}>
              <Icon name={category.icon as Parameters<typeof Icon>[0]['name']} size={18} style={{ color: category.color }} />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-foreground">{category.name}</h1>
              <p className="text-sm text-muted-foreground">{products.length} produit{products.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => setShowRemoveMultiple(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-600 hover:bg-red-700 transition-colors"
              >
                <Icon name="TrashIcon" size={15} />
                Retirer {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity active:scale-95"
            >
              <Icon name="PlusIcon" size={15} />
              Ajouter des produits
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-16 py-5 w-full flex flex-col gap-4 flex-1">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Produits', value: products.length.toString(), icon: 'ArchiveBoxIcon' },
            { label: 'Stock total', value: totalStock.toLocaleString('fr-FR'), icon: 'CubeIcon' },
            { label: 'Prix moyen', value: `${avgPrice.toFixed(2)} €`, icon: 'CurrencyEuroIcon' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3 shadow-card">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: category.color + '18' }}>
                <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} style={{ color: category.color }} />
              </div>
              <div>
                <p className="text-lg font-700 text-foreground tabular-nums">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + multi-select toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative max-w-sm flex-1">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher dans la catégorie…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>
          {filtered.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={selectedIds.size === filtered.length && filtered.length > 0}
                onChange={toggleSelectAll}
                className="accent-primary w-4 h-4"
              />
              Tout sélectionner
            </label>
          )}
          {selectedIds.size > 0 && (
            <span className="text-xs font-600 text-primary bg-primary/10 px-2.5 py-1 rounded-full">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Products table */}
        <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Icon name="ArchiveBoxIcon" size={36} className="text-muted-foreground/40 mb-3" />
              <p className="text-sm font-500 text-foreground mb-1">Aucun produit dans cette catégorie</p>
              <p className="text-xs text-muted-foreground mb-4">Ajoutez des produits existants ou créez-en de nouveaux.</p>
              <button onClick={() => setShowAddModal(true)} className="px-4 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90">
                Ajouter des produits
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === filtered.length && filtered.length > 0}
                        onChange={toggleSelectAll}
                        className="accent-primary w-4 h-4"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wide">Produit</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wide">Référence</th>
                    <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wide">Stock</th>
                    <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wide">Prix TTC</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3 text-right text-xs font-600 text-muted-foreground uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product, idx) => {
                    const isSelected = selectedIds.has(product.id);
                    return (
                      <tr key={product.id} className={`border-b border-border last:border-0 transition-colors group ${isSelected ? 'bg-primary/5' : idx % 2 === 1 ? 'bg-muted/10 hover:bg-muted/20' : 'hover:bg-muted/20'}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(product.id)}
                            className="accent-primary w-4 h-4"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-10 h-10 rounded-lg bg-muted/60 overflow-hidden shrink-0 border border-border/50">
                              {product.image_url ? (
                                <AppImage src={product.image_url} alt={product.name} width={40} height={40} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="font-500 text-foreground">{product.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{product.ref || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-700 tabular-nums text-sm ${product.stock === 0 ? 'text-red-600' : product.stock <= 5 ? 'text-amber-600' : 'text-foreground'}`}>
                            {product.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-700 text-foreground tabular-nums">{Number(product.sell_price_ttc).toFixed(2)} €</td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge variant={(product.status || product.product_status || 'active') as any} size="sm" />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setMoveProduct(product)}
                              title="Déplacer vers une autre catégorie"
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-muted-foreground hover:text-blue-600 transition-colors"
                            >
                              <Icon name="ArrowsRightLeftIcon" size={14} />
                            </button>
                            <button
                              onClick={() => handleRemove(product)}
                              disabled={removingId === product.id}
                              title="Retirer de la catégorie"
                              className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50"
                            >
                              <Icon name="XMarkIcon" size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddProductModal
          categoryName={category.name}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { loadProducts(); onCategoryUpdated(); }}
        />
      )}

      {moveProduct && (
        <MoveProductModal
          product={moveProduct}
          categories={allCategories}
          currentCategory={category.name}
          onClose={() => setMoveProduct(null)}
          onMoved={() => { loadProducts(); onCategoryUpdated(); }}
        />
      )}

      {showRemoveMultiple && selectedProductsList.length > 0 && (
        <RemoveMultipleModal
          selectedProducts={selectedProductsList}
          categoryName={category.name}
          onClose={() => setShowRemoveMultiple(false)}
          onRemoved={() => { loadProducts(); onCategoryUpdated(); showToast(`${selectedProductsList.length} produit(s) retiré(s) de la catégorie`); }}
        />
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function CategoriesContent() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editCategory, setEditCategory] = useState<Category | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  const [categoryStats, setCategoryStats] = useState<Record<string, { productCount: number; totalStock: number; avgPrice: number }>>({});

  useEffect(() => { loadCategories(); }, []);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCategories();
      setCategories(data);
      const products = await fetchAll((from, to) =>
        supabase.from('products').select('category, stock, sell_price_ttc').neq('product_status', 'archived').range(from, to)
      );
      if (products.length >= 0) {
        const stats: Record<string, { productCount: number; totalStock: number; totalPrice: number }> = {};
        products.forEach((p: any) => {
          const cat = p.category || '';
          if (!stats[cat]) stats[cat] = { productCount: 0, totalStock: 0, totalPrice: 0 };
          stats[cat].productCount++;
          stats[cat].totalStock += Number(p.stock) || 0;
          stats[cat].totalPrice += Number(p.sell_price_ttc) || 0;
        });
        const mapped: Record<string, { productCount: number; totalStock: number; avgPrice: number }> = {};
        Object.entries(stats).forEach(([cat, s]) => {
          mapped[cat] = { productCount: s.productCount, totalStock: s.totalStock, avgPrice: s.productCount > 0 ? s.totalPrice / s.productCount : 0 };
        });
        setCategoryStats(mapped);
      }
    } catch {
      setError('Impossible de charger les catégories.');
    } finally {
      setLoading(false);
    }
  };

  const filtered = categories.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.description?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSave = async (form: CategoryFormData) => {
    if (editCategory) {
      const oldName = editCategory.name;
      const updated = await updateCategory(editCategory.id, form);
      setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      // If name changed, propagate to all products via store (DB trigger also handles this)
      if (oldName !== form.name) {
        await categoryStore.rename(editCategory.id, form.name);
        // Also update products locally in case trigger hasn't fired yet
        await supabase.from('products').update({ category: form.name }).eq('category', oldName);
      }
      categoryStore.invalidate();
    } else {
      const created = await createCategory(form);
      setCategories((prev) => [...prev, created]);
      categoryStore.invalidate();
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCategory(id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setDeleteConfirm(null);
  };

  const handleTogglePortal = async (cat: Category, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !cat.visible_in_client_portal;
    await supabase.from('categories').update({ visible_in_client_portal: next }).eq('id', cat.id);
    setCategories((prev) => prev.map((c) => c.id === cat.id ? { ...c, visible_in_client_portal: next } : c));
  };

  const openCreate = () => { setEditCategory(null); setShowModal(true); };
  const openEdit = (c: Category) => { setEditCategory(c); setShowModal(true); };

  const totalProducts = Object.values(categoryStats).reduce((s, v) => s + v.productCount, 0);
  const totalStock = Object.values(categoryStats).reduce((s, v) => s + v.totalStock, 0);

  if (selectedCategory) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <CategoryDetailPanel
          category={selectedCategory}
          allCategories={categories}
          onBack={() => setSelectedCategory(null)}
          onCategoryUpdated={loadCategories}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="border-b border-border bg-white px-6 lg:px-8 xl:px-10 py-4 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Catégories</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{categories.length} familles de produits</p>
          </div>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity active:scale-95">
            <Icon name="PlusIcon" size={15} />
            Nouvelle catégorie
          </button>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-16 py-5 w-full flex flex-col gap-5 flex-1">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Catégories actives', value: categories.filter((c) => c.is_active).length.toString(), icon: 'TagIcon', color: '#8B5CF6' },
            { label: 'Produits au catalogue', value: totalProducts.toString(), icon: 'ArchiveBoxIcon', color: '#3B82F6' },
            { label: 'Stock total (unités)', value: totalStock.toLocaleString('fr-FR'), icon: 'CubeIcon', color: '#10B981' },
            { label: 'Catégories totales', value: categories.length.toString(), icon: 'ChartBarIcon', color: '#F59E0B' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3 shadow-card">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: kpi.color + '18' }}>
                <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={20} style={{ color: kpi.color }} />
              </div>
              <div>
                <p className="text-xl font-700 text-foreground tabular-nums">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une catégorie…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
          </div>
          <span className="text-sm text-muted-foreground">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
          <div className="ml-auto flex items-center gap-1 border border-border rounded-lg p-0.5 bg-white">
            <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name="Squares2X2Icon" size={16} />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name="ListBulletIcon" size={16} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              <p className="text-sm">Chargement des catégories…</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <Icon name="ExclamationTriangleIcon" size={40} className="text-red-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <button onClick={loadCategories} className="mt-3 px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90">Réessayer</button>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <Icon name="TagIcon" size={40} className="text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">Aucune catégorie trouvée</p>
              <p className="text-xs text-muted-foreground">Créez votre première catégorie pour organiser vos produits.</p>
              <button onClick={openCreate} className="mt-4 px-4 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90">Créer une catégorie</button>
            </div>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((cat) => {
              const stats = categoryStats[cat.name] || { productCount: 0, totalStock: 0, avgPrice: 0 };
              return (
                <div key={cat.id} className="bg-white border border-border rounded-2xl shadow-card overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer"
                  onClick={() => setSelectedCategory(cat)}>
                  <div className="h-2 w-full" style={{ backgroundColor: cat.color }} />
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                          <Icon name={cat.icon as Parameters<typeof Icon>[0]['name']} size={18} style={{ color: cat.color }} />
                        </div>
                        <div>
                          <p className="text-sm font-600 text-foreground leading-tight">{cat.name}</p>
                          {!cat.is_active && (
                            <span className="text-[10px] font-600 text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">Inactive</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleTogglePortal(cat, e)}
                          title={cat.visible_in_client_portal ? 'Visible portail client' : 'Masqué du portail client'}
                          className={`p-1.5 rounded-lg transition-colors ${cat.visible_in_client_portal ? 'bg-rose-50 text-rose-500' : 'hover:bg-muted text-muted-foreground hover:text-foreground'}`}
                        >
                          <Icon name="HeartIcon" size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(cat); }}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                          <Icon name="PencilIcon" size={13} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(cat.id); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                          <Icon name="TrashIcon" size={13} />
                        </button>
                      </div>
                    </div>
                    {cat.description && (
                      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{cat.description}</p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-base font-700 text-foreground tabular-nums">{stats.productCount}</p>
                        <p className="text-[10px] text-muted-foreground">Produits</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-base font-700 text-foreground tabular-nums">{stats.totalStock}</p>
                        <p className="text-[10px] text-muted-foreground">En stock</p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                      <Icon name="EyeIcon" size={12} />
                      <span>Cliquer pour gérer les produits</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wide">Catégorie</th>
                    <th className="px-4 py-3 text-left text-xs font-600 text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground uppercase tracking-wide">Produits</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground uppercase tracking-wide">Stock</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3 text-center text-xs font-600 text-muted-foreground uppercase tracking-wide">Portail</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((cat, idx) => {
                    const stats = categoryStats[cat.name] || { productCount: 0, totalStock: 0, avgPrice: 0 };
                    return (
                      <tr key={cat.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                        onClick={() => setSelectedCategory(cat)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: cat.color + '20' }}>
                              <Icon name={cat.icon as Parameters<typeof Icon>[0]['name']} size={15} style={{ color: cat.color }} />
                            </div>
                            <span className="font-600 text-foreground">{cat.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground max-w-[220px] truncate">{cat.description || '—'}</td>
                        <td className="px-4 py-3 text-center font-600 text-foreground tabular-nums">{stats.productCount}</td>
                        <td className="px-4 py-3 text-center font-600 text-foreground tabular-nums">{stats.totalStock}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-600 ${cat.is_active ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
                            {cat.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={(e) => handleTogglePortal(cat, e)}
                            title={cat.visible_in_client_portal ? 'Visible portail — cliquer pour masquer' : 'Masqué du portail — cliquer pour activer'}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-600 transition-colors ${cat.visible_in_client_portal ? 'bg-rose-50 text-rose-600 hover:bg-rose-100' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'}`}
                          >
                            <Icon name="HeartIcon" size={11} />
                            {cat.visible_in_client_portal ? 'Visible' : 'Masqué'}
                          </button>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => openEdit(cat)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Icon name="PencilIcon" size={13} />
                            </button>
                            <button onClick={() => setDeleteConfirm(cat.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                              <Icon name="TrashIcon" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <CategoryFormModal category={editCategory} onClose={() => setShowModal(false)} onSave={handleSave} />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Icon name="TrashIcon" size={20} className="text-red-600" />
              </div>
              <div>
                <p className="font-600 text-foreground">Supprimer la catégorie ?</p>
                <p className="text-xs text-muted-foreground">Les produits ne seront pas supprimés.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">Annuler</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="flex-1 px-4 py-2 text-sm font-600 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
