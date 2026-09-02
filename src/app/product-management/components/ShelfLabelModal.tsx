'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type ProductRecord } from './mockProducts';
import { createClient } from '@/lib/supabase/client';

interface ShelfLabelProps {
  product: ProductRecord;
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

export default function ShelfLabelModal({ product, onClose }: ShelfLabelProps) {
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const [sales90d, setSales90d] = useState(0);
  const [promo, setPromo] = useState<ActivePromo | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  // Config
  const [labelSize, setLabelSize] = useState<LabelSize>('100x70');
  const [badgeType, setBadgeType] = useState<BadgeType>('none');
  const [customBadgeText, setCustomBadgeText] = useState('');
  const [showSalesCount, setShowSalesCount] = useState(true);
  const [showPromo, setShowPromo] = useState(true);
  const [showImage, setShowImage] = useState(true);
  const [qty, setQty] = useState(1);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const now = new Date().toISOString();

    Promise.all([
      // Fetch sales_90d from products table
      supabase
        .from('products')
        .select('sales_90d')
        .eq('id', product.id)
        .single(),
      // Fetch active promotions for this product
      supabase
        .from('promotions')
        .select('name, type, discount_type, discount_value, bundle_price, products, starts_at, ends_at')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gte.${now}`),
    ]).then(([salesRes, promoRes]) => {
      const s90 = Number(salesRes.data?.sales_90d) || 0;
      setSales90d(s90);

      // Auto-set badge based on sales
      if (s90 >= 30) setBadgeType('best_seller');
      else if (s90 >= 10) setBadgeType('populaire');

      // Find active promo for this product
      const promos = promoRes.data || [];
      for (const p of promos) {
        const products = Array.isArray(p.products) ? p.products : [];
        const inPromo = products.find((x: any) => x.product_id === product.id);
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
          setPromo({ name: p.name, discountType: p.discount_type, discountValue: p.discount_value, promoPrice, label });
          break;
        }
        if (p.type === 'bundle' && p.bundle_price) {
          const bundleTotal = products.reduce((s: number, x: any) => s + (x.unit_price * x.qty), 0);
          const savings = bundleTotal - p.bundle_price;
          if (savings > 0) {
            setPromo({ name: p.name, discountType: 'amount', discountValue: savings, promoPrice: p.bundle_price / products.length, label: `Pack −${savings.toFixed(2)} €` });
            break;
          }
        }
      }
      setLoadingData(false);
    });
  }, [product.id, product.sellPriceTTC]);

  const badgeLabel = badgeType === 'none' ? '' : (customBadgeText || BADGE_CONFIG[badgeType].label);
  const effectivePromo = showPromo ? promo : null;

  const fmtPrice = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ─── Generate label HTML for print ───────────────────────────────────────────
  const generateHTML = useCallback(() => {
    const [wMm, hMm] = labelSize.split('x').map(Number);

    const badgeCfg = BADGE_CONFIG[badgeType];
    const showBadge = badgeType !== 'none' && badgeLabel;

    const labelHTML = `
<div class="label" style="width:${wMm}mm;height:${hMm}mm">
  <!-- Top banner: brand + badge -->
  <div class="banner">
    <span class="brand">Le Monde de l'Esthétique</span>
    ${showBadge ? `<span class="badge" style="background:${badgeCfg.bg};color:${badgeCfg.color}">${badgeCfg.emoji} ${badgeLabel}</span>` : ''}
    ${effectivePromo ? `<span class="promo-tag">PROMO ${effectivePromo.label}</span>` : ''}
  </div>

  <!-- Body -->
  <div class="body">
    ${showImage && product.imageUrl ? `<div class="img-wrap"><img src="${product.imageUrl}" alt="" /></div>` : ''}
    <div class="info">
      <p class="product-name">${esc(product.name)}</p>
      ${product.category ? `<p class="meta">${esc(product.category)}</p>` : ''}
      ${product.ref ? `<p class="ref">Réf. ${esc(product.ref)}</p>` : ''}

      <!-- Price block -->
      <div class="price-block">
        ${effectivePromo ? `
        <div class="old-price">${fmtPrice(product.sellPriceTTC)} €</div>
        <div class="new-price">${fmtPrice(effectivePromo.promoPrice)} €</div>
        <div class="savings">Économisez ${effectivePromo.label}</div>
        ` : `
        <div class="normal-price">${fmtPrice(product.sellPriceTTC)} €</div>
        `}
      </div>

      ${showSalesCount && sales90d > 0 ? `<p class="sold-count">⭐ ${sales90d} déjà vendu${sales90d > 1 ? 's' : ''} (90j)</p>` : ''}
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <span>LMDE · lmdecaisse.com</span>
    <span>Prix TTC</span>
  </div>
</div>`;

    const gridCSS = qty > 1 ? `
.page { display: flex; flex-wrap: wrap; gap: 4mm; padding: 8mm; align-content: flex-start; }
` : `
.page { display: flex; align-items: flex-start; justify-content: flex-start; padding: 10mm; }
`;

    const fontSize = wMm >= 148 ? 1.3 : 1;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Étiquette Rayon — ${esc(product.name)}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background: white; }
@page { size: A4; margin: 0; }
${gridCSS}
.label {
  background: white;
  border: 1.5px solid #e5e7eb;
  border-radius: 4mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  page-break-inside: avoid;
  box-shadow: 0 0 0 0.5mm #f0f0f0;
}
.banner {
  background: linear-gradient(135deg, #f43f5e, #fb7185);
  padding: ${2 * fontSize}mm ${3 * fontSize}mm;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2mm;
  min-height: ${8 * fontSize}mm;
}
.brand {
  color: white;
  font-size: ${5 * fontSize}pt;
  font-weight: 700;
  letter-spacing: 0.3pt;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.badge {
  font-size: ${5.5 * fontSize}pt;
  font-weight: 800;
  padding: ${0.8 * fontSize}mm ${2 * fontSize}mm;
  border-radius: 2mm;
  white-space: nowrap;
  letter-spacing: 0.3pt;
}
.promo-tag {
  background: #ffffff;
  color: #e11d48;
  font-size: ${5.5 * fontSize}pt;
  font-weight: 800;
  padding: ${0.8 * fontSize}mm ${2 * fontSize}mm;
  border-radius: 2mm;
  white-space: nowrap;
}
.body {
  flex: 1;
  display: flex;
  gap: ${3 * fontSize}mm;
  padding: ${3 * fontSize}mm;
  align-items: center;
}
.img-wrap {
  width: ${18 * fontSize}mm;
  height: ${18 * fontSize}mm;
  border-radius: 2mm;
  overflow: hidden;
  flex-shrink: 0;
  background: #f9fafb;
  border: 0.5mm solid #e5e7eb;
  display: flex; align-items: center; justify-content: center;
}
.img-wrap img { width: 100%; height: 100%; object-fit: cover; }
.info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: ${1.5 * fontSize}mm; }
.product-name {
  font-size: ${7 * fontSize}pt;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
  max-height: ${14 * fontSize}mm;
  overflow: hidden;
}
.meta {
  font-size: ${5 * fontSize}pt;
  color: #6b7280;
  font-weight: 500;
}
.ref {
  font-size: ${4.5 * fontSize}pt;
  color: #9ca3af;
  font-family: 'Courier New', monospace;
}
.price-block { margin-top: ${1 * fontSize}mm; }
.normal-price {
  font-size: ${16 * fontSize}pt;
  font-weight: 900;
  color: #111827;
  letter-spacing: -0.5pt;
  line-height: 1;
}
.old-price {
  font-size: ${8 * fontSize}pt;
  font-weight: 400;
  color: #9ca3af;
  text-decoration: line-through;
  line-height: 1.2;
}
.new-price {
  font-size: ${18 * fontSize}pt;
  font-weight: 900;
  color: #e11d48;
  letter-spacing: -0.5pt;
  line-height: 1;
}
.savings {
  font-size: ${5 * fontSize}pt;
  font-weight: 700;
  color: #e11d48;
  background: #ffe4e6;
  display: inline-block;
  padding: ${0.5 * fontSize}mm ${1.5 * fontSize}mm;
  border-radius: 1mm;
  margin-top: ${0.5 * fontSize}mm;
}
.sold-count {
  font-size: ${5.5 * fontSize}pt;
  font-weight: 700;
  color: #d97706;
  background: #fef3c7;
  display: inline-block;
  padding: ${0.8 * fontSize}mm ${2 * fontSize}mm;
  border-radius: 2mm;
}
.footer {
  border-top: 0.5mm solid #f3f4f6;
  padding: ${1.5 * fontSize}mm ${3 * fontSize}mm;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.footer span { font-size: ${4 * fontSize}pt; color: #9ca3af; }
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { margin: 0; }
}
</style>
</head>
<body>
<div class="page">
${Array(qty).fill(labelHTML).join('')}
</div>
<script>window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 200); });</script>
</body>
</html>`;
  }, [labelSize, badgeType, badgeLabel, effectivePromo, showSalesCount, sales90d, showImage, qty, product]);

  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    const html = generateHTML();
    const iframe = printFrameRef.current;
    if (!iframe) { setIsPrinting(false); return; }
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) { setIsPrinting(false); return; }
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => setIsPrinting(false), 1200);
  }, [generateHTML]);

  // ─── Live preview (scaled) ─────────────────────────────────────────────────
  const [wMm, hMm] = labelSize.split('x').map(Number);
  const PREVIEW_W = 340;
  const scale = PREVIEW_W / wMm;
  const PREVIEW_H = hMm * scale;

  const showBadge = badgeType !== 'none' && badgeLabel;
  const badgeCfg = BADGE_CONFIG[badgeType];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-lg">🏷️</div>
            <div>
              <h2 className="font-700 text-foreground">Étiquette Rayon</h2>
              <p className="text-xs text-muted-foreground truncate max-w-xs">{product.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <Icon name="XMarkIcon" size={18} className="text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* Left: config */}
          <div className="w-80 border-r border-border flex flex-col overflow-y-auto p-5 gap-5 shrink-0">

            {/* Size */}
            <div>
              <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Format</p>
              <div className="space-y-1.5">
                {(Object.entries(SIZE_LABELS) as [LabelSize, string][]).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setLabelSize(k)}
                    className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-500 transition-colors ${
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
              <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Badge marketing</p>
              <div className="space-y-1.5">
                {(Object.entries(BADGE_CONFIG) as [BadgeType, typeof BADGE_CONFIG[BadgeType]][]).map(([k, cfg]) => (
                  <button
                    key={k}
                    onClick={() => setBadgeType(k)}
                    className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-500 transition-colors ${
                      badgeType === k ? 'border-primary bg-primary/5 text-primary font-700' : 'border-border hover:bg-muted text-foreground'
                    }`}
                  >
                    {k === 'none' ? (
                      <span className="text-muted-foreground">Aucun badge</span>
                    ) : (
                      <>
                        <span
                          className="px-2 py-0.5 rounded text-[10px] font-800"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.emoji} {cfg.label}
                        </span>
                        {k === 'best_seller' && sales90d > 0 && (
                          <span className="text-muted-foreground text-[10px]">({sales90d} ventes/90j)</span>
                        )}
                      </>
                    )}
                  </button>
                ))}
              </div>
              {badgeType !== 'none' && (
                <div className="mt-2">
                  <input
                    type="text"
                    placeholder={`Texte personnalisé (défaut: ${BADGE_CONFIG[badgeType].label})`}
                    value={customBadgeText}
                    onChange={e => setCustomBadgeText(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              )}
            </div>

            {/* Options */}
            <div>
              <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Options</p>
              <div className="space-y-2">
                {product.imageUrl && (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={showImage} onChange={e => setShowImage(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-sm">Afficher la photo</span>
                  </label>
                )}
                {sales90d > 0 && (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={showSalesCount} onChange={e => setShowSalesCount(e.target.checked)} className="accent-primary w-4 h-4" />
                    <span className="text-sm">Afficher ventes ({sales90d} en 90j)</span>
                  </label>
                )}
                {promo && (
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" checked={showPromo} onChange={e => setShowPromo(e.target.checked)} className="accent-primary w-4 h-4" />
                    <div>
                      <span className="text-sm">Afficher promo</span>
                      <p className="text-[10px] text-rose-600 font-600">{promo.name} · {promo.label}</p>
                    </div>
                  </label>
                )}
                {!promo && !loadingData && (
                  <p className="text-[11px] text-muted-foreground italic">Aucune promotion active</p>
                )}
              </div>
            </div>

            {/* Qty */}
            <div>
              <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Quantité à imprimer</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center font-700 hover:bg-muted">−</button>
                <input
                  type="number" min={1} max={40} value={qty}
                  onChange={e => setQty(Math.max(1, Math.min(40, parseInt(e.target.value) || 1)))}
                  className="w-14 text-center border border-border rounded-lg py-1.5 text-sm font-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button onClick={() => setQty(q => Math.min(40, q + 1))} className="w-8 h-8 rounded-lg border border-border flex items-center justify-center font-700 hover:bg-muted">+</button>
              </div>
            </div>
          </div>

          {/* Right: live preview */}
          <div className="flex-1 flex flex-col items-center justify-center bg-gray-100 p-6 overflow-auto gap-4">
            <p className="text-xs text-muted-foreground font-500 uppercase tracking-wide">Aperçu · {labelSize.replace('x', '×')} mm</p>

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
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2 * scale,
                  minHeight: 8 * scale,
                }}>
                  <span style={{ color: 'white', fontSize: 5 * scale, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Le Monde de l'Esthétique
                  </span>
                  <div style={{ display: 'flex', gap: scale, alignItems: 'center', flexShrink: 0 }}>
                    {showBadge && (
                      <span style={{
                        background: badgeCfg.bg, color: badgeCfg.color,
                        fontSize: 5.5 * scale, fontWeight: 800,
                        padding: `${0.8 * scale}px ${2 * scale}px`,
                        borderRadius: 2 * scale, whiteSpace: 'nowrap',
                      }}>
                        {badgeCfg.emoji} {badgeLabel}
                      </span>
                    )}
                    {effectivePromo && (
                      <span style={{
                        background: 'white', color: '#e11d48',
                        fontSize: 5.5 * scale, fontWeight: 800,
                        padding: `${0.8 * scale}px ${2 * scale}px`,
                        borderRadius: 2 * scale, whiteSpace: 'nowrap',
                      }}>
                        PROMO {effectivePromo.label}
                      </span>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, display: 'flex', gap: 3 * scale, padding: 3 * scale, alignItems: 'center', overflow: 'hidden' }}>
                  {showImage && product.imageUrl && (
                    <div style={{
                      width: 18 * scale, height: 18 * scale, flexShrink: 0,
                      borderRadius: 2 * scale, overflow: 'hidden',
                      background: '#f9fafb', border: '0.5px solid #e5e7eb',
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={product.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 * scale, overflow: 'hidden' }}>
                    <p style={{ fontSize: 7 * scale, fontWeight: 700, color: '#111827', lineHeight: 1.3, overflow: 'hidden' }}>
                      {product.name}
                    </p>
                    {product.category && (
                      <p style={{ fontSize: 5 * scale, color: '#6b7280', fontWeight: 500 }}>{product.category}</p>
                    )}
                    {product.ref && (
                      <p style={{ fontSize: 4.5 * scale, color: '#9ca3af', fontFamily: 'monospace' }}>Réf. {product.ref}</p>
                    )}

                    {/* Price */}
                    <div style={{ marginTop: scale }}>
                      {effectivePromo ? (
                        <>
                          <p style={{ fontSize: 8 * scale, color: '#9ca3af', textDecoration: 'line-through', lineHeight: 1.2 }}>
                            {fmtPrice(product.sellPriceTTC)} €
                          </p>
                          <p style={{ fontSize: 18 * scale, fontWeight: 900, color: '#e11d48', letterSpacing: -0.5, lineHeight: 1 }}>
                            {fmtPrice(effectivePromo.promoPrice)} €
                          </p>
                          <span style={{
                            display: 'inline-block', marginTop: 0.5 * scale,
                            fontSize: 5 * scale, fontWeight: 700, color: '#e11d48',
                            background: '#ffe4e6',
                            padding: `${0.5 * scale}px ${1.5 * scale}px`,
                            borderRadius: scale,
                          }}>
                            Économisez {effectivePromo.label}
                          </span>
                        </>
                      ) : (
                        <p style={{ fontSize: 16 * scale, fontWeight: 900, color: '#111827', letterSpacing: -0.5, lineHeight: 1 }}>
                          {fmtPrice(product.sellPriceTTC)} €
                        </p>
                      )}
                    </div>

                    {showSalesCount && sales90d > 0 && (
                      <span style={{
                        display: 'inline-block',
                        fontSize: 5.5 * scale, fontWeight: 700, color: '#d97706',
                        background: '#fef3c7',
                        padding: `${0.8 * scale}px ${2 * scale}px`,
                        borderRadius: 2 * scale,
                      }}>
                        ⭐ {sales90d} déjà vendu{sales90d > 1 ? 's' : ''} (90j)
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div style={{
                  borderTop: '0.5px solid #f3f4f6',
                  padding: `${1.5 * scale}px ${3 * scale}px`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontSize: 4 * scale, color: '#9ca3af' }}>LMDE · lmdecaisse.com</span>
                  <span style={{ fontSize: 4 * scale, color: '#9ca3af' }}>Prix TTC</span>
                </div>
              </div>
            )}

            {effectivePromo && (
              <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-600">
                <span>🏷️</span>
                <span>Promo active : {effectivePromo.name} · {effectivePromo.label}</span>
              </div>
            )}
            {!effectivePromo && promo && !showPromo && (
              <p className="text-xs text-muted-foreground">Promo désactivée dans l'aperçu — cochez l'option pour l'afficher</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-4">
          <div className="text-xs text-muted-foreground">
            {qty} étiquette{qty > 1 ? 's' : ''} · Format {labelSize.replace('x', '×')} mm
            {effectivePromo ? <span className="ml-2 text-rose-600 font-600">Promo incluse</span> : ''}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
              Fermer
            </button>
            <button
              onClick={handlePrint}
              disabled={isPrinting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-600 hover:bg-rose-700 disabled:opacity-50 transition-colors"
            >
              {isPrinting ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Génération...</>
              ) : (
                <><Icon name="PrinterIcon" size={15} />Imprimer {qty > 1 ? `${qty} ` : ''}étiquette{qty > 1 ? 's' : ''}</>
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
