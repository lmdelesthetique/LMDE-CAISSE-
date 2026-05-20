'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import POSFavouritesManager from './POSFavouritesManager';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

const supabase = createClient();

interface DBProduct {
  id: string;
  name: string;
  ref: string;
  barcode?: string;
  sell_price_ttc: number;
  stock: number;
  min_stock?: number;
  category: string;
  image_url?: string;
  status: string;
  product_status?: string;
  is_kit?: boolean;
}

interface FavouriteRow {
  product_id: string;
  sort_order: number;
}

interface ProductGridProps {
  onAddToCart: (product: { id: string; name: string; sku: string; price: number; imageUrl?: string; stock: number }) => void;
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
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFavManager, setShowFavManager] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prodsResult, favsResult] = await Promise.all([
      supabase
        .from('products')
        .select('id, name, ref, barcode, sell_price_ttc, stock, min_stock, category, image_url, status, product_status, is_kit')
        .in('status', ['active', 'rupture'])
        .order('name'),
      supabase
        .from('pos_favourites')
        .select('product_id, sort_order')
        .order('sort_order'),
    ]);

    const prods = prodsResult.data;
    const favs = favsResult.data;

    if (prods) {
      setProducts(prods as DBProduct[]);
      const cats = Array.from(new Set(prods.map((p: any) => p.category).filter(Boolean))).sort() as string[];
      setCategories([
        { id: '__all__', label: 'Tous' },
        ...cats.map((c) => ({ id: c, label: c })),
      ]);
    }
    if (favs) {
      const sorted = (favs as FavouriteRow[]).sort((a, b) => a.sort_order - b.sort_order);
      setFavouriteIds(sorted.map((f) => f.product_id));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Real-time sync: refresh products when products or stock_movements change
  useRealtimeSync({ tables: ['products', 'stock_movements'], onRefresh: loadData });

  const allFiltered = useMemo(() => {
    return products.filter((p) => {
      const matchCat = activeCategory === '__all__' || p.category === activeCategory;
      const matchSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.ref || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || '').includes(search);
      return matchCat && matchSearch;
    });
  }, [products, search, activeCategory]);

  const favouriteProducts = useMemo(() => {
    return favouriteIds
      .map((fid) => products.find((p) => p.id === fid))
      .filter((p): p is DBProduct => !!p)
      .filter((p) => {
        if (!search) return true;
        return p.name.toLowerCase().includes(search.toLowerCase()) || (p.ref || '').toLowerCase().includes(search.toLowerCase());
      });
  }, [favouriteIds, products, search]);

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
            Favoris ({favouriteIds.length})
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
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
            {displayedProducts.map((product) => {
              const isFav = favouriteIds.includes(product.id);
              const isOutOfStock = product.stock === 0;
              const minStock = product.min_stock || 3;
              const isLowStock = !isOutOfStock && product.stock <= minStock;
              const stockBadge = getStockBadge(product.stock, minStock, Boolean(product.is_kit));

              return (
                <button
                  key={product.id}
                  onClick={() => {
                    if (!isOutOfStock) {
                      onAddToCart({
                        id: product.id,
                        name: product.name,
                        sku: product.ref || product.id,
                        price: Number(product.sell_price_ttc),
                        imageUrl: product.image_url,
                        stock: product.stock,
                      });
                    }
                  }}
                  disabled={isOutOfStock}
                  title={isOutOfStock ? 'Produit en rupture de stock' : undefined}
                  className={`group relative flex flex-col rounded-xl border bg-white shadow-card text-left transition-all duration-150 overflow-hidden
                    ${isOutOfStock
                      ? 'opacity-60 cursor-not-allowed border-red-200 bg-red-50/30'
                      : isLowStock
                        ? 'hover:shadow-card-hover hover:border-amber-300 active:scale-95 border-amber-200'
                        : 'hover:shadow-card-hover hover:border-primary/30 active:scale-95'
                    }`}
                >
                  {/* Image */}
                  <div className="aspect-square w-full overflow-hidden bg-muted/30 relative">
                    {product.image_url ? (
                      <AppImage
                        src={product.image_url}
                        alt={`Photo de ${product.name}`}
                        width={120}
                        height={120}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="PhotoIcon" size={28} className="text-muted-foreground/40" />
                      </div>
                    )}
                    {isFav && (
                      <span className="absolute top-1.5 left-1.5 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
                        <Icon name="StarIcon" size={11} className="text-white" />
                      </span>
                    )}
                    {product.is_kit && (
                      <span className="absolute top-1.5 right-1.5 bg-violet-500 text-white text-[9px] font-700 px-1.5 py-0.5 rounded-full">Kit</span>
                    )}
                    {/* Out of stock overlay */}
                    {isOutOfStock && (
                      <div className="absolute inset-0 bg-red-900/20 flex items-center justify-center">
                        <span className="bg-red-600 text-white text-[10px] font-700 px-2 py-1 rounded-full shadow">Rupture</span>
                      </div>
                    )}
                  </div>

                  {/* Stock badge — always visible */}
                  {stockBadge && (
                    <span className={`absolute top-2 right-2 text-[10px] font-700 px-1.5 py-0.5 rounded-full ${stockBadge.color}`}>
                      {stockBadge.label}
                    </span>
                  )}

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-xs font-600 text-foreground leading-tight line-clamp-2">{product.name}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{product.ref}</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <p className="text-sm font-700 text-primary tabular-nums">{Number(product.sell_price_ttc).toFixed(2)} €</p>
                      {/* Stock status label */}
                      {!product.is_kit && (
                        <span className={`text-[9px] font-600 px-1.5 py-0.5 rounded-full ${
                          isOutOfStock
                            ? 'bg-red-100 text-red-700'
                            : isLowStock
                              ? 'bg-amber-100 text-amber-700' :'bg-emerald-100 text-emerald-700'
                        }`}>
                          {isOutOfStock ? 'Rupture' : isLowStock ? 'Stock faible' : 'Disponible'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Add overlay — only when in stock */}
                  {!isOutOfStock && (
                    <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shadow-lg">
                        <Icon name="PlusIcon" size={16} className="text-white" />
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
    </div>
  );
}
