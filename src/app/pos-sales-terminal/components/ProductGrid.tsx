'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import POSFavouritesManager from './POSFavouritesManager';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

interface DBProduct {
  id: string;
  name: string;
  ref: string;
  barcode?: string;
  sell_price_ttc: number;
  sell_price_ht?: number;
  buy_price?: number;
  transport?: number;
  customs?: number;
  other_fees?: number;
  structure_pct?: number;
  stock: number;
  min_stock?: number;
  category: string;
  image_url?: string;
  status: string;
  product_status?: string;
  is_kit?: boolean;
  has_color_variants?: boolean;
  is_favorite?: boolean;
}

interface ColorVariantRow {
  id: string;
  color_name: string;
  color_hex: string;
  quantity: number;
}

interface FavouriteRow {
  product_id: string;
  sort_order: number;
}

interface ProductGridProps {
  onAddToCart: (product: { id: string; name: string; sku: string; price: number; imageUrl?: string; stock: number; variantName?: string; costPrice?: number }) => void;
}

function computeCostPrice(p: DBProduct): number {
  const buyPrice = Number(p.buy_price) || 0;
  const transport = Number(p.transport) || 0;
  const customs = Number(p.customs) || 0;
  const otherFees = Number(p.other_fees) || 0;
  const structurePct = Number(p.structure_pct) || 0;
  const baseCost = buyPrice + transport + customs + otherFees;
  return baseCost + baseCost * (structurePct / 100);
}

function getStockBadge(stock: number, minStock: number, isKit: boolean): { label: string; color: string } | null {
  if (isKit) return null;
  if (stock === 0) return { label: 'Rupture', color: 'bg-red-500 text-white' };
  if (stock <= (minStock || 3)) return { label: `Stock: ${stock}`, color: 'bg-amber-500 text-white' };
  return { label: `Stock: ${stock}`, color: 'bg-emerald-500 text-white' };
}

