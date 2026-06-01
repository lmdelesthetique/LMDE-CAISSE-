'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { CartItem } from './POSTerminal';
import PriceEditModal from './PriceEditModal';

interface CartPanelProps {
  items: CartItem[];
  onUpdateQty: (id: string, qty: number) => void;
  onUpdateDiscount: (id: string, discount: number, type: 'percent' | 'amount') => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onRemove: (id: string) => void;
  subtotalHT: number;
  totalTVA: number;
  totalTTC: number;
  tvaRate?: number;
  cashierName?: string;
}

function calcItemTotal(item: CartItem): number {
  const base = item.price * item.qty;
  const disc = item.discountType === 'percent' ? base * (item.discount / 100) : item.discount;
  return Math.max(0, base - disc);
}

function CartRow({
  item,
  onUpdateQty,
  onUpdateDiscount,
  onUpdatePrice,
  onRemove,
  cashierName = 'Caisse',
}: {
  item: CartItem;
  onUpdateQty: (id: string, qty: number) => void;
  onUpdateDiscount: (id: string, discount: number, type: 'percent' | 'amount') => void;
  onUpdatePrice: (id: string, newPrice: number) => void;
  onRemove: (id: string) => void;
  cashierName?: string;
}) {
  const [showDiscount, setShowDiscount] = useState(false);
  const [discInput, setDiscInput] = useState(item.discount.toString());
  const [showPriceEdit, setShowPriceEdit] = useState(false);
  const lineTotal = calcItemTotal(item);

  const applyDiscount = () => {
    const val = parseFloat(discInput) || 0;
    onUpdateDiscount(item.id, val, item.discountType);
    setShowDiscount(false);
  };

  return (
    <>
      <div className="border-b border-border last:border-0 py-3 px-3 hover:bg-muted/20 transition-colors group">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-500 text-foreground leading-tight break-words">{item.name}</p>
              {item.isFreePrice && (
                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-700 bg-violet-100 text-violet-700 border border-violet-200">
                  Prix libre
                </span>
              )}
              {item.isReward && (
                <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-700 bg-emerald-100 text-emerald-700 border border-emerald-200">
                  🎁 Offert
                </span>
              )}
            </div>
            {item.isReward && item.originalPrice && item.originalPrice > 0 && (
              <p className="text-[10px] mt-0.5">
                <span className="line-through text-muted-foreground">{item.originalPrice.toFixed(2)} €</span>
                <span className="ml-1.5 font-700 text-emerald-600">Offert − {item.originalPrice.toFixed(2)} €</span>
              </p>
            )}
            {!item.isReward && <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{item.sku}</p>}
            {item.stock !== undefined && item.stock <= 0 && (
              <p className="text-[10px] font-600 text-amber-600 mt-0.5">⚠️ Stock insuffisant — vente autorisée</p>
            )}
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-muted-foreground">
                {item.price.toFixed(2)} € / unité
                {item.discount > 0 && (
                  <span className="ml-1.5 text-amber-600 font-600">
                    -{item.discountType === 'percent' ? `${item.discount}%` : `${item.discount.toFixed(2)}€`}
                  </span>
                )}
              </p>
              {item.costPrice !== undefined && item.costPrice > 0 && (() => {
                const sellHT = item.price / (1 + (item.tva || 0.085));
                const marginPct = ((sellHT - item.costPrice) / sellHT) * 100;
                const color = marginPct >= 50 ? 'text-emerald-600' : marginPct >= 20 ? 'text-amber-600' : 'text-red-500';
                return <span className={`text-[10px] font-600 ${color}`}>Marge {marginPct.toFixed(0)}%</span>;
              })()}
              {/* Price edit button */}
              <button
                onClick={() => setShowPriceEdit(true)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-amber-600 hover:text-amber-700 font-500 flex items-center gap-0.5"
                title="Modifier le prix"
              >
                <Icon name="PencilSquareIcon" size={11} />
                Modifier prix
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => onUpdateQty(item.id, item.qty - 1)}
              className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="MinusIcon" size={12} />
            </button>
            <span className="w-7 text-center text-sm font-600 tabular-nums">{item.qty}</span>
            <button
              onClick={() => onUpdateQty(item.id, item.qty + 1)}
              className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <Icon name="PlusIcon" size={12} />
            </button>
          </div>
          <div className="text-right shrink-0 w-20">
            <p className="text-sm font-700 tabular-nums text-foreground">{lineTotal.toFixed(2)} €</p>
          </div>
          <button
            onClick={() => onRemove(item.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500 p-0.5"
            title="Supprimer cet article"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
        {/* Discount toggle */}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => setShowDiscount((p) => !p)}
            className="text-[11px] text-primary font-500 hover:underline flex items-center gap-1"
          >
            <Icon name="TagIcon" size={11} />
            {item.discount > 0 ? 'Modifier remise' : 'Ajouter remise'}
          </button>
        </div>
        {showDiscount && (
          <div className="flex items-center gap-2 mt-2 animate-slide-up">
            <div className="flex rounded-md overflow-hidden border border-border text-xs">
              <button
                onClick={() => onUpdateDiscount(item.id, item.discount, 'percent')}
                className={`px-2 py-1 font-600 transition-colors ${item.discountType === 'percent' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
              >%</button>
              <button
                onClick={() => onUpdateDiscount(item.id, item.discount, 'amount')}
                className={`px-2 py-1 font-600 transition-colors ${item.discountType === 'amount' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
              >€</button>
            </div>
            <input
              type="number"
              value={discInput}
              onChange={(e) => setDiscInput(e.target.value)}
              className="w-20 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary/40"
              placeholder="0"
              min="0"
            />
            <button
              onClick={applyDiscount}
              className="px-2.5 py-1 bg-primary text-white text-xs font-600 rounded hover:opacity-90 active:scale-95 transition-all"
            >
              OK
            </button>
            <button
              onClick={() => { onUpdateDiscount(item.id, 0, 'percent'); setDiscInput('0'); setShowDiscount(false); }}
              className="text-xs text-muted-foreground hover:text-red-500"
            >
              Effacer
            </button>
          </div>
        )}
      </div>

      {showPriceEdit && (
        <PriceEditModal
          itemId={item.id}
          productId={item.productId}
          productName={item.name}
          currentPrice={item.price}
          cashierName={cashierName}
          onClose={() => setShowPriceEdit(false)}
          onConfirm={(id, newPrice) => {
            onUpdatePrice(id, newPrice);
            setShowPriceEdit(false);
          }}
        />
      )}
    </>
  );
}

export default function CartPanel({
  items,
  onUpdateQty,
  onUpdateDiscount,
  onUpdatePrice,
  onRemove,
  subtotalHT,
  totalTVA,
  totalTTC,
  tvaRate = 0.085,
  cashierName = 'Caisse',
}: CartPanelProps) {
  const hasDemoItems = items.some(i => i.isDemo);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Demo mode banner */}
      {hasDemoItems && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 flex items-center gap-2 shrink-0">
          <span className="text-base">🎓</span>
          <div className="min-w-0">
            <p className="text-xs font-700 text-amber-800">MODE FORMATION ACTIF</p>
            <p className="text-[10px] text-amber-700 leading-tight">Cette vente ne sera pas comptabilisée</p>
          </div>
        </div>
      )}
      {/* Cart header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-muted/20">
        <span className="text-sm font-600 text-foreground">
          Panier {items.length > 0 && <span className="text-muted-foreground font-400">({items.length} article{items.length > 1 ? 's' : ''})</span>}
        </span>
        {items.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">{items.reduce((s, i) => s + i.qty, 0)} unité{items.reduce((s, i) => s + i.qty, 0) > 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center px-4">
            <Icon name="ShoppingCartIcon" size={28} className="text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Le panier est vide</p>
            <p className="text-xs text-muted-foreground mt-1">Ajoutez un produit depuis la grille</p>
          </div>
        ) : (
          items.map((item) => (
            <CartRow
              key={item.id}
              item={item}
              onUpdateQty={onUpdateQty}
              onUpdateDiscount={onUpdateDiscount}
              onUpdatePrice={onUpdatePrice}
              onRemove={onRemove}
              cashierName={cashierName}
            />
          ))
        )}
      </div>

      {/* Totals */}
      {items.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-1.5 bg-muted/10 shrink-0">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Sous-total HT</span>
            <span className="tabular-nums">{subtotalHT.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>TVA {(tvaRate * 100).toFixed(1).replace('.0', '')}%</span>
            <span className="tabular-nums">{totalTVA.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-base font-700 text-foreground pt-1.5 border-t border-border">
            <span>Total TTC</span>
            <span className="tabular-nums">{totalTTC.toFixed(2)} €</span>
          </div>
        </div>
      )}
    </div>
  );
}