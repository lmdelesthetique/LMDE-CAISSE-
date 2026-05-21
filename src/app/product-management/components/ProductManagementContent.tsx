'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import StatusBadge from '@/components/ui/StatusBadge';
import { type ProductRecord, type ColorVariant } from './mockProducts';
import ProductFormModal from './ProductFormModal';
import BarcodeLabelModal from './BarcodeLabelModal';
import KitFormModal from './KitFormModal';
import BulkEditModal from './BulkEditModal';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { categoryStore, supplierStore } from '@/lib/stores/dataStore';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

type SortField = 'name' | 'costPrice' | 'sellPriceTTC' | 'marginPct' | 'stock';
type SortDir = 'asc' | 'desc';

function mapDbProduct(r: any): ProductRecord {
  const buyPrice = Number(r.buy_price) || 0;
  const transport = Number(r.transport) || 0;
  const customs = Number(r.customs) || 0;
  const otherFees = Number(r.other_fees) || 0;
  const costPrice = buyPrice + transport + customs + otherFees;
  const sellPriceHT = Number(r.sell_price_ht) || Number(r.sell_price_ttc) / 1.085 || 0;
  const sellPriceTTC = Number(r.sell_price_ttc) || sellPriceHT * 1.085;
  const marginAmount = sellPriceHT - costPrice;
  const marginPct = sellPriceHT > 0 ? (marginAmount / sellPriceHT) * 100 : 0;
  return {
    id: r.id,
    ref: r.ref || '',
    barcode: r.barcode || r.ref || '',
    name: r.name || '',
    category: r.category || '',
    supplier: r.supplier || '',
    supplierId: r.supplier_id || undefined,
    buyPrice,
    transport,
    customs,
    costPrice,
    sellPriceHT,
    sellPriceTTC,
    marginAmount,
    marginPct,
    stock: Number(r.stock) || 0,
    minStock: Number(r.min_stock) || 5,
    status: r.status || r.product_status || 'active',
    shopify: Boolean(r.shopify),
    variants: Boolean(r.has_color_variants),
    imageUrl: r.image_url || undefined,
    colorVariants: undefined,
    isKit: Boolean(r.is_kit),
  };
}

