'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type ProductRecord } from './mockProducts';
import { createClient } from '@/lib/supabase/client';

interface ShelfLabelProps {
  products: ProductRecord[];
  initialProduct?: ProductRecord;
  onClose: () => void;
}

interface ActivePromo {
  name: string;
  discountType: 'percent' | 'amount';
  discountValue: number;
  promoPrice: number;
  label: string;
}

type LabelSize = '100x70' | '148x105' | '210x148';
type BadgeType = 'best_seller' | 'nouveau' | 'populaire' | 'promo' | 'none';

const SIZE_LABELS: Record<LabelSize, string> = {
  '100x70': '10×7 cm — Rayon standard',
  '148x105': 'A6 — Grande étiquette',
  '210x148': 'A5 — Affiche rayon',
};

const BADGE_CONFIG: Record<BadgeType, { label: string; color: string; bg: string; emoji: string }> = {
  best_seller: { label: 'BEST SELLER', color: '#b45309', bg: '#fef3c7', emoji: '⭐' },
  populaire:   { label: 'POPULAIRE',   color: '#7c3aed', bg: '#ede9fe', emoji: '🔥' },
  nouveau:     { label: 'NOUVEAU',     color: '#065f46', bg: '#d1fae5', emoji: '✨' },
  promo:       { label: 'PROMO',       color: '#ffffff', bg: '#e11d48', emoji: '🏷️' },
  none:        { label: '',            color: '#6b7280', bg: '#f9fafb', emoji: '' },
};

function getPromoForProduct(promos: any[], product: ProductRecord, showPromo: boolean): ActivePromo | null {
  if (!showPromo) return null;
  for (const p of promos) {
    const items = Array.isArray(p.products) ? p.products : [];
    const inPromo = items.find((x: any) => x.product_id === product.id);
    if (!inPromo) continue;
    if (p.type === 'discount' && p.discount_type && p.discount_value) {
      let promoPrice = product.sellPriceTTC;
      let label = '';
      if (p.discount_type === 'percent') {
        promoPrice = product.sellPriceTTC * (1 - p.discount_value / 100);
        label = `-${p.discount_value}%`;
      } else {
        promoPrice = Math.max(0, product.sellPriceTTC - p.discount_value);
        label = `-${p.discount_value.toFixed(2)} €`;
      }
      return { name: p.name, discountType: p.discount_type, discountValue: p.discount_value, promoPrice, label };
    }
    if (p.type === 'bundle' && p.bundle_price) {
      const bundleTotal = items.reduce((s: number, x: any) => s + (x.unit_price * x.qty), 0);
      const savings = bundleTotal - p.bundle_price;
      if (savings > 0) {
        return { name: p.name, discountType: 'amount', discountValue: savings, promoPrice: p.bundle_price / items.length, label: `Pack −${savings.toFixed(2)} €` };
      }
    }
  }
  return null;
}

