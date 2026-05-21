'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

interface FavouriteProduct {
  id: string; // pos_favourites.id
  product_id: string;
  sort_order: number;
  name: string;
  ref: string;
  image_url?: string;
  sell_price_ttc: number;
  stock: number;
  category: string;
}

interface AllProduct {
  id: string;
  name: string;
  ref: string;
  image_url?: string;
  sell_price_ttc: number;
  stock: number;
  category: string;
}

interface POSFavouritesManagerProps {
  onClose: () => void;
}

export default function POSFavouritesManager({ onClose }: POSFavouritesManagerProps) {
  const [favourites, setFavourites] = useState<FavouriteProduct[]>([]);
  const [allProducts, setAllProducts] = useState<AllProduct[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [favsResult, allProds] = await Promise.all([
      supabase
        .from('pos_favourites')
        .select('id, product_id, sort_order, products(name, ref, image_url, sell_price_ttc, stock, category)')
        .order('sort_order'),
      fetchAll<AllProduct>((from, to) =>
        supabase
          .from('products')
          .select('id, name, ref, image_url, sell_price_ttc, stock, category')
          .eq('status', 'active')
          .order('name')
          .range(from, to)
      ),
    ]);

    if (favsResult.data) {
      const mapped: FavouriteProduct[] = favsResult.data.map((f: any) => ({
        id: f.id,
        product_id: f.product_id,
        sort_order: f.sort_order,
        name: f.products?.name || '',
        ref: f.products?.ref || '',
        image_url: f.products?.image_url,
        sell_price_ttc: Number(f.products?.sell_price_ttc) || 0,
        stock: Number(f.products?.stock) || 0,
        category: f.products?.category || '',
      }));
      setFavourites(mapped);
    }
    setAllProducts(allProds);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const favProductIds = new Set(favourites.map((f) => f.product_id));

  const filteredProducts = allProducts.filter(
    (p) =>
      !favProductIds.has(p.id) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) || (p.ref || '').toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = async (product: AllProduct) => {
    setSaving(product.id);
    const maxOrder = favourites.length > 0 ? Math.max(...favourites.map((f) => f.sort_order)) : 0;
    const { error } = await supabase.from('pos_favourites').insert({
      product_id: product.id,
      sort_order: maxOrder + 1,
    });
    if (!error) { showToast(`"${product.name}" ajouté aux favoris`); loadData(); }
    setSaving(null);
    setSearch('');
  };

  const handleRemove = async (fav: FavouriteProduct) => {
    setSaving(fav.id);
    await supabase.from('pos_favourites').delete().eq('id', fav.id);
    showToast(`"${fav.name}" retiré des favoris`);
    loadData();
    setSaving(null);
  };

  const moveUp = async (idx: number) => {
    if (idx === 0) return;
    const updated = [...favourites];
    const temp = updated[idx].sort_order;
    updated[idx].sort_order = updated[idx - 1].sort_order;
    updated[idx - 1].sort_order = temp;
    [updated[idx], updated[idx - 1]] = [updated[idx - 1], updated[idx]];
    setFavourites(updated);
    await Promise.all([
      supabase.from('pos_favourites').update({ sort_order: updated[idx].sort_order }).eq('id', updated[idx].id),
      supabase.from('pos_favourites').update({ sort_order: updated[idx - 1].sort_order }).eq('id', updated[idx - 1].id),
    ]);
  };

  const moveDown = async (idx: number) => {
    if (idx === favourites.length - 1) return;
    const updated = [...favourites];
    const temp = updated[idx].sort_order;
    updated[idx].sort_order = updated[idx + 1].sort_order;
    updated[idx + 1].sort_order = temp;
    [updated[idx], updated[idx + 1]] = [updated[idx + 1], updated[idx]];
    setFavourites(updated);
    await Promise.all([
      supabase.from('pos_favourites').update({ sort_order: updated[idx].sort_order }).eq('id', updated[idx].id),
      supabase.from('pos_favourites').update({ sort_order: updated[idx + 1].sort_order }).eq('id', updated[idx + 1].id),
    ]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      {toast && (
        <div className="fixed top-4 right-4 z-[200] px-4 py-3 rounded-xl shadow-lg text-sm font-500 text-white bg-emerald-500 animate-slide-up">{toast}</div>
      )}
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <Icon name="StarIcon" size={18} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">Produits favoris caisse</h2>
              <p className="text-xs text-muted-foreground">Gérez les produits affichés en priorité dans la caisse</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left: current favourites */}
          <div className="flex-1 flex flex-col border-r border-border">
            <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">
                Favoris actuels ({favourites.length})
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : favourites.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <Icon name="StarIcon" size={28} className="text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Aucun favori configuré</p>
                  <p className="text-xs text-muted-foreground mt-1">Ajoutez des produits depuis la liste à droite</p>
                </div>
              ) : (
                favourites.map((fav, idx) => (
                  <div key={fav.id} className="flex items-center gap-2.5 p-2.5 border border-border rounded-xl bg-white hover:bg-muted/10 transition-colors">
                    <span className="text-xs font-700 text-muted-foreground w-5 text-center shrink-0">{idx + 1}</span>
                    <div className="w-9 h-9 rounded-lg bg-muted/60 overflow-hidden shrink-0">
                      {fav.image_url ? (
                        <AppImage src={fav.image_url} alt={fav.name} width={36} height={36} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-500 text-foreground truncate">{fav.name}</p>
                      <p className="text-[10px] text-muted-foreground">{fav.sell_price_ttc.toFixed(2)} € · Stock: {fav.stock}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => moveUp(idx)} disabled={idx === 0}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                        <Icon name="ChevronUpIcon" size={13} />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx === favourites.length - 1}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                        <Icon name="ChevronDownIcon" size={13} />
                      </button>
                      <button onClick={() => handleRemove(fav)} disabled={saving === fav.id}
                        className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors disabled:opacity-50">
                        <Icon name="XMarkIcon" size={13} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: add products */}
          <div className="flex-1 flex flex-col">
            <div className="px-4 py-3 border-b border-border bg-muted/20 shrink-0">
              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Ajouter un produit</p>
              <div className="relative">
                <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredProducts.slice(0, 30).map((p) => (
                <button key={p.id} onClick={() => handleAdd(p)} disabled={saving === p.id}
                  className="w-full flex items-center gap-2.5 p-2.5 border border-border rounded-xl bg-white hover:bg-primary/5 hover:border-primary/30 transition-colors text-left disabled:opacity-50">
                  <div className="w-8 h-8 rounded-lg bg-muted/60 overflow-hidden shrink-0">
                    {p.image_url ? (
                      <AppImage src={p.image_url} alt={p.name} width={32} height={32} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="PhotoIcon" size={12} className="text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-500 text-foreground truncate">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.category} · {Number(p.sell_price_ttc).toFixed(2)} €</p>
                  </div>
                  <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon name="PlusIcon" size={12} className="text-primary" />
                  </div>
                </button>
              ))}
              {filteredProducts.length === 0 && !loading && (
                <div className="text-center py-8 text-xs text-muted-foreground">
                  {search ? 'Aucun produit trouvé' : 'Tous les produits actifs sont déjà en favoris'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border shrink-0 bg-muted/20 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-sm font-600 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