export default function ProductGrid({ onAddToCart }: ProductGridProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('__all__');
  const [activeTab, setActiveTab] = useState<'all' | 'favourites'>('all');
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [categories, setCategories] = useState<{ id: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFavManager, setShowFavManager] = useState(false);
  const [variantPickerProduct, setVariantPickerProduct] = useState<DBProduct | null>(null);
  const [variantPickerRows, setVariantPickerRows] = useState<ColorVariantRow[]>([]);
  const [variantPickerLoading, setVariantPickerLoading] = useState(false);

  const openVariantPicker = useCallback(async (product: DBProduct) => {
    setVariantPickerProduct(product);
    setVariantPickerLoading(true);
    const { data } = await supabase
      .from('product_color_stock')
      .select('id, color_name, color_hex, quantity')
      .eq('product_id', product.id)
      .order('created_at', { ascending: true });
    setVariantPickerRows((data as ColorVariantRow[]) || []);
    setVariantPickerLoading(false);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    const allProds = await fetchAll<DBProduct>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, barcode, sell_price_ttc, sell_price_ht, buy_price, transport, customs, other_fees, structure_pct, stock, min_stock, category, image_url, status, product_status, is_kit, has_color_variants, is_favorite')
        .in('status', ['active', 'rupture'])
        .order('name')
        .range(from, to)
    );
    setProducts(allProds);
    const cats = Array.from(new Set(allProds.map((p) => p.category).filter(Boolean))).sort() as string[];
    setCategories([
      { id: '__all__', label: 'Tous' },
      ...cats.map((c) => ({ id: c, label: c })),
    ]);
    setLoading(false);
  }, []);

  const toggleFavorite = useCallback(async (product: DBProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !product.is_favorite;
    await supabase.from('products').update({ is_favorite: newVal }).eq('id', product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_favorite: newVal } : p));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time sync: refresh products when products or stock_movements change
  useRealtimeSync({ tables: ['products', 'stock_movements'], onRefresh: loadData });

  const allFiltered = useMemo(() => {
    const filtered = products.filter((p) => {
      const matchCat = activeCategory === '__all__' || p.category === activeCategory;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.ref || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || '').includes(search);
      return matchCat && matchSearch;
    });
    // Favorites appear first
    return [...filtered.filter(p => p.is_favorite), ...filtered.filter(p => !p.is_favorite)];
  }, [products, search, activeCategory]);

  const favouriteProducts = useMemo(() => {
    return products
      .filter(p => p.is_favorite)
      .filter(p => {
        if (!search) return true;
        return p.name.toLowerCase().includes(search.toLowerCase()) || (p.ref || '').toLowerCase().includes(search.toLowerCase());
      });
  }, [products, search]);

  const displayedProducts = activeTab === 'favourites' ? favouriteProducts : allFiltered;

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Search bar */}
      <div className="px-4 pt-3 pb-2 bg-white border-b border-border">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit ou scanner un code-barres…"
              className="w-full pl-9 pr-10 py-2 text-sm border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <Icon name="XMarkIcon" size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFavManager(true)}
            title="Gérer les favoris"
            className="p-2 rounded-lg border border-border bg-white hover:bg-amber-50 hover:border-amber-200 text-muted-foreground hover:text-amber-600 transition-colors shrink-0"
          >
            <Icon name="StarIcon" size={16} />
          </button>
          <button
            onClick={loadData}
            title="Actualiser"
            className="p-2 rounded-lg border border-border bg-white hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <Icon name="ArrowPathIcon" size={16} />
          </button>
        </div>
      </div>

      {/* Tab: All / Favourites */}
      <div className="px-4 pt-2 pb-0 bg-white border-b border-border">
        <div className="flex items-center gap-1 mb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${activeTab === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            <Icon name="Squares2X2Icon" size={13} />
            Tous les produits
          </button>
          <button
            onClick={() => setActiveTab('favourites')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-600 transition-colors ${activeTab === 'favourites' ? 'bg-amber-500 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          >
            <Icon name="StarIcon" size={13} />
            Favoris ({products.filter(p => p.is_favorite).length})
          </button>
        </div>

        {/* Category tabs — only in "all" mode */}
        {activeTab === 'all' && (
          <div className="overflow-x-auto scrollbar-thin pb-2">
            <div className="flex items-center gap-1.5 min-w-max">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-600 whitespace-nowrap transition-all duration-150 ${
                    activeCategory === cat.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Product grid */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Chargement des produits…</p>
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Icon name={activeTab === 'favourites' ? 'StarIcon' : 'MagnifyingGlassIcon'} size={32} className="text-muted-foreground mb-3" />
            <p className="text-sm font-500 text-foreground">
              {activeTab === 'favourites' ? 'Aucun favori configuré' : 'Aucun produit trouvé'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeTab === 'favourites' ? 'Cliquez sur ⭐ pour gérer vos favoris caisse' : 'Essayez un autre terme ou catégorie'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-1.5">
            {displayedProducts.map((product) => {
              const isFav = Boolean(product.is_favorite);
              const isOutOfStock = product.stock === 0;
              const minStock = product.min_stock || 3;
              const isLowStock = !isOutOfStock && product.stock <= minStock;

              return (
                <button
                  key={product.id}
                  onClick={() => {
                    if (!isOutOfStock) {
                      if (product.has_color_variants) {
                        openVariantPicker(product);
                      } else {
                        onAddToCart({
                          id: product.id,
                          name: product.name,
                          sku: product.ref || product.id,
                          price: Number(product.sell_price_ttc),
                          imageUrl: product.image_url,
                          stock: product.stock,
                          costPrice: computeCostPrice(product),
                        });
                      }
                    }
                  }}
                  disabled={isOutOfStock}
                  title={product.name}
                  className={`group relative flex flex-col rounded-lg border bg-white text-left transition-all duration-150 overflow-hidden
                    ${isOutOfStock
                      ? 'opacity-60 cursor-not-allowed border-red-200 bg-red-50/20'
                      : isLowStock
                        ? 'hover:shadow-md hover:border-amber-300 active:scale-95 border-amber-200'
                        : 'hover:shadow-md hover:border-primary/40 active:scale-95 border-border'
                    }`}
                >
                  {/* Image — fixed height */}
                  <div className="relative overflow-hidden bg-muted/30 shrink-0 w-full" style={{ height: '70px' }}>
                    {product.image_url ? (
                      <AppImage
                        src={product.image_url}
                        alt={product.name}
                        width={110}
                        height={70}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="PhotoIcon" size={20} className="text-muted-foreground/40" />
                      </div>
                    )}
                    <button
                      onClick={(e) => toggleFavorite(product, e)}
                      title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                      className={`absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${isFav ? 'bg-amber-400' : 'bg-black/20 hover:bg-amber-300'}`}
                    >
                      <Icon name="StarIcon" size={9} className="text-white" />
                    </button>
                    {product.is_kit && (
                      <span className="absolute top-1 right-1 bg-violet-500 text-white text-[7px] font-700 px-1 py-0.5 rounded-full leading-none">Kit</span>
                    )}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-red-900/25 flex items-center justify-center">
                        <span className="bg-red-600 text-white text-[8px] font-700 px-1.5 py-0.5 rounded-full shadow">Rupture</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="px-1.5 pt-1 pb-1.5 flex flex-col gap-0.5 flex-1">
                    <p className="text-[10px] font-600 text-foreground leading-[13px] line-clamp-2 flex-1">{product.name}</p>
                    <div className="flex items-center justify-between gap-0.5 mt-0.5">
                      <p className="text-[11px] font-700 text-primary tabular-nums shrink-0">{Number(product.sell_price_ttc).toFixed(2)} €</p>
                      {!product.is_kit && (
                        <span className={`text-[8px] font-600 px-1 py-0.5 rounded-full leading-none shrink-0 ${
                          isOutOfStock ? 'bg-red-100 text-red-700' :
                          isLowStock ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isOutOfStock ? '0' : isLowStock ? product.stock : '✓'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add overlay */}
                  {!isOutOfStock && (
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shadow">
                        <Icon name="PlusIcon" size={12} className="text-white" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {showFavManager && (
        <POSFavouritesManager
          onClose={() => { setShowFavManager(false); loadData(); }}
        />
      )}

      {/* Variant picker modal */}
      {variantPickerProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div>
                <p className="text-xs text-muted-foreground">Choisir une couleur</p>
                <p className="text-sm font-600 text-foreground truncate max-w-[220px]">{variantPickerProduct.name}</p>
              </div>
              <button
                onClick={() => { setVariantPickerProduct(null); setVariantPickerRows([]); }}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>
            <div className="p-4">
              {variantPickerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : variantPickerRows.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Aucune déclinaison trouvée</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {variantPickerRows.map((v) => (
                    <button
                      key={v.id}
                      disabled={v.quantity === 0}
                      onClick={() => {
                        onAddToCart({
                          id: variantPickerProduct.id,
                          name: variantPickerProduct.name,
                          sku: variantPickerProduct.ref || variantPickerProduct.id,
                          price: Number(variantPickerProduct.sell_price_ttc),
                          imageUrl: variantPickerProduct.image_url,
                          stock: v.quantity,
                          variantName: v.color_name,
                          costPrice: computeCostPrice(variantPickerProduct),
                        });
                        setVariantPickerProduct(null);
                        setVariantPickerRows([]);
                      }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-all active:scale-95 ${
                        v.quantity === 0
                          ? 'opacity-40 cursor-not-allowed border-border bg-muted/30'
                          : 'border-border hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full border border-border/60 shrink-0"
                        style={{ backgroundColor: v.color_hex || '#ccc' }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-600 text-foreground truncate">{v.color_name}</p>
                        <p className={`text-[10px] ${v.quantity === 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {v.quantity === 0 ? 'Rupture' : `Stock: ${v.quantity}`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