export default function ShelfLabelModal({ products, initialProduct, onClose }: ShelfLabelProps) {
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const [promos, setPromos] = useState<any[]>([]);
  const [sales90dMap, setSales90dMap] = useState<Record<string, number>>({});
  const [loadingData, setLoadingData] = useState(true);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    initialProduct ? new Set([initialProduct.id]) : new Set()
  );
  const [productQtys, setProductQtys] = useState<Record<string, number>>(
    initialProduct ? { [initialProduct.id]: 1 } : {}
  );
  const [search, setSearch] = useState('');

  // Global config
  const [labelSize, setLabelSize] = useState<LabelSize>('100x70');
  const [badgeType, setBadgeType] = useState<BadgeType>('none');
  const [customBadgeText, setCustomBadgeText] = useState('');
  const [showImage, setShowImage] = useState(true);
  const [showPromo, setShowPromo] = useState(true);
  const [showSalesCount, setShowSalesCount] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date().toISOString();

    Promise.all([
      supabase
        .from('promotions')
        .select('name, type, discount_type, discount_value, bundle_price, products, starts_at, ends_at')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`),
      supabase
        .from('products')
        .select('id, sales_90d'),
    ]).then(([promoRes, salesRes]) => {
      setPromos(promoRes.data || []);
      const map: Record<string, number> = {};
      for (const row of (salesRes.data || [])) {
        if (row.id) map[row.id] = Number(row.sales_90d) || 0;
      }
      setSales90dMap(map);

      // Auto-set badge from initial product if provided
      if (initialProduct) {
        const s90 = map[initialProduct.id] || 0;
        if (s90 >= 30) setBadgeType('best_seller');
        else if (s90 >= 10) setBadgeType('populaire');
      }
      setLoadingData(false);
    });
  }, [initialProduct]);

  const toggleProduct = (product: ProductRecord) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(product.id)) {
        next.delete(product.id);
      } else {
        next.add(product.id);
        setProductQtys(q => ({ ...q, [product.id]: q[product.id] ?? 1 }));
      }
      return next;
    });
  };

  const setQtyFor = (id: string, qty: number) => {
    setProductQtys(prev => ({ ...prev, [id]: Math.max(1, Math.min(20, qty)) }));
  };

  const selectedProducts = useMemo(() => {
    const order = [
      ...(initialProduct ? [initialProduct.id] : []),
      ...[...selectedIds].filter(id => id !== initialProduct?.id),
    ];
    return order
      .filter(id => selectedIds.has(id))
      .map(id => products.find(p => p.id === id))
      .filter(Boolean) as ProductRecord[];
  }, [selectedIds, products, initialProduct]);

  const filteredUnselected = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p =>
      !selectedIds.has(p.id) &&
      (!q || p.name.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q))
    );
  }, [products, selectedIds, search]);

  const filteredSelected = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return selectedProducts;
    return selectedProducts.filter(p =>
      p.name.toLowerCase().includes(q) || (p.ref || '').toLowerCase().includes(q)
    );
  }, [selectedProducts, search]);

  const previewProduct = selectedProducts[0] ?? null;
  const previewPromo = previewProduct ? getPromoForProduct(promos, previewProduct, showPromo) : null;
  const previewSales90d = previewProduct ? (sales90dMap[previewProduct.id] || 0) : 0;

  const badgeLabel = badgeType === 'none' ? '' : (customBadgeText || BADGE_CONFIG[badgeType].label);
  const fmtPrice = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const generateLabelHTML = useCallback((product: ProductRecord, promo: ActivePromo | null, sales90d: number, wMm: number, hMm: number, fontSize: number) => {
    const showBadge = badgeType !== 'none' && badgeLabel;
    const badgeCfg = BADGE_CONFIG[badgeType];

    return `
<div class="label" style="width:${wMm}mm;height:${hMm}mm">
  <div class="banner">
    <span class="brand">Le Monde de l'Esthétique</span>
    ${showBadge ? `<span class="badge" style="background:${badgeCfg.bg};color:${badgeCfg.color}">${badgeCfg.emoji} ${esc(badgeLabel)}</span>` : ''}
    ${promo ? `<span class="promo-tag">PROMO ${esc(promo.label)}</span>` : ''}
  </div>
  <div class="body">
    ${showImage && product.imageUrl ? `<div class="img-wrap"><img src="${product.imageUrl}" alt="" /></div>` : ''}
    <div class="info">
      <p class="product-name">${esc(product.name)}</p>
      ${product.category ? `<p class="meta">${esc(product.category)}</p>` : ''}
      ${product.ref ? `<p class="ref">Réf. ${esc(product.ref)}</p>` : ''}
      <div class="price-block">
        ${promo ? `
        <div class="old-price">${fmtPrice(product.sellPriceTTC)} €</div>
        <div class="new-price">${fmtPrice(promo.promoPrice)} €</div>
        <div class="savings">Économisez ${esc(promo.label)}</div>
        ` : `
        <div class="normal-price">${fmtPrice(product.sellPriceTTC)} €</div>
        `}
      </div>
      ${showSalesCount && sales90d > 0 ? `<p class="sold-count">⭐ ${sales90d} déjà vendu${sales90d > 1 ? 's' : ''} (90j)</p>` : ''}
    </div>
  </div>
  <div class="footer">
    <span>LMDE · lmdecaisse.com</span>
    <span>Prix TTC</span>
  </div>
</div>`;
  }, [badgeType, badgeLabel, showImage, showSalesCount, fmtPrice]);

  const generateHTML = useCallback(() => {
    const [wMm, hMm] = labelSize.split('x').map(Number);
    const fontSize = wMm >= 148 ? 1.3 : 1;

    const allLabelHTML = selectedProducts.flatMap(product => {
      const promo = getPromoForProduct(promos, product, showPromo);
      const sales90d = sales90dMap[product.id] || 0;
      const qty = productQtys[product.id] || 1;
      return Array(qty).fill(null).map(() => generateLabelHTML(product, promo, sales90d, wMm, hMm, fontSize));
    });

    const totalLabels = allLabelHTML.length;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Étiquettes Rayon — ${totalLabels} étiquette${totalLabels > 1 ? 's' : ''}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: white; }
@page { size: A4; margin: 0; }
.page { display: flex; flex-wrap: wrap; gap: 4mm; padding: 8mm; align-content: flex-start; }
.label {
  background: white; border: 1.5px solid #e5e7eb; border-radius: 4mm;
  overflow: hidden; display: flex; flex-direction: column; flex-shrink: 0;
  page-break-inside: avoid; box-shadow: 0 0 0 0.5mm #f0f0f0;
}
.banner {
  background: linear-gradient(135deg, #f43f5e, #fb7185);
  padding: ${2 * fontSize}mm ${3 * fontSize}mm;
  display: flex; align-items: center; justify-content: space-between;
  gap: 2mm; min-height: ${8 * fontSize}mm;
}
.brand { color: white; font-size: ${5 * fontSize}pt; font-weight: 700; letter-spacing: 0.3pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: ${5.5 * fontSize}pt; font-weight: 800; padding: ${0.8 * fontSize}mm ${2 * fontSize}mm; border-radius: 2mm; white-space: nowrap; letter-spacing: 0.3pt; }
.promo-tag { background: #ffffff; color: #e11d48; font-size: ${5.5 * fontSize}pt; font-weight: 800; padding: ${0.8 * fontSize}mm ${2 * fontSize}mm; border-radius: 2mm; white-space: nowrap; }
.body { flex: 1; display: flex; gap: ${3 * fontSize}mm; padding: ${3 * fontSize}mm; align-items: center; }
.img-wrap { width: ${18 * fontSize}mm; height: ${18 * fontSize}mm; border-radius: 2mm; overflow: hidden; flex-shrink: 0; background: #f9fafb; border: 0.5mm solid #e5e7eb; display: flex; align-items: center; justify-content: center; }
.img-wrap img { width: 100%; height: 100%; object-fit: cover; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: ${1.5 * fontSize}mm; }
.product-name { font-size: ${7 * fontSize}pt; font-weight: 700; color: #111827; line-height: 1.3; max-height: ${14 * fontSize}mm; overflow: hidden; }
.meta { font-size: ${5 * fontSize}pt; color: #6b7280; font-weight: 500; }
.ref { font-size: ${4.5 * fontSize}pt; color: #9ca3af; font-family: 'Courier New', monospace; }
.price-block { margin-top: ${1 * fontSize}mm; }
.normal-price { font-size: ${16 * fontSize}pt; font-weight: 900; color: #111827; letter-spacing: -0.5pt; line-height: 1; }
.old-price { font-size: ${8 * fontSize}pt; font-weight: 400; color: #9ca3af; text-decoration: line-through; line-height: 1.2; }
.new-price { font-size: ${18 * fontSize}pt; font-weight: 900; color: #e11d48; letter-spacing: -0.5pt; line-height: 1; }
.savings { font-size: ${5 * fontSize}pt; font-weight: 700; color: #e11d48; background: #ffe4e6; display: inline-block; padding: ${0.5 * fontSize}mm ${1.5 * fontSize}mm; border-radius: 1mm; margin-top: ${0.5 * fontSize}mm; }
.sold-count { font-size: ${5.5 * fontSize}pt; font-weight: 700; color: #d97706; background: #fef3c7; display: inline-block; padding: ${0.8 * fontSize}mm ${2 * fontSize}mm; border-radius: 2mm; }
.footer { border-top: 0.5mm solid #f3f4f6; padding: ${1.5 * fontSize}mm ${3 * fontSize}mm; display: flex; justify-content: space-between; align-items: center; }
.footer span { font-size: ${4 * fontSize}pt; color: #9ca3af; }
@media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } body { margin: 0; } }
</style>
</head>
<body>
<div class="page">
${allLabelHTML.join('')}
</div>
<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 200); });</script>
</body>
</html>`;
  }, [selectedProducts, productQtys, labelSize, promos, showPromo, sales90dMap, generateLabelHTML]);

  const handlePrint = useCallback(async () => {
    if (selectedProducts.length === 0) return;
    setIsPrinting(true);
    const html = generateHTML();
    const iframe = printFrameRef.current;
    if (!iframe) { setIsPrinting(false); return; }
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { setIsPrinting(false); return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => setIsPrinting(false), 1200);
  }, [generateHTML, selectedProducts]);

  // ─── Live preview (scaled) ─────────────────────────────────────────────────
  const [wMm, hMm] = labelSize.split('x').map(Number);
  const PREVIEW_W = 300;
  const scale = PREVIEW_W / wMm;
  const PREVIEW_H = hMm * scale;

  const showBadge = badgeType !== 'none' && badgeLabel;
  const badgeCfg = BADGE_CONFIG[badgeType];

  const totalLabels = selectedProducts.reduce((s, p) => s + (productQtys[p.id] || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[93vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-lg">🏷️</div>
            <div>
              <h2 className="font-700 text-foreground">Étiquettes Rayon</h2>
              <p className="text-xs text-muted-foreground">
                {selectedIds.size === 0 ? 'Sélectionne les produits à imprimer' : `${selectedIds.size} produit${selectedIds.size > 1 ? 's' : ''} · ${totalLabels} étiquette${totalLabels > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <Icon name="XMarkIcon" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Column 1: Product selector */}
          <div className="w-56 border-r border-border flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 border-b border-border shrink-0">
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Selected products */}
              {filteredSelected.map(product => (
                <div key={product.id} className="border-b border-border/50 last:border-0">
                  <div className="flex items-center gap-1.5 px-2.5 py-2 bg-primary/5">
                    <button
                      onClick={() => toggleProduct(product)}
                      className="w-4 h-4 rounded border-2 border-primary bg-primary flex items-center justify-center shrink-0"
                    >
                      <Icon name="CheckIcon" size={10} className="text-white" />
                    </button>
                    <span className="text-xs font-600 text-foreground truncate flex-1">{product.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/5">
                    <span className="text-[10px] text-muted-foreground flex-1">Quantité :</span>
                    <button onClick={() => setQtyFor(product.id, (productQtys[product.id] || 1) - 1)} className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs font-700 hover:bg-muted">−</button>
                    <span className="w-6 text-center text-xs font-700">{productQtys[product.id] || 1}</span>
                    <button onClick={() => setQtyFor(product.id, (productQtys[product.id] || 1) + 1)} className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs font-700 hover:bg-muted">+</button>
                  </div>
                </div>
              ))}

              {/* Divider when both selected and unselected visible */}
              {filteredSelected.length > 0 && filteredUnselected.length > 0 && (
                <div className="px-2.5 py-1.5 bg-muted/50">
                  <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Ajouter</p>
                </div>
              )}

              {/* Unselected products */}
              {filteredUnselected.map(product => (
                <button
                  key={product.id}
                  onClick={() => toggleProduct(product)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-muted border-b border-border/30 last:border-0 text-left"
                >
                  <div className="w-4 h-4 rounded border-2 border-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground truncate">{product.name}</p>
                    {product.ref && <p className="text-[10px] text-muted-foreground">{product.ref}</p>}
                  </div>
                </button>
              ))}

              {filteredSelected.length === 0 && filteredUnselected.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">Aucun résultat</p>
              )}
            </div>
          </div>

          {/* Column 2: Config */}
          <div className="w-52 border-r border-border flex flex-col overflow-y-auto p-4 gap-4 shrink-0">

            {/* Size */}
            <div>
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Format</p>
              <div className="space-y-1">
                {(Object.entries(SIZE_LABELS) as [LabelSize, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setLabelSize(k)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-xs font-500 transition-colors ${
                      labelSize === k ? 'border-primary bg-primary/5 text-primary font-700' : 'border-border hover:bg-muted text-foreground'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Badge */}
            <div>
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Badge marketing</p>
              <div className="space-y-1">
                {(Object.entries(BADGE_CONFIG) as [BadgeType, typeof BADGE_CONFIG[BadgeType]][]).map(([k, cfg]) => (
                  <button
                    key={k}
                    onClick={() => setBadgeType(k)}
                    className={`w-full text-left flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-500 transition-colors ${
                      badgeType === k ? 'border-primary bg-primary/5 text-primary font-700' : 'border-border hover:bg-muted text-foreground'
                    }`}
                  >
                    {k === 'none' ? (
                      <span className="text-muted-foreground">Aucun badge</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-800" style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {badgeType !== 'none' && (
                <input
                  type="text"
                  placeholder={`Personnaliser (défaut: ${BADGE_CONFIG[badgeType].label})`}
                  value={customBadgeText}
                  onChange={e => setCustomBadgeText(e.target.value)}
                  className="mt-2 w-full border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              )}
            </div>

            {/* Options */}
            <div>
              <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Options</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showImage} onChange={e => setShowImage(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                  <span className="text-xs">Afficher la photo</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showSalesCount} onChange={e => setShowSalesCount(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                  <span className="text-xs">Afficher ventes (90j)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={showPromo} onChange={e => setShowPromo(e.target.checked)} className="accent-primary w-3.5 h-3.5" />
                  <span className="text-xs">Afficher promos actives</span>
                </label>
              </div>
            </div>
          </div>

          {/* Column 3: Preview */}
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 p-6 overflow-auto gap-4">
            {!previewProduct ? (
              <div className="text-center">
                <p className="text-2xl mb-2">🏷️</p>
                <p className="text-sm font-600 text-muted-foreground">Sélectionne des produits à gauche</p>
                <p className="text-xs text-muted-foreground mt-1">Les étiquettes s'imprimeront sur la même page</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground font-500 uppercase tracking-wide">
                  Aperçu · {previewProduct.name} · {labelSize.replace('x', '×')} mm
                  {selectedIds.size > 1 && <span className="ml-2 text-primary font-700">+{selectedIds.size - 1} autre{selectedIds.size > 2 ? 's' : ''}</span>}
                </p>

                {loadingData ? (
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : (
                  <div
                    style={{
                      width: PREVIEW_W,
                      height: PREVIEW_H,
                      background: 'white',
                      borderRadius: 4 * scale,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                      border: '1px solid #e5e7eb',
                    }}
                  >
                    {/* Banner */}
                    <div style={{
                      background: 'linear-gradient(135deg, #f43f5e, #fb7185)',
                      padding: `${2 * scale}px ${3 * scale}px`,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 2 * scale, minHeight: 8 * scale,
                    }}>
                      <span style={{ color: 'white', fontSize: 5 * scale, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Le Monde de l'Esthétique
                      </span>
                      <div style={{ display: 'flex', gap: scale, alignItems: 'center', flexShrink: 0 }}>
                        {showBadge && (
                          <span style={{ background: badgeCfg.bg, color: badgeCfg.color, fontSize: 5.5 * scale, fontWeight: 800, padding: `${0.8 * scale}px ${2 * scale}px`, borderRadius: 2 * scale, whiteSpace: 'nowrap' }}>
                            {badgeCfg.emoji} {badgeLabel}
                          </span>
                        )}
                        {previewPromo && (
                          <span style={{ background: 'white', color: '#e11d48', fontSize: 5.5 * scale, fontWeight: 800, padding: `${0.8 * scale}px ${2 * scale}px`, borderRadius: 2 * scale, whiteSpace: 'nowrap' }}>
                            PROMO {previewPromo.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ flex: 1, display: 'flex', gap: 3 * scale, padding: 3 * scale, alignItems: 'center', overflow: 'hidden' }}>
                      {showImage && previewProduct.imageUrl && (
                        <div style={{ width: 18 * scale, height: 18 * scale, flexShrink: 0, borderRadius: 2 * scale, overflow: 'hidden', background: '#f9fafb', border: '0.5px solid #e5e7eb' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewProduct.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 * scale, overflow: 'hidden' }}>
                        <p style={{ fontSize: 7 * scale, fontWeight: 700, color: '#111827', lineHeight: 1.3, overflow: 'hidden' }}>{previewProduct.name}</p>
                        {previewProduct.category && <p style={{ fontSize: 5 * scale, color: '#6b7280', fontWeight: 500 }}>{previewProduct.category}</p>}
                        {previewProduct.ref && <p style={{ fontSize: 4.5 * scale, color: '#9ca3af', fontFamily: 'monospace' }}>Réf. {previewProduct.ref}</p>}
                        <div style={{ marginTop: scale }}>
                          {previewPromo ? (
                            <>
                              <p style={{ fontSize: 8 * scale, color: '#9ca3af', textDecoration: 'line-through', lineHeight: 1.2 }}>{fmtPrice(previewProduct.sellPriceTTC)} €</p>
                              <p style={{ fontSize: 18 * scale, fontWeight: 900, color: '#e11d48', letterSpacing: -0.5, lineHeight: 1 }}>{fmtPrice(previewPromo.promoPrice)} €</p>
                            </>
                          ) : (
                            <p style={{ fontSize: 16 * scale, fontWeight: 900, color: '#111827', letterSpacing: -0.5, lineHeight: 1 }}>{fmtPrice(previewProduct.sellPriceTTC)} €</p>
                          )}
                        </div>
                        {showSalesCount && previewSales90d > 0 && (
                          <span style={{ display: 'inline-block', fontSize: 5.5 * scale, fontWeight: 700, color: '#d97706', background: '#fef3c7', padding: `${0.8 * scale}px ${2 * scale}px`, borderRadius: 2 * scale }}>
                            ⭐ {previewSales90d} déjà vendu{previewSales90d > 1 ? 's' : ''} (90j)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div style={{ borderTop: '0.5px solid #f3f4f6', padding: `${1.5 * scale}px ${3 * scale}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 4 * scale, color: '#9ca3af' }}>LMDE · lmdecaisse.com</span>
                      <span style={{ fontSize: 4 * scale, color: '#9ca3af' }}>Prix TTC</span>
                    </div>
                  </div>
                )}

                {previewPromo && showPromo && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-600">
                    <span>🏷️</span>
                    <span>Promo : {previewPromo.name} · {previewPromo.label}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            {selectedIds.size === 0
              ? 'Aucun produit sélectionné'
              : `${selectedIds.size} produit${selectedIds.size > 1 ? 's' : ''} · ${totalLabels} étiquette${totalLabels > 1 ? 's' : ''} · Format ${labelSize.replace('x', '×')} mm`
            }
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
              Fermer
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting || selectedIds.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {isPrinting ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Génération...</>
              ) : (
                <><Icon name="PrinterIcon" size={15} />Imprimer {totalLabels > 0 ? `${totalLabels} ` : ''}étiquette{totalLabels > 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>

      <iframe ref={printFrameRef} className="hidden" title="shelf-label-print" />
    </div>
  );
}

function esc(str: string): string {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
