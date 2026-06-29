'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

export interface KitComponent {
  componentId: string;
  name: string;
  quantity: number;
  stock: number;
}

interface ProductRow {
  id: string;
  name: string;
  ref: string;
  stock: number;
  sell_price_ttc: number;
  is_kit?: boolean;
}

interface Props {
  kitId: string;
  kitName: string;
  kitPrice: number;
  onClose: () => void;
  onConfirm: (components: KitComponent[]) => void;
}

export default function KitCompositionModal({ kitId, kitName, kitPrice, onClose, onConfirm }: Props) {
  const [components, setComponents] = useState<KitComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [allProducts, setAllProducts] = useState<ProductRow[]>([]);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('product_kits')
        .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, ref, stock)')
        .eq('product_id', kitId);

      if (data) {
        setComponents(
          (data as any[]).map(r => ({
            componentId: r.component_id,
            name: (r.products as any)?.name ?? '',
            quantity: Number(r.quantity) || 1,
            stock: Number((r.products as any)?.stock) ?? 0,
          }))
        );
      }
      setLoading(false);
    })();
  }, [kitId]);

  const loadAllProducts = useCallback(async () => {
    if (allProducts.length > 0) return;
    const rows = await fetchAll<ProductRow>((from, to) =>
      supabase
        .from('products')
        .select('id, name, ref, stock, sell_price_ttc, is_kit')
        .eq('is_kit', false)
        .in('status', ['active', 'actif', 'rupture'])
        .range(from, to)
    );
    setAllProducts(rows);
  }, [allProducts.length]);

  useEffect(() => {
    if (!showSearch) { setSearch(''); setSearchResults([]); return; }
    loadAllProducts();
  }, [showSearch, loadAllProducts]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); return; }
    const q = search.toLowerCase();
    setSearchResults(
      allProducts
        .filter(p =>
          p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q)
        )
        .slice(0, 8)
    );
  }, [search, allProducts]);

  const updateQty = (componentId: string, delta: number) => {
    setComponents(prev =>
      prev.map(c =>
        c.componentId === componentId
          ? { ...c, quantity: Math.max(0, +(c.quantity + delta).toFixed(3)) }
          : c
      )
    );
  };

  const setQtyDirect = (componentId: string, val: string) => {
    const num = parseFloat(val);
    if (isNaN(num) || num < 0) return;
    setComponents(prev => prev.map(c => c.componentId === componentId ? { ...c, quantity: num } : c));
  };

  const removeComponent = (componentId: string) => {
    setComponents(prev => prev.filter(c => c.componentId !== componentId));
  };

  const addComponent = (product: ProductRow) => {
    const exists = components.find(c => c.componentId === product.id);
    if (exists) {
      updateQty(product.id, 1);
    } else {
      setComponents(prev => [...prev, {
        componentId: product.id,
        name: product.name,
        quantity: 1,
        stock: product.stock,
      }]);
    }
    setSearch('');
    setSearchResults([]);
    setShowSearch(false);
  };

  const activeComponents = components.filter(c => c.quantity > 0);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: '100%', maxWidth: 480,
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        maxHeight: '90vh',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#f9fafb',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                background: '#8b5cf6', color: '#fff',
                fontSize: 10, fontWeight: 700,
                padding: '2px 7px', borderRadius: 4,
              }}>KIT</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{kitName}</span>
            </div>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>
              {kitPrice.toFixed(2)} € — {activeComponents.length} composant{activeComponents.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Icon name="XMarkIcon" size={20} className="text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {loading ? (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 24, fontSize: 13 }}>Chargement des composants…</p>
          ) : (
            <>
              {components.length === 0 && (
                <p style={{ color: '#9ca3af', textAlign: 'center', padding: 16, fontSize: 13 }}>
                  Aucun composant défini pour ce kit.
                </p>
              )}

              {/* Component list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {components.map(comp => (
                  <div key={comp.componentId} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: comp.quantity === 0 ? '#f9fafb' : '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8, padding: '8px 10px',
                    opacity: comp.quantity === 0 ? 0.45 : 1,
                    transition: 'opacity 0.15s',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {comp.name}
                      </p>
                      <p style={{ fontSize: 11, color: comp.stock <= 0 ? '#ef4444' : '#6b7280', margin: '2px 0 0' }}>
                        Stock : {comp.stock}
                        {comp.stock <= 0 && ' — Rupture'}
                      </p>
                    </div>

                    {/* Qty controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      <button
                        onClick={() => updateQty(comp.componentId, -1)}
                        style={{
                          width: 26, height: 26, border: '1px solid #d1d5db',
                          borderRadius: 6, background: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Icon name="MinusIcon" size={12} className="text-muted-foreground" />
                      </button>
                      <input
                        type="number"
                        value={comp.quantity}
                        onChange={e => setQtyDirect(comp.componentId, e.target.value)}
                        style={{
                          width: 44, height: 26, textAlign: 'center',
                          border: '1px solid #d1d5db', borderRadius: 6,
                          fontSize: 13, fontWeight: 600,
                        }}
                      />
                      <button
                        onClick={() => updateQty(comp.componentId, 1)}
                        style={{
                          width: 26, height: 26, border: '1px solid #d1d5db',
                          borderRadius: 6, background: '#fff', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Icon name="PlusIcon" size={12} className="text-muted-foreground" />
                      </button>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeComponent(comp.componentId)}
                      title="Retirer de ce kit"
                      style={{
                        width: 26, height: 26, border: '1px solid #fecaca',
                        borderRadius: 6, background: '#fff', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="TrashIcon" size={13} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add product search */}
              <div style={{ marginTop: 12 }}>
                {!showSearch ? (
                  <button
                    onClick={() => setShowSearch(true)}
                    style={{
                      width: '100%', padding: '8px 0',
                      border: '1.5px dashed #d1d5db', borderRadius: 8,
                      background: 'none', cursor: 'pointer',
                      fontSize: 12, color: '#6b7280', fontWeight: 500,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <Icon name="PlusIcon" size={14} />
                    Ajouter / remplacer un produit
                  </button>
                ) : (
                  <div>
                    <div style={{ position: 'relative' }}>
                      <input
                        autoFocus
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher un produit…"
                        style={{
                          width: '100%', padding: '8px 12px',
                          border: '1px solid #d1d5db', borderRadius: 8,
                          fontSize: 13, outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <button
                        onClick={() => setShowSearch(false)}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        <Icon name="XMarkIcon" size={14} className="text-muted-foreground" />
                      </button>
                    </div>
                    {searchResults.length > 0 && (
                      <div style={{
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        marginTop: 4, overflow: 'hidden',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      }}>
                        {searchResults.map(p => (
                          <button
                            key={p.id}
                            onClick={() => addComponent(p)}
                            style={{
                              width: '100%', display: 'flex', alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '8px 12px', background: '#fff',
                              border: 'none', borderBottom: '1px solid #f3f4f6',
                              cursor: 'pointer', textAlign: 'left',
                            }}
                          >
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>{p.name}</p>
                              <p style={{ fontSize: 11, color: '#6b7280', margin: 0 }}>Stock : {p.stock}</p>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#8b5cf6' }}>
                              {p.sell_price_ttc.toFixed(2)} €
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #e5e7eb',
          display: 'flex', gap: 8,
          background: '#f9fafb',
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0',
              border: '1px solid #d1d5db', borderRadius: 8,
              background: '#fff', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#374151',
            }}
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(activeComponents)}
            style={{
              flex: 2, padding: '10px 0',
              border: 'none', borderRadius: 8,
              background: '#8b5cf6', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}
          >
            Ajouter au panier — {kitPrice.toFixed(2)} €
          </button>
        </div>
      </div>
    </div>
  );
}
