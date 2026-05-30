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

interface ProductGridProps {
  onAddToCart: (product: {
    id: string;
    name: string;
    sku: string;
    price: number;
    imageUrl?: string;
    stock: number;
    variantName?: string;
    costPrice?: number;
  }) => void;
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

export default function ProductGrid({ onAddToCart }: ProductGridProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('__all__');
  const [products, setProducts] = useState<DBProduct[]>([]);
  const [rawCategories, setRawCategories] = useState<string[]>([]);
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
    setRawCategories(cats);
    setLoading(false);
  }, []);

  const toggleFavorite = useCallback(async (product: DBProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    const newVal = !product.is_favorite;
    await supabase.from('products').update({ is_favorite: newVal }).eq('id', product.id);
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, is_favorite: newVal } : p));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useRealtimeSync({ tables: ['products', 'stock_movements'], onRefresh: loadData });

  const favCount = useMemo(() => products.filter(p => p.is_favorite).length, [products]);

  const displayedProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (activeCategory === '__fav__') {
        if (!p.is_favorite) return false;
      } else if (activeCategory !== '__all__') {
        if (p.category !== activeCategory) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.name.toLowerCase().includes(q) &&
          !(p.ref || '').toLowerCase().includes(q) &&
          !(p.barcode || '').includes(search)
        ) return false;
      }
      return true;
    });
    return [...filtered.filter(p => p.is_favorite), ...filtered.filter(p => !p.is_favorite)];
  }, [products, search, activeCategory]);

  const categoryList = useMemo(() => [
    { id: '__all__', label: 'Tous' },
    { id: '__fav__', label: `⭐ Favoris${favCount > 0 ? ` (${favCount})` : ''}` },
    ...rawCategories.map(c => ({ id: c, label: c })),
  ], [rawCategories, favCount]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: '#f9fafb' }}>

      {/* ── Search bar ── */}
      <div style={{
        background: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        padding: '8px 10px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <Icon name="MagnifyingGlassIcon" size={15} className="text-muted-foreground" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            style={{
              width: '100%',
              paddingLeft: 32,
              paddingRight: search ? 32 : 12,
              paddingTop: 7,
              paddingBottom: 7,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 13,
              outline: 'none',
              background: '#f9fafb',
              color: '#111827',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
            >
              <Icon name="XMarkIcon" size={14} className="text-muted-foreground" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFavManager(true)}
          title="Gérer les favoris"
          style={{ padding: 7, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="StarIcon" size={16} className="text-amber-500" />
        </button>
        <button
          onClick={loadData}
          title="Actualiser"
          style={{ padding: 7, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer', flexShrink: 0 }}
        >
          <Icon name="ArrowPathIcon" size={16} className="text-muted-foreground" />
        </button>
      </div>

      {/* ── Body: categories (left) + products (right) ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT: Category list — 130px fixed width */}
        <div style={{
          width: 130,
          flexShrink: 0,
          background: '#ffffff',
          borderRight: '1px solid #e5e7eb',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
          {categoryList.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '9px 10px',
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 400,
                  background: isActive ? 'hsl(var(--primary))' : 'transparent',
                  color: isActive ? 'hsl(var(--primary-foreground))' : '#374151',
                  border: 'none',
                  borderBottom: '1px solid #f3f4f6',
                  cursor: 'pointer',
                  lineHeight: 1.3,
                  wordBreak: 'break-word',
                  transition: 'background 0.1s, color 0.1s',
                }}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* RIGHT: Product grid */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 8 }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12 }}>
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Chargement des produits…</p>
            </div>
          ) : displayedProducts.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, textAlign: 'center', gap: 8 }}>
              <Icon name={activeCategory === '__fav__' ? 'StarIcon' : 'MagnifyingGlassIcon'} size={32} className="text-muted-foreground" />
              <p className="text-sm font-500 text-foreground">
                {activeCategory === '__fav__' ? 'Aucun favori configuré' : 'Aucun produit trouvé'}
              </p>
              {activeCategory === '__fav__' && (
                <p className="text-xs text-muted-foreground">Cliquez sur ⭐ pour gérer les favoris</p>
              )}
            </div>
          ) : (
            /* Fixed 100px cards — auto-fill, no stretching */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 100px)', gap: 6 }}>
              {displayedProducts.map((product) => {
                const isFav = Boolean(product.is_favorite);
                const isOutOfStock = product.stock <= 0;
                const minStock = product.min_stock || 3;
                const isLowStock = !isOutOfStock && product.stock <= minStock;

                return (
                  <button
                    key={product.id}
                    onClick={() => {
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
                    }}
                    title={product.name}
                    style={{
                      width: 100,
                      height: 120,
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      borderRadius: 8,
                      border: `1px solid ${isOutOfStock ? '#fecaca' : isLowStock ? '#fde68a' : '#e5e7eb'}`,
                      background: isOutOfStock ? '#fff5f5' : '#ffffff',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      padding: 0,
                      opacity: 1,
                      textAlign: 'left',
                      flexShrink: 0,
                      transition: 'box-shadow 0.12s, transform 0.1s',
                    }}
                    className="group hover:shadow-md active:scale-95"
                  >
                    {/* ── Image: 60px height ── */}
                    <div style={{ height: 60, flexShrink: 0, overflow: 'hidden', background: '#f3f4f6', position: 'relative' }}>
                      {product.image_url ? (
                        <AppImage
                          src={product.image_url}
                          alt={product.name}
                          width={100}
                          height={60}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="PhotoIcon" size={20} className="text-muted-foreground/40" />
                        </div>
                      )}

                      {/* Rupture badge — top right */}
                      {isOutOfStock && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2,
                          background: '#ef4444', color: '#fff',
                          fontSize: 7, fontWeight: 700,
                          padding: '1px 3px', borderRadius: 3, lineHeight: 1.4,
                        }}>
                          Rupture
                        </span>
                      )}
                      {/* Low stock badge */}
                      {isLowStock && !isOutOfStock && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2,
                          background: '#f59e0b', color: '#fff',
                          fontSize: 7, fontWeight: 700,
                          padding: '1px 3px', borderRadius: 3, lineHeight: 1.4,
                        }}>
                          {product.stock}
                        </span>
                      )}
                      {/* Kit badge */}
                      {product.is_kit && !isOutOfStock && !isLowStock && (
                        <span style={{
                          position: 'absolute', top: 2, right: 2,
                          background: '#8b5cf6', color: '#fff',
                          fontSize: 7, fontWeight: 700,
                          padding: '1px 3px', borderRadius: 3, lineHeight: 1.4,
                        }}>
                          Kit
                        </span>
                      )}

                      {/* Star (favorite) toggle — top left */}
                      <button
                        onClick={(e) => toggleFavorite(product, e)}
                        title={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                        style={{
                          position: 'absolute', top: 2, left: 2,
                          width: 16, height: 16, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: isFav ? '#f59e0b' : 'rgba(0,0,0,0.18)',
                          border: 'none', cursor: 'pointer', padding: 0,
                          flexShrink: 0,
                        }}
                      >
                        <Icon name="StarIcon" size={9} className="text-white" />
                      </button>
                    </div>

                    {/* ── Info: name + price ── */}
                    <div style={{
                      flex: 1, padding: '3px 5px 3px 5px',
                      display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between', overflow: 'hidden',
                    }}>
                      <p style={{
                        fontSize: 10, fontWeight: 600, lineHeight: 1.3,
                        margin: 0, color: '#111827',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                      } as React.CSSProperties}>
                        {product.name}
                      </p>
                      <p style={{ fontSize: 11, fontWeight: 700, margin: 0, color: 'hsl(var(--primary))', paddingTop: 2 }}>
                        {Number(product.sell_price_ttc).toFixed(2)} €
                      </p>
                    </div>

                    {/* Hover add-to-cart overlay */}
                    {(
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(var(--primary), 0.06)',
                        opacity: 0, transition: 'opacity 0.15s',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        pointerEvents: 'none',
                      }} className="group-hover:opacity-100">
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%',
                          background: 'hsl(var(--primary))',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon name="PlusIcon" size={11} className="text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Favourites Manager Modal ── */}
      {showFavManager && (
        <POSFavouritesManager
          onClose={() => { setShowFavManager(false); loadData(); }}
        />
      )}

      {/* ── Variant picker modal ── */}
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
                        v.quantity <= 0
                          ? 'border-red-200 bg-red-50/40 hover:bg-red-50'
                          : 'border-border hover:border-primary/40 hover:bg-primary/5'
                      }`}
                    >
                      <span
                        className="w-5 h-5 rounded-full border border-border/60 shrink-0"
                        style={{ backgroundColor: v.color_hex || '#ccc' }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-600 text-foreground truncate">{v.color_name}</p>
                        <p className={`text-[10px] ${v.quantity <= 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {v.quantity <= 0 ? `Rupture (${v.quantity})` : `Stock: ${v.quantity}`}
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