export default function ProductManagementContent() {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierOptions, setSupplierOptions] = useState<string[]>(['Tous']);
  const [categoryOptions, setCategoryOptions] = useState<string[]>(['Tous']);
  const [showBulkEdit, setShowBulkEdit] = useState(false);

  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('Tous');
  const [filterSupplier, setFilterSupplier] = useState('Tous');
  const [filterStatus, setFilterStatus] = useState('Tous');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductRecord | null>(null);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const [barcodePrintProducts, setBarcodePrintProducts] = useState<ProductRecord[]>([]);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [visibleCols, setVisibleCols] = useState({
    ref: true, barcode: true, category: true, supplier: true,
    buyPrice: true, costPrice: true, sellPriceTTC: true,
    marginPct: true, stock: true, status: true, shopify: true,
  });
  const [showKitModal, setShowKitModal] = useState(false);
  const [editKitId, setEditKitId] = useState<string | null>(null);
  const [kitFilter, setKitFilter] = useState<'all' | 'kits' | 'products'>('all');

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadProducts = useCallback(async () => {
    setLoading(true);
    const data = await fetchAll<any>((from, to) =>
      supabase.from('products').select('*').order('name').range(from, to)
    );
    if (data.length >= 0) {
      const mapped = data.map(mapDbProduct);
      setProducts(mapped);
      // Load categories and suppliers from centralized store
      const [cats, sups] = await Promise.all([
        categoryStore.load(),
        supplierStore.load(),
      ]);
      const catNames = cats.map((c) => c.name).sort();
      const supNames = sups.map((s) => s.companyName).sort();
      // Also include any categories/suppliers from products not yet in store
      const prodCats = Array.from(new Set(mapped.map(p => p.category).filter(Boolean)));
      const prodSups = Array.from(new Set(mapped.map(p => p.supplier).filter(Boolean)));
      const allCats = Array.from(new Set([...catNames, ...prodCats])).sort();
      const allSups = Array.from(new Set([...supNames, ...prodSups])).sort();
      setCategoryOptions(['Tous', ...allCats]);
      setSupplierOptions(['Tous', ...allSups]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  // Real-time sync: refresh product list when products table changes
  useRealtimeSync({ tables: ['products'], onRefresh: loadProducts });

  const statusOptions = ['Tous', 'Actif', 'Inactif', 'Rupture', 'Bientôt dispo'];
  const statusMap: Record<string, string> = {
    'Actif': 'active', 'Inactif': 'inactive', 'Rupture': 'rupture', 'Bientôt dispo': 'coming_soon',
  };

  const filtered = useMemo(() => {
    return products
      .filter((p) => {
        const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.ref.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode || '').includes(search);
        const matchCat = filterCategory === 'Tous' || p.category === filterCategory;
        const matchSup = filterSupplier === 'Tous' || p.supplier === filterSupplier;
        const matchStatus = filterStatus === 'Tous' || p.status === statusMap[filterStatus];
        const matchKit = kitFilter === 'all' || (kitFilter === 'kits' ? p.isKit : !p.isKit);
        return matchSearch && matchCat && matchSup && matchStatus && matchKit;
      })
      .sort((a, b) => {
        let av: string | number = a[sortField] as string | number;
        let bv: string | number = b[sortField] as string | number;
        if (typeof av === 'string') av = av.toLowerCase();
        if (typeof bv === 'string') bv = bv.toLowerCase();
        if (av < bv) return sortDir === 'asc' ? -1 : 1;
        if (av > bv) return sortDir === 'asc' ? 1 : -1;
        return 0;
      });
  }, [products, search, filterCategory, filterSupplier, filterStatus, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

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

  const openCreate = () => { setEditProduct(null); setShowModal(true); };
  const openEdit = async (p: ProductRecord) => {
    const { data: variantRows } = await supabase
      .from('product_color_stock')
      .select('id, color_name, color_hex, quantity, min_stock')
      .eq('product_id', p.id)
      .order('created_at', { ascending: true });
    const colorVariants: ColorVariant[] = (variantRows || []).map((v: any) => ({
      id: v.id,
      colorName: v.color_name || '',
      colorHex: v.color_hex || '#000000',
      quantity: Number(v.quantity) || 0,
      minStock: Number(v.min_stock) || 0,
    }));
    setEditProduct({ ...p, colorVariants: colorVariants.length > 0 ? colorVariants : undefined });
    setShowModal(true);
  };

  const openBarcodeForProduct = (p: ProductRecord) => {
    setBarcodePrintProducts([p]);
    setShowBarcodeModal(true);
  };

  const openBarcodeForSelected = () => {
    const selected = filtered.filter((p) => selectedIds.has(p.id));
    setBarcodePrintProducts(selected.length > 0 ? selected : filtered);
    setShowBarcodeModal(true);
  };

  const handleDelete = async (id: string, name: string) => {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      showToast(`Erreur suppression : ${error.message}`, 'error');
    } else {
      showToast(`Produit "${name}" supprimé`);
      loadProducts();
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from('products').delete().in('id', ids);
    if (error) {
      showToast(`Erreur suppression : ${error.message}`, 'error');
    } else {
      showToast(`${ids.length} produit${ids.length > 1 ? 's' : ''} supprimé${ids.length > 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      loadProducts();
    }
  };

  const handleBulkEditDone = () => {
    setShowBulkEdit(false);
    setSelectedIds(new Set());
    loadProducts();
  };

  const handleSave = async (data: any, imageUrl?: string, colorVariants?: ColorVariant[]) => {
    let savedProductId: string | null = null;
    const transportPctAmount = Number(data.buyPrice) * (Number(data.transportPct || 0) / 100);
    const costPrice = Number(data.buyPrice) + Number(data.transport || 0) + transportPctAmount + Number(data.customs || 0) + Number(data.otherFees || 0);
    const tvaRate = Number(data.tva || 8.5);
    const sellPriceHT = Number(data.sellPriceHT) || 0;
    const sellPriceTTC = sellPriceHT * (1 + tvaRate / 100);
    const newQuantity = Number(data.quantityAvailable) || 0;

    // Auto-compute status based on stock vs minStock
    let computedStatus = data.status || 'active';
    if (newQuantity === 0 && computedStatus === 'active') computedStatus = 'rupture';
    else if (newQuantity > 0 && computedStatus === 'rupture') computedStatus = 'active';

    const payload: any = {
      name: data.name,
      ref: data.ref || null,
      barcode: data.barcode || null,
      category: data.category,
      supplier: data.supplier || null,
      supplier_id: data.supplierId || null,
      buy_price: Number(data.buyPrice) || 0,
      transport: Number(data.transport) || 0,
      customs: Number(data.customs) || 0,
      other_fees: Number(data.otherFees) || 0,
      sell_price_ht: sellPriceHT,
      sell_price_ttc: Math.round(sellPriceTTC * 100) / 100,
      min_stock: Number(data.minStock) || 5,
      stock: newQuantity,
      status: computedStatus,
      product_status: computedStatus,
      shopify: Boolean(data.shopify),
      // Ensure we never store a data: URL — only real storage URLs or null
      image_url: (imageUrl && !imageUrl.startsWith('data:')) ? imageUrl : null,
      updated_at: new Date().toISOString(),
    };

    if (editProduct) {
      savedProductId = editProduct.id;
      const previousStock = editProduct.stock || 0;
      const { error } = await supabase.from('products').update(payload).eq('id', editProduct.id);
      if (error) {
        showToast(`Erreur mise à jour : ${error.message}`, 'error');
        return;
      }
      // If supplier changed, update supplier_id on product
      if (data.supplierId && data.supplierId !== editProduct.supplierId) {
        await supabase.from('products').update({ supplier_id: data.supplierId, purchase_price_supplier: Number(data.buyPrice) || 0 }).eq('id', editProduct.id);
      }
      // Log stock movement if quantity changed
      if (newQuantity !== previousStock) {
        await supabase.from('stock_movements_log').insert({
          product_id: editProduct.id,
          product_name: data.name,
          movement_type: newQuantity > previousStock ? 'entry' : 'adjustment',
          quantity_before: previousStock,
          quantity_after: newQuantity,
          quantity_change: newQuantity - previousStock,
          reason: 'Modification fiche produit',
          source: 'product_edit',
          performed_by: 'Admin',
          created_at: new Date().toISOString(),
        });
      }
      showToast(`Produit "${data.name}" mis à jour`);
    } else {
      const { data: inserted, error } = await supabase
        .from('products')
        .insert({ ...payload, created_at: new Date().toISOString() })
        .select('id')
        .single();
      if (error) {
        showToast(`Erreur création : ${error.message}`, 'error');
        return;
      }
      savedProductId = inserted?.id ?? null;
      // Log initial stock entry if quantity > 0
      if (newQuantity > 0 && inserted?.id) {
        await supabase.from('stock_movements_log').insert({
          product_id: inserted.id,
          product_name: data.name,
          movement_type: 'entry',
          quantity_before: 0,
          quantity_after: newQuantity,
          quantity_change: newQuantity,
          reason: 'Stock initial — création produit',
          source: 'product_creation',
          performed_by: 'Admin',
          created_at: new Date().toISOString(),
        });
      }
      const colorMsg = colorVariants && colorVariants.length > 0
        ? ` — ${colorVariants.length} couleur${colorVariants.length > 1 ? 's' : ''} ajoutée${colorVariants.length > 1 ? 's' : ''}`
        : '';
      showToast(`Produit "${data.name}" créé avec succès${colorMsg}`);
    }

    // Save color variants
    if (savedProductId && colorVariants !== undefined) {
      await supabase.from('product_color_stock').delete().eq('product_id', savedProductId);
      if (colorVariants.length > 0) {
        const { error: varErr } = await supabase.from('product_color_stock').insert(
          colorVariants.map((v) => ({
            product_id: savedProductId,
            color_name: v.colorName,
            color_hex: v.colorHex,
            quantity: v.quantity,
            min_stock: v.minStock,
          }))
        );
        if (varErr) showToast(`Erreur déclinaisons : ${varErr.message}`, 'error');
      }
      await supabase.from('products')
        .update({ has_color_variants: colorVariants.length > 0 })
        .eq('id', savedProductId);
    }

    setShowModal(false);
    loadProducts();
  };

  const SortIcon = ({ field }: { field: SortField }) => (
    <span className="ml-1 inline-flex flex-col">
      <Icon name="ChevronUpIcon" size={10} className={sortField === field && sortDir === 'asc' ? 'text-primary' : 'text-muted-foreground/40'} />
      <Icon name="ChevronDownIcon" size={10} className={sortField === field && sortDir === 'desc' ? 'text-primary' : 'text-muted-foreground/40'} />
    </span>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-500 text-white animate-slide-up ${toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'}`}>
          {toast.msg}
        </div>
      )}

      {/* Page header */}
      <div className="border-b border-border bg-white px-6 lg:px-8 xl:px-10 py-4 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Produits</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{loading ? 'Chargement…' : `${products.length} produits au catalogue`}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Icon name="ArrowUpTrayIcon" size={15} />
              Importer
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Icon name="ArrowDownTrayIcon" size={15} />
              Exporter
            </button>
            <button
              onClick={() => { setBarcodePrintProducts(filtered); setShowBarcodeModal(true); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon name="PrinterIcon" size={15} />
              Étiquettes
            </button>
            <button
              onClick={() => { setEditKitId(null); setShowKitModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-600 hover:opacity-90 transition-opacity active:scale-95"
            >
              <Icon name="GiftIcon" size={15} />
              Créer un kit
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity active:scale-95"
            >
              <Icon name="PlusIcon" size={15} />
              Nouveau produit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 xl:px-10 2xl:px-16 py-5 w-full flex flex-col gap-4 flex-1">
        {/* Kit / Product filter */}
        <div className="flex items-center gap-1 border border-border rounded-lg p-0.5 bg-white w-fit">
          {([['all', 'Tous'], ['products', 'Produits'], ['kits', 'Kits']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setKitFilter(val)}
              className={`px-3 py-1.5 text-xs font-600 rounded-md transition-colors ${kitFilter === val ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, référence, code-barres…"
              className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
            {categoryOptions.map((c) => <option key={`cat-filter-${c}`} value={c}>{c}</option>)}
          </select>
          <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
            {supplierOptions.map((s) => <option key={`sup-filter-${s}`} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm border border-border rounded-lg bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary cursor-pointer">
            {statusOptions.map((s) => <option key={`status-filter-${s}`} value={s}>{s}</option>)}
          </select>
          <span className="text-sm text-muted-foreground ml-auto">{filtered.length} résultat{filtered.length > 1 ? 's' : ''}</span>
          <div className="relative">
            <button onClick={() => setShowColumnMenu((p) => !p)} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              <Icon name="ViewColumnsIcon" size={15} />
              Colonnes
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-modal z-30 p-3 min-w-[180px] animate-fade-in">
                {(Object.keys(visibleCols) as (keyof typeof visibleCols)[]).map((col) => (
                  <label key={`col-toggle-${col}`} className="flex items-center gap-2 py-1.5 cursor-pointer hover:text-foreground text-sm text-muted-foreground">
                    <input type="checkbox" checked={visibleCols[col]} onChange={() => setVisibleCols((p) => ({ ...p, [col]: !p[col] }))} className="accent-primary" />
                    {col}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 animate-slide-up">
            <span className="text-sm font-600 text-primary">{selectedIds.size} produit{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setShowBulkEdit(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Icon name="PencilSquareIcon" size={12} />
                Modifier en masse
              </button>
              <button
                onClick={openBarcodeForSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
              >
                <Icon name="PrinterIcon" size={12} />
                Imprimer étiquettes
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1.5 text-xs font-600 border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              >
                Supprimer
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="p-1.5 rounded-lg hover:bg-white text-muted-foreground transition-colors">
                <Icon name="XMarkIcon" size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[1100px]">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selectedIds.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} className="accent-primary" />
                  </th>
                  <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('name')}>
                    <span className="flex items-center">Produit <SortIcon field="name" /></span>
                  </th>
                  {visibleCols.ref && <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide whitespace-nowrap">Réf.</th>}
                  {visibleCols.barcode && <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Code-barres</th>}
                  {visibleCols.category && <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Catégorie</th>}
                  {visibleCols.supplier && <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Fournisseur</th>}
                  {visibleCols.buyPrice && <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('costPrice')}><span className="flex items-center justify-end">Prix achat <SortIcon field="costPrice" /></span></th>}
                  {visibleCols.costPrice && <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide whitespace-nowrap">Prix revient</th>}
                  {visibleCols.sellPriceTTC && <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none whitespace-nowrap" onClick={() => toggleSort('sellPriceTTC')}><span className="flex items-center justify-end">PV TTC <SortIcon field="sellPriceTTC" /></span></th>}
                  {visibleCols.marginPct && <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('marginPct')}><span className="flex items-center justify-end">Marge <SortIcon field="marginPct" /></span></th>}
                  {visibleCols.stock && <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort('stock')}><span className="flex items-center justify-end">Stock <SortIcon field="stock" /></span></th>}
                  {visibleCols.status && <th className="text-left px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Statut</th>}
                  {visibleCols.shopify && <th className="text-center px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Shopify</th>}
                  <th className="text-right px-4 py-3 text-[11px] font-600 text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Icon name="TagIcon" size={36} className="text-muted-foreground" />
                        <p className="text-sm font-500 text-foreground">Aucun produit trouvé</p>
                        <p className="text-xs text-muted-foreground">Modifiez vos filtres ou ajoutez un nouveau produit au catalogue</p>
                        <button onClick={openCreate} className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 active:scale-95 transition-all">
                          Ajouter un produit
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((product, idx) => (
                    <tr key={product.id} className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors group ${idx % 2 === 1 ? 'bg-muted/10' : ''} ${selectedIds.has(product.id) ? 'bg-primary/5' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selectedIds.has(product.id)} onChange={() => toggleSelect(product.id)} className="accent-primary" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0 overflow-hidden border border-border/50">
                            {product.imageUrl ? (
                              <img src={product.imageUrl} alt={`Photo de ${product.name}`} className="w-full h-full object-cover" />
                            ) : (
                              <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-500 text-foreground truncate max-w-[180px]">{product.name}</p>
                              {product.isKit && (
                                <span className="shrink-0 text-[10px] font-600 bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">Kit</span>
                              )}
                            </div>
                            {product.supplier && <p className="text-[10px] text-muted-foreground truncate max-w-[180px]">{product.supplier}</p>}
                          </div>
                        </div>
                      </td>
                      {visibleCols.ref && <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{product.ref}</td>}
                      {visibleCols.barcode && <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{product.barcode}</td>}
                      {visibleCols.category && <td className="px-4 py-3"><span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-md font-medium whitespace-nowrap">{product.category}</span></td>}
                      {visibleCols.supplier && <td className="px-4 py-3 text-xs text-muted-foreground max-w-[140px] truncate">{product.supplier}</td>}
                      {visibleCols.buyPrice && <td className="px-4 py-3 text-right tabular-nums text-sm text-muted-foreground">{product.buyPrice.toFixed(2)} €</td>}
                      {visibleCols.costPrice && <td className="px-4 py-3 text-right tabular-nums text-sm font-500 text-foreground">{product.costPrice.toFixed(2)} €</td>}
                      {visibleCols.sellPriceTTC && <td className="px-4 py-3 text-right tabular-nums text-sm font-700 text-foreground">{product.sellPriceTTC.toFixed(2)} €</td>}
                      {visibleCols.marginPct && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-xs font-700 tabular-nums ${product.marginPct >= 60 ? 'text-emerald-600' : product.marginPct >= 45 ? 'text-amber-600' : 'text-red-500'}`}>{product.marginPct.toFixed(1)}%</span>
                            <div className="w-16 h-1 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${product.marginPct >= 60 ? 'bg-emerald-500' : product.marginPct >= 45 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, Math.max(0, product.marginPct))}%` }} />
                            </div>
                          </div>
                        </td>
                      )}
                      {visibleCols.stock && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-sm font-700 tabular-nums ${product.stock === 0 ? 'text-red-600' : product.stock <= product.minStock ? 'text-amber-600' : 'text-foreground'}`}>{product.stock}</span>
                            <span className="text-[10px] text-muted-foreground">min {product.minStock}</span>
                          </div>
                        </td>
                      )}
                      {visibleCols.status && <td className="px-4 py-3"><StatusBadge variant={product.status as any} size="sm" /></td>}
                      {visibleCols.shopify && (
                        <td className="px-4 py-3 text-center">
                          {product.shopify ? (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 rounded-full"><Icon name="CheckIcon" size={11} className="text-emerald-600" /></span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-5 h-5 bg-muted rounded-full"><Icon name="MinusIcon" size={11} className="text-muted-foreground" /></span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button title="Imprimer étiquette" onClick={() => openBarcodeForProduct(product)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                            <Icon name="PrinterIcon" size={14} />
                          </button>
                          {product.isKit ? (
                            <button onClick={() => { setEditKitId(product.id); setShowKitModal(true); }} title="Modifier le kit" className="p-1.5 rounded-lg hover:bg-violet-50 text-muted-foreground hover:text-violet-600 transition-colors">
                              <Icon name="GiftIcon" size={14} />
                            </button>
                          ) : (
                            <button onClick={() => openEdit(product)} title="Modifier ce produit" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                              <Icon name="PencilIcon" size={14} />
                            </button>
                          )}
                          <button title="Supprimer ce produit" onClick={() => handleDelete(product.id, product.name)} className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors">
                            <Icon name="TrashIcon" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{filtered.length} produit{filtered.length > 1 ? 's' : ''} au total</span>
            </div>
          </div>
        </div>
      </div>

      {/* Product Form Modal */}
      {showModal && (
        <ProductFormModal
          product={editProduct}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}

      {/* Barcode Label Modal */}
      {showBarcodeModal && barcodePrintProducts.length > 0 && (
        <BarcodeLabelModal
          products={barcodePrintProducts}
          onClose={() => setShowBarcodeModal(false)}
        />
      )}

      {/* Kit Form Modal */}
      {showKitModal && (
        <KitFormModal
          kitProductId={editKitId || undefined}
          onClose={() => { setShowKitModal(false); setEditKitId(null); }}
          onSaved={() => { setShowKitModal(false); setEditKitId(null); loadProducts(); }}
        />
      )}

      {/* Bulk Edit Modal */}
      {showBulkEdit && selectedIds.size > 0 && (
        <BulkEditModal
          products={filtered.filter((p) => selectedIds.has(p.id))}
          onClose={() => setShowBulkEdit(false)}
          onDone={handleBulkEditDone}
        />
      )}
    </div>
  );
}