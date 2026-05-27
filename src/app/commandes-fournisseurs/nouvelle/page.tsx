'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { supplierOrderService } from '@/lib/services/supplierOrderService';
import { supplierService, Supplier } from '@/lib/services/supplierService';
import { fetchProductsBySupplier, fetchStockProducts, StockProduct } from '@/lib/services/stockService';

interface ColorVariant {
  color_name: string;
  color_hex: string;
  quantity: number;
}

interface DraftLine {
  key: string;
  productId?: string;
  productName: string;
  productRef: string;
  productImageUrl?: string;
  variant: string;
  color: string;
  size: string;
  model: string;
  qtyOrdered: number;
  unitPrice: number;
  salePrice: number;
  currentStock: number;
  minStock: number;
  note: string;
  stockStatus: string;
  sales30d: number;
  suggestedReorder: number;
  avgRestockDays: number;
  hasColorVariants: boolean;
  colorVariants: ColorVariant[];
}

function stockStatus(current: number, min: number) {
  if (current === 0) return { label: 'Rupture', color: 'bg-red-100 text-red-700' };
  if (current < min) return { label: 'Faible', color: 'bg-amber-100 text-amber-700' };
  return { label: 'En stock', color: 'bg-emerald-100 text-emerald-700' };
}

function productToLine(p: StockProduct): DraftLine {
  return {
    key: `${p.id}-${Date.now()}`,
    productId: p.id,
    productName: p.name,
    productRef: p.ref,
    productImageUrl: p.imageUrl || undefined,
    variant: '', color: '', size: '', model: '',
    qtyOrdered: Math.max(1, p.suggestedReorder || (p.minStock - p.stock)),
    unitPrice: p.purchasePriceSupplier || p.buyPrice,
    salePrice: p.sellPriceTtc,
    currentStock: p.stock,
    minStock: p.minStock,
    note: '',
    stockStatus: p.stockStatus,
    sales30d: p.sales30d,
    suggestedReorder: p.suggestedReorder,
    avgRestockDays: p.avgRestockDays,
    hasColorVariants: false,
    colorVariants: [],
  };
}

async function loadVariantsForProduct(productId: string): Promise<{ hasColorVariants: boolean; colorVariants: ColorVariant[] }> {
  const supabase = createClient();
  const { data: prod } = await supabase
    .from('products')
    .select('has_color_variants')
    .eq('id', productId)
    .single();
  if (!prod?.has_color_variants) return { hasColorVariants: false, colorVariants: [] };
  const { data: variants } = await supabase
    .from('product_color_stock')
    .select('color_name, color_hex, quantity')
    .eq('product_id', productId)
    .order('color_name');
  return { hasColorVariants: true, colorVariants: (variants ?? []) as ColorVariant[] };
}

function NouvelleCommandeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState(searchParams.get('supplierId') || '');
  const [currency, setCurrency] = useState('EUR');
  const [notes, setNotes] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<StockProduct[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [saving, setSaving] = useState(false);

  // Supplier products panel
  const [supplierProducts, setSupplierProducts] = useState<StockProduct[]>([]);
  const [supplierProductsLoading, setSupplierProductsLoading] = useState(false);
  const [allProducts, setAllProducts] = useState<StockProduct[]>([]);
  const [showSupplierPanel, setShowSupplierPanel] = useState(false);

  useEffect(() => {
    supplierService.getAll().then(setSuppliers).catch(() => {});
    fetchStockProducts().then(setAllProducts).catch(() => {});
  }, []);

  // Load supplier products when supplier changes
  useEffect(() => {
    if (!selectedSupplier) {
      setSupplierProducts([]);
      setShowSupplierPanel(false);
      return;
    }
    setSupplierProductsLoading(true);
    setShowSupplierPanel(true);
    fetchProductsBySupplier(selectedSupplier)
      .then(prods => {
        setSupplierProducts(prods);
        setSupplierProductsLoading(false);
      })
      .catch(() => setSupplierProductsLoading(false));
  }, [selectedSupplier]);

  // Pre-fill from URL params (coming from stock page)
  useEffect(() => {
    const productId = searchParams.get('productId');
    const qty = searchParams.get('qty');
    if (productId && allProducts.length > 0) {
      const found = allProducts.find(p => p.id === productId);
      if (found) {
        const line = productToLine(found);
        if (qty) line.qtyOrdered = parseInt(qty) || line.qtyOrdered;
        setLines([line]);
      }
    }
  }, [searchParams, allProducts]);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    if (!q.trim()) { setSearchResults([]); setShowSearch(false); return; }
    // Search only within supplier's products if a supplier is selected, otherwise all products
    const pool = selectedSupplier && supplierProducts.length > 0 ? supplierProducts : allProducts;
    const results = pool.filter(
      (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.ref.toLowerCase().includes(q.toLowerCase())
    );
    setSearchResults(results.slice(0, 10));
    setShowSearch(true);
  }, [allProducts, selectedSupplier, supplierProducts]);

  const addProduct = async (p: StockProduct) => {
    if (lines.some(l => l.productId === p.id)) return;
    const line = productToLine(p);
    setLines((prev) => [...prev, line]);
    setSearch('');
    setSearchResults([]);
    setShowSearch(false);
    if (p.id) {
      const variantData = await loadVariantsForProduct(p.id);
      setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, ...variantData } : l));
    }
  };

  const toggleSupplierProduct = async (p: StockProduct) => {
    if (lines.some(l => l.productId === p.id)) {
      setLines(prev => prev.filter(l => l.productId !== p.id));
    } else {
      const line = productToLine(p);
      setLines(prev => [...prev, line]);
      if (p.id) {
        const variantData = await loadVariantsForProduct(p.id);
        setLines((prev) => prev.map((l) => l.key === line.key ? { ...l, ...variantData } : l));
      }
    }
  };

  const addAllRestock = async () => {
    const toAdd = supplierProducts.filter(
      p => (p.stockStatus === 'rupture' || p.stockStatus === 'faible') && !lines.some(l => l.productId === p.id)
    );
    const newLines = toAdd.map(productToLine);
    setLines(prev => [...prev, ...newLines]);
    for (const line of newLines) {
      if (line.productId) {
        const variantData = await loadVariantsForProduct(line.productId);
        if (variantData.hasColorVariants) {
          setLines(prev => prev.map(l => l.key === line.key ? { ...l, ...variantData } : l));
        }
      }
    }
  };

  const updateLine = (key: string, field: keyof DraftLine, value: unknown) => {
    setLines((prev) => prev.map((l) => l.key === key ? { ...l, [field]: value } : l));
  };

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const subtotal = lines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);

  const handleSave = async (status: 'draft' | 'sent') => {
    if (!selectedSupplier) { alert('Veuillez sélectionner un fournisseur'); return; }
    if (lines.length === 0) { alert('Ajoutez au moins un produit'); return; }
    setSaving(true);
    try {
      const order = await supplierOrderService.create({
        supplierId: selectedSupplier,
        orderStatus: status,
        currency,
        notes,
        expectedDeliveryAt: expectedDelivery || undefined,
        subtotal,
        totalRealCost: subtotal,
      });
      if (order) {
        for (const l of lines) {
          await supplierOrderService.addLine({
            orderId: order.id,
            productId: l.productId,
            productName: l.productName,
            productRef: l.productRef,
            productImageUrl: l.productImageUrl,
            variant: l.variant || undefined,
            color: l.color || undefined,
            size: l.size || undefined,
            model: l.model || undefined,
            qtyOrdered: l.qtyOrdered,
            unitPrice: l.unitPrice,
            lineTotal: l.qtyOrdered * l.unitPrice,
            salePrice: l.salePrice,
            note: l.note || undefined,
          });
        }
        router.push('/commandes-fournisseurs');
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedSupplierObj = suppliers.find(s => s.id === selectedSupplier);
  const ruptureCount = supplierProducts.filter(p => p.stockStatus === 'rupture').length;
  const faibleCount = supplierProducts.filter(p => p.stockStatus === 'faible').length;

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="ArrowLeftIcon" size={18} />
          </button>
          <div>
            <h1 className="text-2xl font-700 text-foreground">Nouvelle commande fournisseur</h1>
            <p className="text-sm text-muted-foreground">Créez un bon de commande pour votre fournisseur</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: form */}
          <div className="lg:col-span-2 space-y-5">
            {/* Supplier & settings */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <h2 className="font-600 text-foreground mb-4 flex items-center gap-2">
                <Icon name="TruckIcon" size={16} className="text-primary" />
                Informations commande
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1.5">Fournisseur *</label>
                  <select
                    value={selectedSupplier}
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Sélectionner un fournisseur</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1.5">Devise</label>
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {['EUR', 'USD', 'GBP', 'CNY', 'MAD'].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1.5">Livraison prévue</label>
                  <input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-500 text-muted-foreground mb-1.5">Notes</label>
                  <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes internes..." className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
            </div>

            {/* Supplier products panel — auto-loaded when supplier selected */}
            {showSupplierPanel && selectedSupplier && (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h2 className="font-600 text-foreground flex items-center gap-2">
                      <Icon name="TagIcon" size={16} className="text-primary" />
                      Produits de {selectedSupplierObj?.companyName || 'ce fournisseur'}
                    </h2>
                    {!supplierProductsLoading && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {supplierProducts.length} produit(s) · {ruptureCount > 0 && <span className="text-red-600 font-500">{ruptureCount} rupture(s)</span>}{ruptureCount > 0 && faibleCount > 0 && ' · '}{faibleCount > 0 && <span className="text-amber-600 font-500">{faibleCount} faible(s)</span>}
                      </p>
                    )}
                  </div>
                  {(ruptureCount > 0 || faibleCount > 0) && (
                    <button
                      onClick={addAllRestock}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-600 hover:bg-red-700 transition-colors"
                    >
                      <Icon name="PlusCircleIcon" size={14} />
                      Ajouter tous les produits à réapprovisionner
                    </button>
                  )}
                </div>

                {supplierProductsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : supplierProducts.length === 0 ? (
                  <div className="p-6 text-center">
                    <Icon name="TagIcon" size={28} className="text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Aucun produit rattaché à ce fournisseur</p>
                    <p className="text-xs text-muted-foreground mt-1">Rattachez des produits à ce fournisseur dans la gestion des produits</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-80 overflow-y-auto">
                    {supplierProducts.map(p => {
                      const st = stockStatus(p.stock, p.minStock);
                      const isAdded = lines.some(l => l.productId === p.id);
                      return (
                        <div key={p.id} className={`flex items-center gap-3 px-4 py-3 transition-colors ${isAdded ? 'bg-primary/5' : 'hover:bg-muted/30'}`}>
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {p.imageUrl ? (
                              <Image src={p.imageUrl} alt={p.name} width={40} height={40} className="rounded-lg object-cover" />
                            ) : (
                              <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{p.ref}</span>
                              <span className={`text-[10px] font-500 px-1.5 py-0.5 rounded-full ${st.color}`}>{st.label}</span>
                              {p.sales30d > 0 && <span className="text-[10px] text-muted-foreground">{p.sales30d} ventes/30j</span>}
                            </div>
                          </div>
                          <div className="text-right shrink-0 mr-2">
                            <p className="text-xs font-600 text-foreground">Stock: {p.stock}</p>
                            <p className="text-[10px] text-muted-foreground">Min: {p.minStock}</p>
                            {p.purchasePriceSupplier > 0 && (
                              <p className="text-[10px] text-muted-foreground">{p.purchasePriceSupplier.toFixed(2)} {currency}</p>
                            )}
                          </div>
                          {p.suggestedReorder > 0 && (
                            <div className="text-center shrink-0 mr-2">
                              <p className="text-[10px] text-amber-600 font-500">Suggéré</p>
                              <p className="text-sm font-700 text-amber-700">{p.suggestedReorder}</p>
                            </div>
                          )}
                          <button
                            onClick={() => toggleSupplierProduct(p)}
                            className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${
                              isAdded
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-muted text-foreground hover:bg-muted/80'
                            }`}
                          >
                            <Icon name={isAdded ? 'CheckIcon' : 'PlusIcon'} size={12} />
                            {isAdded ? 'Ajouté' : 'Ajouter'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Product search */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <h2 className="font-600 text-foreground mb-4 flex items-center gap-2">
                <Icon name="MagnifyingGlassIcon" size={16} className="text-primary" />
                Rechercher un produit
              </h2>
              <div className="relative">
                <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Nom, référence ou code-barres..."
                  className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {showSearch && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-30 max-h-80 overflow-y-auto">
                    {searchResults.map((p) => {
                      const st = stockStatus(p.stock, p.minStock);
                      return (
                        <button
                          key={p.id}
                          onClick={() => addProduct(p)}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted text-left transition-colors border-b border-border last:border-0"
                        >
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            {p.imageUrl ? (
                              <Image src={p.imageUrl} alt={p.name} width={40} height={40} className="rounded-lg object-cover" />
                            ) : (
                              <Icon name="PhotoIcon" size={18} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.ref} · Achat: {p.purchasePriceSupplier > 0 ? p.purchasePriceSupplier.toFixed(2) : p.buyPrice.toFixed(2)} {currency}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-500 ${st.color}`}>{st.label}</span>
                            <p className="text-xs text-muted-foreground mt-0.5">Stock: {p.stock}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                {showSearch && searchResults.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-border rounded-xl shadow-lg z-30 p-4 text-center text-sm text-muted-foreground">
                    Aucun produit trouvé
                  </div>
                )}
              </div>
            </div>

            {/* Order lines */}
            {lines.length > 0 && (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="font-600 text-foreground flex items-center gap-2">
                    <Icon name="ShoppingCartIcon" size={16} className="text-primary" />
                    Lignes de commande ({lines.length})
                  </h2>
                </div>
                <div className="divide-y divide-border">
                  {lines.map((line) => {
                    const st = stockStatus(line.currentStock, line.minStock);
                    return (
                      <div key={line.key} className="p-4">
                        <div className="flex items-start gap-3 mb-3">
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                            {line.productImageUrl ? (
                              <Image src={line.productImageUrl} alt={line.productName} width={48} height={48} className="rounded-lg object-cover" />
                            ) : (
                              <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-500 text-foreground text-sm">{line.productName}</p>
                              <span className="text-xs text-muted-foreground">{line.productRef}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-500 ${st.color}`}>{st.label}</span>
                            </div>
                            <div className="flex gap-3 mt-0.5 text-xs text-muted-foreground">
                              <span>Stock: {line.currentStock}</span>
                              <span>Min: {line.minStock}</span>
                              {line.sales30d > 0 && <span>{line.sales30d} ventes/30j</span>}
                              {line.avgRestockDays > 0 && <span>Délai: {line.avgRestockDays}j</span>}
                            </div>
                          </div>
                          <button onClick={() => removeLine(line.key)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                            <Icon name="TrashIcon" size={15} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Quantité</label>
                            <input
                              type="number" min="1"
                              value={line.qtyOrdered}
                              onChange={(e) => updateLine(line.key, 'qtyOrdered', parseInt(e.target.value) || 1)}
                              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm text-center font-600 focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Prix achat ({currency})</label>
                            <input
                              type="number" min="0" step="0.01"
                              value={line.unitPrice}
                              onChange={(e) => updateLine(line.key, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                          <div>
                            {line.hasColorVariants ? (
                              <>
                                <label className="block text-[11px] text-muted-foreground mb-1">
                                  Couleur / Variante *{' '}
                                  {!line.color && <span className="text-red-500">requis</span>}
                                </label>
                                <select
                                  value={line.color}
                                  onChange={(e) => {
                                    updateLine(line.key, 'color', e.target.value);
                                    updateLine(line.key, 'variant', e.target.value);
                                  }}
                                  className={`w-full px-2.5 py-1.5 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 ${!line.color ? 'border-red-300' : 'border-border'}`}
                                >
                                  <option value="">Sélectionner une couleur…</option>
                                  {line.colorVariants.map((v) => (
                                    <option key={v.color_name} value={v.color_name}>
                                      {v.color_name}{v.quantity > 0 ? ` — Stock: ${v.quantity}` : ' — Rupture'}
                                    </option>
                                  ))}
                                </select>
                                {line.color && (() => {
                                  const sel = line.colorVariants.find((v) => v.color_name === line.color);
                                  return sel ? (
                                    <div className="flex items-center gap-1.5 mt-1">
                                      {sel.color_hex && (
                                        <span className="w-3 h-3 rounded-full border border-border inline-block shrink-0" style={{ backgroundColor: sel.color_hex }} />
                                      )}
                                      <span className={`text-[10px] font-500 ${sel.quantity === 0 ? 'text-red-600' : sel.quantity < 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                        Stock: {sel.quantity}
                                      </span>
                                    </div>
                                  ) : null;
                                })()}
                              </>
                            ) : (
                              <>
                                <label className="block text-[11px] text-muted-foreground mb-1">Variante / Couleur</label>
                                <input
                                  type="text"
                                  value={line.color}
                                  onChange={(e) => updateLine(line.key, 'color', e.target.value)}
                                  placeholder="ex: Rouge, Taille M…"
                                  className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                              </>
                            )}
                          </div>
                          <div>
                            <label className="block text-[11px] text-muted-foreground mb-1">Note</label>
                            <input
                              type="text"
                              value={line.note}
                              onChange={(e) => updateLine(line.key, 'note', e.target.value)}
                              placeholder="Note produit..."
                              className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end mt-2">
                          <span className="text-sm font-600 text-foreground">
                            Total: {(line.qtyOrdered * line.unitPrice).toFixed(2)} {currency}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: summary */}
          <div className="space-y-5">
            <div className="bg-white border border-border rounded-xl p-5 shadow-card sticky top-20">
              <h2 className="font-600 text-foreground mb-4">Récapitulatif</h2>
              {selectedSupplierObj && (
                <div className="bg-muted/50 rounded-xl p-3 mb-4">
                  <p className="text-xs font-600 text-foreground">{selectedSupplierObj.companyName}</p>
                  {selectedSupplierObj.contactName && <p className="text-xs text-muted-foreground">{selectedSupplierObj.contactName}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    Délai: {selectedSupplierObj.productionDelayDays + selectedSupplierObj.shippingDelayDays} jours
                  </p>
                  {selectedSupplierObj.minimumOrder && (
                    <p className="text-xs text-muted-foreground">Min: {selectedSupplierObj.minimumOrder}</p>
                  )}
                </div>
              )}
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Produits</span>
                  <span className="font-500">{lines.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantité totale</span>
                  <span className="font-500">{lines.reduce((s, l) => s + l.qtyOrdered, 0)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between text-base font-700">
                  <span>Sous-total</span>
                  <span className="text-primary">{subtotal.toFixed(2)} {currency}</span>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => handleSave('draft')}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Icon name="DocumentIcon" size={15} />
                  Enregistrer brouillon
                </button>
                <button
                  onClick={() => handleSave('sent')}
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  <Icon name="PaperAirplaneIcon" size={15} />
                  {saving ? 'Envoi...' : 'Envoyer au fournisseur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

export default function NouvelleCommandePage() {
  return (
    <Suspense fallback={
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    }>
      <NouvelleCommandeContent />
    </Suspense>
  );
}
