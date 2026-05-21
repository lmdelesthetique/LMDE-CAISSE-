'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

interface KitComponent {
  componentId: string;
  name: string;
  ref: string;
  imageUrl?: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  stock: number;
  discount: number;
  discountType: 'percent' | 'amount';
}

interface SimpleProduct {
  id: string;
  name: string;
  ref: string;
  image_url?: string;
  buy_price: number;
  sell_price_ttc: number;
  stock: number;
  category: string;
}

interface KitFormModalProps {
  kitProductId?: string; // if editing existing kit
  onClose: () => void;
  onSaved: () => void;
}

export default function KitFormModal({ kitProductId, onClose, onSaved }: KitFormModalProps) {
  const [step, setStep] = useState<'info' | 'components'>(kitProductId ? 'components' : 'info');
  const [saving, setSaving] = useState(false);
  const [allProducts, setAllProducts] = useState<SimpleProduct[]>([]);
  const [components, setComponents] = useState<KitComponent[]>([]);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  // Kit info fields
  const [kitName, setKitName] = useState('');
  const [kitRef, setKitRef] = useState('');
  const [kitCategory, setKitCategory] = useState('');
  const [kitPriceOverride, setKitPriceOverride] = useState('');
  const [kitStatus, setKitStatus] = useState('active');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    // Load all non-kit products (bypass Supabase 1000-row default with range pagination)
    fetchAll<SimpleProduct>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, image_url, buy_price, sell_price_ttc, stock, category')
        .eq('is_kit', false)
        .order('name')
        .range(from, to)
    ).then((data) => setAllProducts(data));

    // If editing, load existing kit data
    if (kitProductId) {
      supabase
        .from('products')
        .select('name, ref, category, kit_price_override, status, product_status')
        .eq('id', kitProductId)
        .single()
        .then(({ data }) => {
          if (data) {
            setKitName(data.name || '');
            setKitRef(data.ref || '');
            setKitCategory(data.category || '');
            setKitPriceOverride(data.kit_price_override?.toString() || '');
            setKitStatus(data.status || data.product_status || 'active');
          }
        });

      supabase
        .from('product_kits')
        .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, ref, image_url, buy_price, sell_price_ttc, stock)')
        .eq('product_id', kitProductId)
        .then(({ data }) => {
          if (data) {
            const mapped: KitComponent[] = data.map((row: any) => ({
              componentId: row.component_id,
              name: row.products?.name || '',
              ref: row.products?.ref || '',
              imageUrl: row.products?.image_url,
              quantity: Number(row.quantity) || 1,
              unitCost: Number(row.products?.buy_price) || 0,
              unitPrice: Number(row.products?.sell_price_ttc) || 0,
              stock: Number(row.products?.stock) || 0,
              discount: 0,
              discountType: 'percent',
            }));
            setComponents(mapped);
          }
        });
    }
  }, [kitProductId]);

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase();
    return allProducts.filter(
      (p) =>
        !components.find((c) => c.componentId === p.id) &&
        (p.name.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q))
    );
  }, [allProducts, components, search]);

  const addComponent = (p: SimpleProduct) => {
    setComponents((prev) => [
      ...prev,
      {
        componentId: p.id,
        name: p.name,
        ref: p.ref,
        imageUrl: p.image_url,
        quantity: 1,
        unitCost: Number(p.buy_price) || 0,
        unitPrice: Number(p.sell_price_ttc) || 0,
        stock: Number(p.stock) || 0,
        discount: 0,
        discountType: 'percent',
      },
    ]);
    setSearch('');
  };

  const removeComponent = (id: string) => {
    setComponents((prev) => prev.filter((c) => c.componentId !== id));
  };

  const updateQty = (id: string, qty: number) => {
    setComponents((prev) =>
      prev.map((c) => (c.componentId === id ? { ...c, quantity: Math.max(0.001, qty) } : c))
    );
  };

  const updateDiscount = (id: string, discount: number, discountType: 'percent' | 'amount') => {
    setComponents((prev) =>
      prev.map((c) => (c.componentId === id ? { ...c, discount, discountType } : c))
    );
  };

  const totalCost = components.reduce((s, c) => s + c.unitCost * c.quantity, 0);
  const totalRetail = components.reduce((s, c) => {
    const base = c.unitPrice * c.quantity;
    const disc = c.discountType === 'percent' ? base * (c.discount / 100) : c.discount;
    return s + Math.max(0, base - disc);
  }, 0);
  const kitPrice = kitPriceOverride ? Number(kitPriceOverride) : totalRetail;
  const kitMargin = kitPrice > 0 ? ((kitPrice - totalCost) / kitPrice) * 100 : 0;
  const minAvailableStock = components.length > 0
    ? Math.min(...components.map((c) => Math.floor(c.stock / c.quantity)))
    : 0;

  const handleSave = async () => {
    if (!kitName.trim()) { showToast('Le nom du kit est requis'); return; }
    if (components.length === 0) { showToast('Ajoutez au moins un composant'); return; }
    setSaving(true);
    try {
      let productId = kitProductId;

      const productPayload: any = {
        name: kitName.trim(),
        ref: kitRef.trim() || null,
        category: kitCategory.trim() || 'Kits',
        is_kit: true,
        kit_price_override: kitPriceOverride ? Number(kitPriceOverride) : null,
        sell_price_ttc: kitPrice,
        sell_price_ht: kitPrice / 1.085,
        buy_price: totalCost,
        status: kitStatus,
        product_status: kitStatus,
        updated_at: new Date().toISOString(),
        stock: minAvailableStock,
      };

      if (productId) {
        await supabase.from('products').update(productPayload).eq('id', productId);
        // Delete old components
        await supabase.from('product_kits').delete().eq('product_id', productId);
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert({ ...productPayload, created_at: new Date().toISOString() })
          .select('id')
          .single();
        if (error) throw error;
        productId = data.id;
      }

      // Insert new components
      const kitRows = components.map((c) => ({
        product_id: productId,
        component_id: c.componentId,
        quantity: c.quantity,
      }));
      const { error: kitError } = await supabase.from('product_kits').insert(kitRows);
      if (kitError) throw kitError;

      onSaved();
    } catch (err: any) {
      showToast(`Erreur : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-3 rounded-xl shadow-lg text-sm font-500 text-white bg-emerald-500 animate-slide-up">
          {toast}
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-3xl max-h-[90vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center">
              <Icon name="GiftIcon" size={18} className="text-violet-600" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">
                {kitProductId ? 'Modifier le kit' : 'Créer un produit kit'}
              </h2>
              <p className="text-xs text-muted-foreground">Regroupez plusieurs produits en un seul article</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Step tabs */}
        <div className="flex border-b border-border shrink-0">
          {(['info', 'components'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={`flex-1 py-3 text-sm font-500 border-b-2 transition-colors ${
                step === s ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {s === 'info' ? '1. Informations kit' : '2. Composants'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Nom du kit *</label>
                  <input
                    value={kitName}
                    onChange={(e) => setKitName(e.target.value)}
                    placeholder="Ex: Kit Débutant Gel X"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Référence</label>
                  <input
                    value={kitRef}
                    onChange={(e) => setKitRef(e.target.value)}
                    placeholder="KIT-001"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Catégorie</label>
                  <input
                    value={kitCategory}
                    onChange={(e) => setKitCategory(e.target.value)}
                    placeholder="Kits"
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Prix de vente TTC (optionnel)</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={kitPriceOverride}
                      onChange={(e) => setKitPriceOverride(e.target.value)}
                      placeholder="Calculé automatiquement"
                      className="w-full px-3 py-2 pr-8 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Laissez vide pour utiliser la somme des composants</p>
                </div>
                <div>
                  <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Statut</label>
                  <select
                    value={kitStatus}
                    onChange={(e) => setKitStatus(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep('components')}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity"
                >
                  Suivant — Ajouter les composants
                  <Icon name="ArrowRightIcon" size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 'components' && (
            <div className="space-y-4">
              {/* Search to add */}
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">Ajouter un produit au kit</label>
                <div className="relative">
                  <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un produit…"
                    className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                {search && filteredProducts.length > 0 && (
                  <div className="mt-1 border border-border rounded-xl bg-white shadow-modal max-h-48 overflow-y-auto">
                    {filteredProducts.slice(0, 10).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addComponent(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border last:border-0"
                      >
                        <div className="w-8 h-8 rounded-lg bg-muted/60 overflow-hidden shrink-0">
                          {p.image_url ? (
                            <AppImage src={p.image_url} alt={p.name} width={32} height={32} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">{p.ref} · Stock: {p.stock}</p>
                        </div>
                        <span className="text-sm font-600 text-primary tabular-nums shrink-0">{Number(p.sell_price_ttc).toFixed(2)} €</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Components list */}
              {components.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-border rounded-xl">
                  <Icon name="CubeIcon" size={32} className="text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun composant ajouté</p>
                  <p className="text-xs text-muted-foreground mt-1">Recherchez des produits ci-dessus pour les ajouter au kit</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {components.map((c) => (
                    <div key={c.componentId} className="border border-border rounded-xl bg-muted/20 overflow-hidden">
                      <div className="flex items-center gap-3 p-3">
                        <div className="w-9 h-9 rounded-lg bg-muted/60 overflow-hidden shrink-0">
                          {c.imageUrl ? (
                            <AppImage src={c.imageUrl} alt={c.name} width={36} height={36} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-500 text-foreground truncate">{c.name}</p>
                          <p className="text-[11px] text-muted-foreground">{c.ref} · Coût: {c.unitCost.toFixed(2)} € · Stock dispo: {c.stock}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => updateQty(c.componentId, c.quantity - 1)}
                            className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Icon name="MinusIcon" size={11} />
                          </button>
                          <input
                            type="number"
                            min={0.001}
                            step={1}
                            value={c.quantity}
                            onChange={(e) => updateQty(c.componentId, Number(e.target.value))}
                            className="w-12 text-center text-sm font-600 border border-border rounded-md py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30"
                          />
                          <button
                            onClick={() => updateQty(c.componentId, c.quantity + 1)}
                            className="w-6 h-6 rounded-md border border-border flex items-center justify-center hover:bg-muted transition-colors"
                          >
                            <Icon name="PlusIcon" size={11} />
                          </button>
                        </div>
                        <span className="text-sm font-600 text-foreground tabular-nums w-20 text-right shrink-0">
                          {(() => {
                            const base = c.unitPrice * c.quantity;
                            const disc = c.discountType === 'percent' ? base * (c.discount / 100) : c.discount;
                            return Math.max(0, base - disc).toFixed(2);
                          })()} €
                        </span>
                        <button
                          onClick={() => removeComponent(c.componentId)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors shrink-0"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </div>
                      {/* Discount row */}
                      <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-border/50 pt-2 bg-white/60">
                        <Icon name="TagIcon" size={12} className="text-muted-foreground shrink-0" />
                        <span className="text-[11px] text-muted-foreground shrink-0">Remise :</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={c.discount}
                          onChange={(e) => updateDiscount(c.componentId, Number(e.target.value), c.discountType)}
                          placeholder="0"
                          className="w-16 text-center text-xs border border-border rounded-md py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                        <div className="flex rounded-md border border-border overflow-hidden">
                          <button
                            onClick={() => updateDiscount(c.componentId, c.discount, 'percent')}
                            className={`px-2 py-0.5 text-xs font-600 transition-colors ${c.discountType === 'percent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                          >%</button>
                          <button
                            onClick={() => updateDiscount(c.componentId, c.discount, 'amount')}
                            className={`px-2 py-0.5 text-xs font-600 transition-colors ${c.discountType === 'amount' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                          >€</button>
                        </div>
                        {c.discount > 0 && (
                          <span className="text-[11px] text-emerald-600 font-500">
                            − {c.discountType === 'percent'
                              ? (c.unitPrice * c.quantity * c.discount / 100).toFixed(2)
                              : c.discount.toFixed(2)} €
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary */}
              {components.length > 0 && (
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-600 text-violet-700 uppercase tracking-wide mb-2">Récapitulatif kit</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Coût total composants</span>
                      <span className="font-600 text-foreground tabular-nums">{totalCost.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Prix de vente TTC</span>
                      <span className="font-700 text-primary tabular-nums">{kitPrice.toFixed(2)} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Marge kit</span>
                      <span className={`font-700 tabular-nums ${kitMargin >= 40 ? 'text-emerald-600' : kitMargin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                        {kitMargin.toFixed(1)} %
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stock kit disponible</span>
                      <span className="font-600 text-foreground tabular-nums">{minAvailableStock} unités</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/20">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-white transition-colors">
            Annuler
          </button>
          <div className="flex items-center gap-2">
            {step === 'components' && !kitProductId && (
              <button
                onClick={() => setStep('info')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
              >
                <Icon name="ArrowLeftIcon" size={14} />
                Retour
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || components.length === 0 || !kitName.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-95"
            >
              {saving ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Enregistrement…</>
              ) : (
                <><Icon name="CheckIcon" size={15} />{kitProductId ? 'Mettre à jour le kit' : 'Créer le kit'}</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
