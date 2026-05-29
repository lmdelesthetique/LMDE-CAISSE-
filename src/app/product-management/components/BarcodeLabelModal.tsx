'use client';

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type ProductRecord } from './mockProducts';
import { createClient } from '@/lib/supabase/client';

interface VariantRow { colorName: string; colorHex: string; quantity: number; }

interface BarcodeLabelModalProps {
  products: ProductRecord[];
  onClose: () => void;
  initialQtys?: Record<string, number>;
  orderRef?: string;
}

// ─── Sheet constants (50×25 mm labels, A4 portrait) ────────────────────────
const SHEET = {
  cols: 4,
  rows: 11,
  perPage: 44,
  labelW: 50,   // mm
  labelH: 25,   // mm
  marginLeft: 5,
  marginTop: 11,
  gapX: 0,
  gapY: 0,
} as const;

// Safe zone inside each label (mm)
const SAFE = { top: 1.5, right: 1.5, bottom: 1.5, left: 1.5 } as const;

interface ContentConfig {
  showName: boolean;
  showPrice: boolean;
  showBarcode: boolean;
  showRef: boolean;
  showVariant: boolean;
  showCategory: boolean;
  showLogo: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

const DEFAULT_CONFIG: ContentConfig = {
  showName: true,
  showPrice: true,
  showBarcode: true,
  showRef: true,
  showVariant: false,
  showCategory: false,
  showLogo: false,
  fontSize: 'small',
};

// ─── Detect if value is a valid EAN-13 (13 digits with valid check digit) ───
function isValidEAN13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(value[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(value[12]);
}

// ─── Choose best barcode format for a given value ────────────────────────────
function chooseBarcodeFormat(value: string): 'EAN13' | 'CODE128' {
  if (isValidEAN13(value)) return 'EAN13';
  return 'CODE128';
}

// ─── React barcode component using JsBarcode ────────────────────────────────
function BarcodeSVGReact({ value, width, height }: { value: string; width: number; height: number }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value || value.trim() === '') return;
    const format = chooseBarcodeFormat(value);
    import('jsbarcode').then((mod) => {
      const JsBarcode = mod.default || mod;
      try {
        JsBarcode(svgRef.current, value, {
          format,
          // bar width: 1.5px gives good scan reliability at small sizes
          width: 1.5,
          height: Math.max(20, height - 2),
          displayValue: false,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000',
          // Quiet zones: JsBarcode adds them via margin
          flat: false,
        });
      } catch {
        // Fallback to CODE128 if EAN13 fails
        try {
          JsBarcode(svgRef.current, value, {
            format: 'CODE128',
            width: 1.5,
            height: Math.max(20, height - 2),
            displayValue: false,
            margin: 2,
            background: '#ffffff',
            lineColor: '#000000',
          });
        } catch {
          // Silent fail
        }
      }
    });
  }, [value, height]);

  if (!value || value.trim() === '') {
    return (
      <svg width={width} height={height} xmlns="http://www.w3.org/2000/svg">
        <rect width={width} height={height} fill="#f3f4f6" />
        <text x="50%" y="50%" textAnchor="middle" fontSize="7" fill="#9ca3af" dominantBaseline="middle">—</text>
      </svg>
    );
  }

  return <svg ref={svgRef} width={width} height={height} xmlns="http://www.w3.org/2000/svg" />;
}

// ─── Single label preview (React) ──────────────────────────────────────────
function LabelCell({
  product,
  cfg,
  scale,
  showSafeZone,
}: {
  product: ProductRecord;
  cfg: ContentConfig;
  scale: number;
  showSafeZone: boolean;
}) {
  const W = SHEET.labelW * scale;
  const H = SHEET.labelH * scale;
  const safe = {
    top: SAFE.top * scale,
    right: SAFE.right * scale,
    bottom: SAFE.bottom * scale,
    left: SAFE.left * scale,
  };
  const innerW = W - safe.left - safe.right;
  const innerH = H - safe.top - safe.bottom;
  const fsMap = { small: 5.5, medium: 6.5, large: 7.5 };
  const fs = fsMap[cfg.fontSize] * scale;
  const barcodeH = innerH * 0.42;
  const barcodeValue = product.barcode || product.ref || '';
  const barcodeFormat = chooseBarcodeFormat(barcodeValue);

  return (
    <div
      style={{
        width: W,
        height: H,
        position: 'relative',
        background: '#fff',
        border: '0.5px solid #d1d5db',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {showSafeZone && (
        <div
          style={{
            position: 'absolute',
            top: safe.top,
            left: safe.left,
            width: innerW,
            height: innerH,
            border: '0.5px dashed rgba(239,68,68,0.5)',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          top: safe.top,
          left: safe.left,
          width: innerW,
          height: innerH,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}
      >
        {cfg.showName && (
          <p style={{
            fontSize: product.variantName ? fs * 0.8 : fs,
            fontWeight: product.variantName ? 400 : 700,
            textAlign: 'center', width: '100%',
            overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            lineHeight: 1.2, color: '#444', margin: 0,
          }}>
            {product.name}
          </p>
        )}
        {product.variantName && (
          <p style={{ fontSize: fs, fontWeight: 700, textAlign: 'center', width: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', lineHeight: 1.2, color: '#000', margin: 0 }}>
            {product.variantName}
          </p>
        )}
        {cfg.showRef && (
          <p style={{ fontSize: fs * 0.85, textAlign: 'center', width: '100%', color: '#000', margin: 0, lineHeight: 1.1 }}>
            {product.ref}
          </p>
        )}
        {cfg.showCategory && !product.variantName && (
          <p style={{ fontSize: fs * 0.8, textAlign: 'center', width: '100%', color: '#555', margin: 0, lineHeight: 1.1 }}>
            {product.category}
          </p>
        )}
        {cfg.showBarcode && barcodeValue && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', background: '#fff' }}>
            <BarcodeSVGReact value={barcodeValue} width={innerW} height={barcodeH} />
            <p style={{ fontSize: fs * 0.75, fontFamily: 'monospace', color: '#000', margin: 0, lineHeight: 1 }}>
              {barcodeValue}
            </p>
          </div>
        )}
        {cfg.showPrice && (
          <p style={{ fontSize: fs * 1.2, fontWeight: 700, textAlign: 'center', width: '100%', color: '#000', margin: 0, lineHeight: 1.2 }}>
            {product.sellPriceTTC.toFixed(2)} €
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page preview (44-slot grid) ───────────────────────────────────────────
function PagePreview({
  labels,
  cfg,
  pageIndex,
  showSafeZone,
}: {
  labels: (ProductRecord | null)[];
  cfg: ContentConfig;
  pageIndex: number;
  showSafeZone: boolean;
}) {
  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const previewW = 480;
  const scale = previewW / A4_W_MM;
  const previewH = A4_H_MM * scale;

  const labelW = SHEET.labelW * scale;
  const labelH = SHEET.labelH * scale;
  const marginLeft = SHEET.marginLeft * scale;
  const marginTop = SHEET.marginTop * scale;

  return (
    <div
      style={{
        width: previewW,
        height: previewH,
        background: '#fff',
        border: '1px solid #e5e7eb',
        position: 'relative',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 9, color: '#9ca3af', fontFamily: 'sans-serif' }}>
        Page {pageIndex + 1}
      </div>
      <div
        style={{
          position: 'absolute',
          top: marginTop,
          left: marginLeft,
          display: 'grid',
          gridTemplateColumns: `repeat(${SHEET.cols}, ${labelW}px)`,
          gridTemplateRows: `repeat(${SHEET.rows}, ${labelH}px)`,
          gap: 0,
        }}
      >
        {labels.map((product, i) =>
          product ? (
            <LabelCell key={i} product={product} cfg={cfg} scale={scale} showSafeZone={showSafeZone} />
          ) : (
            <div
              key={i}
              style={{
                width: labelW,
                height: labelH,
                border: '0.5px solid #f3f4f6',
                background: '#fafafa',
              }}
            />
          )
        )}
      </div>
    </div>
  );
}

// ─── Pre-render barcodes to PNG data URLs via canvas (print-safe, no CDN) ────
async function preRenderBarcodes(values: string[]): Promise<Record<string, string>> {
  const mod = await import('jsbarcode');
  const JsBarcode = mod.default || mod;
  const result: Record<string, string> = {};
  const unique = [...new Set(values.filter(Boolean))];
  for (const val of unique) {
    const format = chooseBarcodeFormat(val);
    const canvas = document.createElement('canvas');
    try {
      (JsBarcode as any)(canvas, val, {
        format,
        width: 2,
        height: 60,
        displayValue: false,
        margin: 6,
        background: '#ffffff',
        lineColor: '#000000',
        flat: false,
      });
      result[val] = canvas.toDataURL('image/png');
    } catch {
      try {
        (JsBarcode as any)(canvas, val, {
          format: 'CODE128',
          width: 2,
          height: 60,
          displayValue: false,
          margin: 6,
          background: '#ffffff',
          lineColor: '#000000',
        });
        result[val] = canvas.toDataURL('image/png');
      } catch { /* skip */ }
    }
  }
  return result;
}

// ─── Main modal ─────────────────────────────────────────────────────────────
export default function BarcodeLabelModal({ products, onClose, initialQtys, orderRef }: BarcodeLabelModalProps) {
  const printFrameRef = useRef<HTMLIFrameElement>(null);

  const [cfg, setCfg] = useState<ContentConfig>(DEFAULT_CONFIG);
  const [productQtys, setProductQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    products.forEach((p) => { init[p.id] = initialQtys?.[p.id] ?? 1; });
    return init;
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(products.map((p) => p.id)));
  const [showSafeZone, setShowSafeZone] = useState(true);
  const [activePreviewPage, setActivePreviewPage] = useState(0);
  const [isPrinting, setIsPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config');
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // Variant support
  const [colorVariantsMap, setColorVariantsMap] = useState<Record<string, VariantRow[]>>({});
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [variantQtys, setVariantQtys] = useState<Record<string, number>>({});
  const [selectedVariantIds, setSelectedVariantIds] = useState<Set<string>>(new Set());

  useEffect(() => { searchRef.current?.focus(); }, []);

  useEffect(() => {
    const withVariants = products.filter((p) => p.variants);
    if (!withVariants.length) return;
    const supabase = createClient();
    Promise.all(
      withVariants.map((p) =>
        supabase.from('product_color_stock').select('color_name, color_hex, quantity').eq('product_id', p.id).order('created_at')
      )
    ).then((results) => {
      const map: Record<string, VariantRow[]> = {};
      withVariants.forEach((p, i) => {
        const rows = (results[i].data || []).map((v: any) => ({
          colorName: v.color_name || '',
          colorHex: v.color_hex || '#888888',
          quantity: Number(v.quantity) || 0,
        }));
        if (rows.length > 0) map[p.id] = rows;
      });
      setColorVariantsMap(map);
    });
  }, [products]);

  const toggleExpand = (productId: string) => {
    const variants = colorVariantsMap[productId] || [];
    if (expandedProducts.has(productId)) {
      setExpandedProducts((prev) => { const n = new Set(prev); n.delete(productId); return n; });
    } else {
      setExpandedProducts((prev) => new Set([...prev, productId]));
      setSelectedVariantIds((prev) => {
        const n = new Set(prev);
        variants.forEach((v) => n.add(`${productId}::${v.colorName}`));
        return n;
      });
      setVariantQtys((prev) => {
        const n = { ...prev };
        variants.forEach((v) => { const k = `${productId}::${v.colorName}`; if (!n[k]) n[k] = 1; });
        return n;
      });
    }
  };

  const toggleVariant = (variantId: string) => {
    setSelectedVariantIds((prev) => {
      const n = new Set(prev);
      if (n.has(variantId)) n.delete(variantId); else n.add(variantId);
      return n;
    });
  };

  const allLabels: ProductRecord[] = useMemo(() => {
    const list: ProductRecord[] = [];
    products.forEach((p) => {
      const variants = colorVariantsMap[p.id] || [];
      const isExpanded = expandedProducts.has(p.id) && variants.length > 0;
      if (isExpanded) {
        variants.forEach((v) => {
          const vid = `${p.id}::${v.colorName}`;
          if (!selectedVariantIds.has(vid)) return;
          const qty = variantQtys[vid] || 1;
          for (let i = 0; i < qty; i++) {
            list.push({ ...p, name: `${p.name} — ${v.colorName}`, ref: `${p.ref} — ${v.colorName}`, stock: v.quantity } as ProductRecord);
          }
        });
      } else {
        if (!selectedIds.has(p.id)) return;
        const qty = productQtys[p.id] || 1;
        for (let i = 0; i < qty; i++) list.push(p);
      }
    });
    return list;
  }, [products, selectedIds, productQtys, colorVariantsMap, expandedProducts, selectedVariantIds, variantQtys]);

  const totalLabels = allLabels.length;
  const totalPages = Math.ceil(Math.max(1, totalLabels) / SHEET.perPage);

  const pages: (ProductRecord | null)[][] = useMemo(() => {
    const result: (ProductRecord | null)[][] = [];
    for (let p = 0; p < totalPages; p++) {
      const page: (ProductRecord | null)[] = [];
      for (let i = 0; i < SHEET.perPage; i++) {
        const idx = p * SHEET.perPage + i;
        page.push(idx < allLabels.length ? allLabels[idx] : null);
      }
      result.push(page);
    }
    return result;
  }, [allLabels, totalPages]);

  const toggleProduct = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map((p) => p.id)));
  };

  const setAllQty = (qty: number) => {
    const updated: Record<string, number> = {};
    products.forEach((p) => { updated[p.id] = qty; });
    setProductQtys(updated);
  };

  // ─── Search + filtered helpers ───────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      (p.ref || '').toLowerCase().includes(q) ||
      (p.barcode || '').toLowerCase().includes(q)
    );
  }, [products, search]);

  const selectedInFilter = useMemo(
    () => filteredProducts.filter((p) => selectedIds.has(p.id)),
    [filteredProducts, selectedIds]
  );
  const unselectedInFilter = useMemo(
    () => filteredProducts.filter((p) => !selectedIds.has(p.id)),
    [filteredProducts, selectedIds]
  );

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredProducts.length > 0) {
      const first = filteredProducts[0];
      setSelectedIds((prev) => new Set([...prev, first.id]));
      setProductQtys((prev) => ({ ...prev, [first.id]: Math.max(prev[first.id] ?? 0, 1) }));
      e.preventDefault();
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const clearAllSelection = () => setSelectedIds(new Set());

  // ─── Generate print HTML using pre-rendered barcode data URLs ───────────────
  const generatePrintHTML = useCallback((barcodeDataUrls: Record<string, string>) => {
    const fsMap = { small: 5.5, medium: 6.5, large: 7.5 };
    const fs = fsMap[cfg.fontSize];

    const PX_PER_MM = 3.7795;
    const innerHpx = Math.round((SHEET.labelH - SAFE.top - SAFE.bottom) * PX_PER_MM);
    const barcodeHpx = Math.max(18, Math.round(innerHpx * 0.42));

    const labelHTML = (product: ProductRecord) => {
      const barcodeValue = product.barcode || product.ref || '';
      const dataUrl = barcodeDataUrls[barcodeValue] || '';
      return `
<div class="label">
  <div class="inner">
    ${cfg.showName ? `<p class="${product.variantName ? 'name-small' : 'name'}">${escapeXml(product.name)}</p>` : ''}
    ${product.variantName ? `<p class="variant">${escapeXml(product.variantName)}</p>` : ''}
    ${cfg.showRef ? `<p class="small">${escapeXml(product.ref)}</p>` : ''}
    ${cfg.showCategory && !product.variantName ? `<p class="tiny">${escapeXml(product.category)}</p>` : ''}
    ${cfg.showBarcode && barcodeValue && dataUrl ? `<div class="bc-wrap"><img src="${dataUrl}" style="display:block;width:100%;height:auto;max-height:${barcodeHpx}px;object-fit:contain;" /><p class="bc-num">${escapeXml(barcodeValue)}</p></div>` : ''}
    ${cfg.showPrice ? `<p class="price">${product.sellPriceTTC.toFixed(2)} €</p>` : ''}
  </div>
</div>`;
    };

    const pagesHTML = pages.map((page) => {
      const labelsInPage = page.map((p) => p ? labelHTML(p) : '<div class="label empty"></div>').join('');
      return `<div class="page"><div class="grid">${labelsInPage}</div></div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Étiquettes 50×25mm — BeautyPOS</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Courier New', monospace; background: white; }
@page { size: 210mm 297mm; margin: 0; }
.page {
  width: 210mm; height: 297mm;
  padding-top: ${SHEET.marginTop}mm;
  padding-left: ${SHEET.marginLeft}mm;
  page-break-after: always;
  overflow: hidden;
}
.grid {
  display: grid;
  grid-template-columns: repeat(${SHEET.cols}, ${SHEET.labelW}mm);
  grid-template-rows: repeat(${SHEET.rows}, ${SHEET.labelH}mm);
  gap: 0;
}
.label {
  width: ${SHEET.labelW}mm; height: ${SHEET.labelH}mm;
  overflow: hidden; position: relative;
  background: #ffffff;
}
.label.empty { background: transparent; }
.inner {
  position: absolute;
  top: ${SAFE.top}mm; left: ${SAFE.left}mm;
  width: calc(${SHEET.labelW}mm - ${SAFE.left + SAFE.right}mm);
  height: calc(${SHEET.labelH}mm - ${SAFE.top + SAFE.bottom}mm);
  display: flex; flex-direction: column;
  align-items: center; justify-content: space-between;
  overflow: hidden;
  background: #ffffff;
}
.name { font-size: ${fs}pt; font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: #000000; }
.name-small { font-size: ${(fs * 0.8).toFixed(1)}pt; font-weight: 400; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: #444444; }
.variant { font-size: ${fs}pt; font-weight: 700; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.2; color: #000000; }
.small { font-size: ${(fs * 0.85).toFixed(1)}pt; text-align: center; width: 100%; color: #000000; line-height: 1.1; }
.tiny { font-size: ${(fs * 0.8).toFixed(1)}pt; text-align: center; width: 100%; color: #333333; line-height: 1.1; }
.bc-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; background: #ffffff; }
.bc-wrap svg { display: block; max-width: 100%; }
.bc-num { font-size: ${(fs * 0.75).toFixed(1)}pt; font-family: 'Courier New', monospace; color: #000000; line-height: 1; letter-spacing: 0.5px; }
.price { font-size: ${(fs * 1.2).toFixed(1)}pt; font-weight: 700; text-align: center; width: 100%; color: #000000; line-height: 1.2; }
@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .page { page-break-after: always; }
  img { display: block !important; max-width: 100%; }
}
</style>
</head>
<body>
${pagesHTML}
<script>
window.addEventListener('load', function() { window.print(); });
</script>
</body>
</html>`;
  }, [cfg, pages]);

  const handlePrint = useCallback(async () => {
    setIsPrinting(true);
    try {
      const barcodeValues = allLabels.map(p => p.barcode || p.ref || '').filter(Boolean);
      const barcodeDataUrls = await preRenderBarcodes(barcodeValues);
      const html = generatePrintHTML(barcodeDataUrls);
      const iframe = printFrameRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      doc.open(); doc.write(html); doc.close();
    } finally {
      setTimeout(() => { setIsPrinting(false); }, 1000);
    }
  }, [generatePrintHTML, allLabels]);

  const currentPage = pages[activePreviewPage] ?? [];

  // ─── Product row renderer (shared between sections) ───────────────────────
  const renderProductRow = (product: ProductRecord) => {
    const isSelected = selectedIds.has(product.id);
    const qty = productQtys[product.id] || 1;
    const barcodeVal = product.barcode || product.ref || '';
    const fmt = chooseBarcodeFormat(barcodeVal);
    const variants = colorVariantsMap[product.id] || [];
    const hasVariants = product.variants && variants.length > 0;
    const isExpanded = expandedProducts.has(product.id);
    const isHighlighted = search.trim() !== '' && isSelected;

    return (
      <div key={product.id}>
        <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-colors ${
          isExpanded ? 'border-violet-300 bg-violet-50'
          : isHighlighted ? 'border-rose-300 bg-rose-50'
          : isSelected ? 'border-primary/40 bg-primary/5'
          : 'border-border opacity-50'
        }`}>
          <input type="checkbox"
            checked={isExpanded ? variants.some((v) => selectedVariantIds.has(`${product.id}::${v.colorName}`)) : isSelected}
            onChange={() => { if (isExpanded) { variants.forEach((v) => toggleVariant(`${product.id}::${v.colorName}`)); } else { toggleProduct(product.id); } }}
            className="accent-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-600 text-foreground truncate">{product.name}</p>
            {product.variantName && (
              <p className="text-[10px] font-700 text-primary truncate">{product.variantName}</p>
            )}
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              {barcodeVal || '—'}
              {barcodeVal && <span className="ml-1 text-[9px] text-primary/70 font-sans">[{fmt}]</span>}
            </p>
          </div>
          {hasVariants && (
            <button
              onClick={() => toggleExpand(product.id)}
              className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-600 border transition-colors ${isExpanded ? 'border-violet-400 bg-violet-100 text-violet-700' : 'border-border text-muted-foreground hover:border-violet-300 hover:text-violet-600'}`}
              title={isExpanded ? 'Réduire déclinaisons' : `Développer ${variants.length} déclinaisons`}
            >
              {isExpanded ? '▲ Réduire' : `▼ ${variants.length} coul.`}
            </button>
          )}
          {!isExpanded && (
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => setProductQtys((prev) => ({ ...prev, [product.id]: Math.max(1, (prev[product.id] || 1) - 1) }))} disabled={!isSelected}
                className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs font-700 hover:bg-muted disabled:opacity-30 transition-colors">−</button>
              <input type="number" min="1" max="999" value={qty} disabled={!isSelected}
                onChange={(e) => setProductQtys((prev) => ({ ...prev, [product.id]: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-10 text-center text-xs font-700 border border-border rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-30" />
              <button onClick={() => setProductQtys((prev) => ({ ...prev, [product.id]: Math.min(999, (prev[product.id] || 1) + 1) }))} disabled={!isSelected}
                className="w-5 h-5 rounded border border-border flex items-center justify-center text-xs font-700 hover:bg-muted disabled:opacity-30 transition-colors">+</button>
            </div>
          )}
        </div>

        {isExpanded && variants.map((v) => {
          const vid = `${product.id}::${v.colorName}`;
          const isVarSel = selectedVariantIds.has(vid);
          const vQty = variantQtys[vid] || 1;
          return (
            <div key={vid} className={`ml-6 mt-1 flex items-center gap-2 p-2 rounded-lg border text-xs transition-colors ${isVarSel ? 'border-violet-200 bg-white' : 'border-border/50 opacity-40'}`}>
              <input type="checkbox" checked={isVarSel} onChange={() => toggleVariant(vid)} className="accent-violet-600 shrink-0" />
              <span className="w-3.5 h-3.5 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: v.colorHex }} />
              <span className="flex-1 font-500 text-foreground truncate">{v.colorName}</span>
              <span className="text-muted-foreground text-[10px]">Stk:{v.quantity}</span>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => setVariantQtys((p) => ({ ...p, [vid]: Math.max(1, (p[vid] || 1) - 1) }))} disabled={!isVarSel}
                  className="w-4 h-4 rounded border border-border flex items-center justify-center font-700 hover:bg-muted disabled:opacity-30">−</button>
                <input type="number" min="1" max="999" value={vQty} disabled={!isVarSel}
                  onChange={(e) => setVariantQtys((p) => ({ ...p, [vid]: Math.max(1, parseInt(e.target.value) || 1) }))}
                  className="w-8 text-center font-700 border border-border rounded px-0.5 py-0.5 focus:outline-none disabled:opacity-30" />
                <button onClick={() => setVariantQtys((p) => ({ ...p, [vid]: Math.min(999, (p[vid] || 1) + 1) }))} disabled={!isVarSel}
                  className="w-4 h-4 rounded border border-border flex items-center justify-center font-700 hover:bg-muted disabled:opacity-30">+</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[96vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="PrinterIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-700 text-foreground">Impression étiquettes — Format 50×25 mm</h2>
              {orderRef ? (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-600 text-primary">{totalLabels} étiquette{totalLabels > 1 ? 's' : ''}</span>
                  {' '}depuis commande <span className="font-600 text-foreground">{orderRef}</span>
                  {' · '}{totalPages} page{totalPages > 1 ? 's' : ''} · quantités pré-remplies, ajustables ci-dessous
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  4 colonnes · 11 lignes · <strong>44 étiquettes/page</strong> · Codes-barres CODE128/EAN13 scannables · {totalPages} page{totalPages > 1 ? 's' : ''} · {totalLabels} étiquette{totalLabels > 1 ? 's' : ''}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* ── Tab bar ── */}
        <div className="flex border-b border-border shrink-0 px-6">
          {(['config', 'preview'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors ${
                activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'config' ? '⚙️ Configuration' : '👁️ Aperçu impression'}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: product list ── */}
          <div className="w-80 border-r border-border flex flex-col overflow-hidden shrink-0">

            {/* Search bar */}
            <div className="px-3 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Icon name="MagnifyingGlassIcon" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Rechercher un produit..."
                  className="w-full pl-7 pr-6 py-2 text-xs border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <Icon name="XMarkIcon" size={13} />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-1.5 px-0.5">
                <p className="text-[10px] text-muted-foreground">
                  {search.trim() ? (
                    <><span className="font-600 text-foreground">{filteredProducts.length}</span> produit{filteredProducts.length !== 1 ? 's' : ''} trouvé{filteredProducts.length !== 1 ? 's' : ''}</>
                  ) : (
                    <>{products.length} produits</>
                  )}
                  {' · '}<span className="text-primary font-700">{totalLabels} étiq.</span>
                </p>
                <span className="text-[10px] text-muted-foreground">{selectedIds.size} sél.</span>
              </div>
            </div>

            {/* Bulk actions */}
            <div className="px-3 pb-2 border-b border-border shrink-0 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={selectAllFiltered}
                  className="flex-1 text-[10px] font-600 text-primary border border-primary/30 bg-primary/5 rounded-md px-2 py-1.5 hover:bg-primary/10 transition-colors whitespace-nowrap"
                >
                  {search.trim() ? `Tout sél. filtré (${filteredProducts.length})` : 'Tout sélectionner'}
                </button>
                <button
                  onClick={clearAllSelection}
                  className="flex-1 text-[10px] font-600 text-muted-foreground border border-border rounded-md px-2 py-1.5 hover:bg-muted transition-colors"
                >
                  Vider sélection
                </button>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <span className="text-[9px] text-muted-foreground">Tout à :</span>
                {[1, 2, 5, 10, 20, 44].map((n) => (
                  <button key={n} onClick={() => setAllQty(n)}
                    className="px-2 py-0.5 text-[9px] font-700 border border-border rounded hover:bg-primary/10 hover:border-primary/40 transition-colors">
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Product list */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">

              {/* Empty search result */}
              {filteredProducts.length === 0 && search.trim() && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Icon name="MagnifyingGlassIcon" size={28} className="text-border" />
                  <p className="text-xs text-muted-foreground">Aucun produit pour «{search}»</p>
                  <p className="text-[10px] text-muted-foreground">Essayez nom, référence ou code-barres</p>
                </div>
              )}

              {/* When searching: selected (rose) at top, then unselected */}
              {search.trim() && filteredProducts.length > 0 && selectedInFilter.length > 0 && (
                <>
                  <div className="flex items-center gap-1.5 px-0.5 py-0.5">
                    <div className="h-px flex-1 bg-rose-200" />
                    <span className="text-[9px] font-700 text-rose-500 uppercase tracking-wider whitespace-nowrap">
                      Sélectionnés ({selectedInFilter.length})
                    </span>
                    <div className="h-px flex-1 bg-rose-200" />
                  </div>
                  {selectedInFilter.map(renderProductRow)}
                </>
              )}

              {search.trim() && filteredProducts.length > 0 && unselectedInFilter.length > 0 && (
                <>
                  {selectedInFilter.length > 0 && (
                    <div className="flex items-center gap-1.5 px-0.5 py-0.5">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[9px] font-700 text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                        Autres ({unselectedInFilter.length})
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  {unselectedInFilter.map(renderProductRow)}
                </>
              )}

              {/* No search: render all products */}
              {!search.trim() && products.map(renderProductRow)}
            </div>
          </div>

          {/* ── Main content area ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* CONFIG TAB */}
            {activeTab === 'config' && (
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-2 gap-6 max-w-2xl">

                  {/* Sheet info */}
                  <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Icon name="InformationCircleIcon" size={18} className="text-blue-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-700 text-blue-800 mb-1">Format feuille étiquettes 50×25 mm — Codes-barres scannables</p>
                        <div className="grid grid-cols-4 gap-3 text-xs text-blue-700">
                          <div className="bg-white/70 rounded-lg p-2 text-center">
                            <p className="font-700 text-base text-blue-900">50×25</p>
                            <p>mm / étiquette</p>
                          </div>
                          <div className="bg-white/70 rounded-lg p-2 text-center">
                            <p className="font-700 text-base text-blue-900">4</p>
                            <p>colonnes</p>
                          </div>
                          <div className="bg-white/70 rounded-lg p-2 text-center">
                            <p className="font-700 text-base text-blue-900">11</p>
                            <p>lignes</p>
                          </div>
                          <div className="bg-white/70 rounded-lg p-2 text-center">
                            <p className="font-700 text-base text-blue-900">44</p>
                            <p>étiq./page</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Barcode info */}
                  <div className="col-span-2 bg-green-50 border border-green-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Icon name="CheckBadgeIcon" size={18} className="text-green-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-700 text-green-800 mb-1">Codes-barres scannables — CODE128 / EAN13</p>
                        <p className="text-xs text-green-700">
                          Format <strong>CODE128</strong> pour les références internes — lisible par tous les scanners professionnels.
                          Format <strong>EAN13</strong> automatiquement sélectionné si le code contient 13 chiffres avec un chiffre de contrôle valide.
                          Le code utilisé est le <strong>code-barres officiel du produit</strong> (synchronisé avec la caisse).
                          Marges de sécurité (quiet zones) incluses. Contraste noir/blanc optimal.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Content options */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-border">
                    <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-3">Contenu des étiquettes</p>
                    <div className="space-y-2.5">
                      {[
                        { key: 'showName', label: 'Nom du produit', icon: '🏷️' },
                        { key: 'showPrice', label: 'Prix TTC', icon: '💶' },
                        { key: 'showBarcode', label: 'Code-barres (CODE128/EAN13)', icon: '▌▌▌' },
                        { key: 'showRef', label: 'Référence', icon: '#' },
                        { key: 'showCategory', label: 'Catégorie', icon: '📂' },
                      ].map((opt) => (
                        <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={cfg[opt.key as keyof ContentConfig] as boolean}
                            onChange={() => setCfg((c) => ({ ...c, [opt.key]: !c[opt.key as keyof ContentConfig] }))}
                            className="accent-primary w-4 h-4"
                          />
                          <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                            <span className="mr-1.5">{opt.icon}</span>{opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Display options */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-border">
                    <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-3">Options d'affichage</p>

                    <div className="mb-4">
                      <p className="text-xs font-600 text-foreground mb-2">Taille de police</p>
                      <div className="flex gap-2">
                        {(['small', 'medium', 'large'] as const).map((s) => (
                          <button key={s} onClick={() => setCfg((c) => ({ ...c, fontSize: s }))}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-600 transition-colors ${
                              cfg.fontSize === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                            }`}>
                            {s === 'small' ? 'Petite' : s === 'medium' ? 'Normale' : 'Grande'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSafeZone}
                        onChange={(e) => setShowSafeZone(e.target.checked)}
                        className="accent-primary w-4 h-4"
                      />
                      <div>
                        <p className="text-sm text-foreground font-500">Afficher safe zone</p>
                        <p className="text-xs text-muted-foreground">Bordure rouge = zone de découpe (aperçu uniquement)</p>
                      </div>
                    </label>
                  </div>

                  {/* Scannable barcode tips */}
                  <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Icon name="ShieldCheckIcon" size={18} className="text-amber-600 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-700 text-amber-800 mb-1">Conseils pour des codes-barres scannables</p>
                        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                          <li>Imprimez en <strong>noir et blanc</strong> — désactivez l'économie d'encre</li>
                          <li>Utilisez du papier blanc mat (pas brillant) pour éviter les reflets</li>
                          <li>Résolution imprimante : minimum <strong>300 dpi</strong></li>
                          <li>Marges de sécurité (quiet zones) de <strong>4px</strong> incluses automatiquement</li>
                          <li>Largeur des barres : <strong>1.5px</strong> — optimale pour 50mm</li>
                          <li>Le code texte sous le code-barres permet la saisie manuelle en cas d'échec scan</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PREVIEW TAB */}
            {activeTab === 'preview' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between shrink-0 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Page :</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setActivePreviewPage((p) => Math.max(0, p - 1))}
                        disabled={activePreviewPage === 0}
                        className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                      >‹</button>
                      <span className="text-sm font-700 text-foreground px-2">{activePreviewPage + 1} / {Math.max(1, totalPages)}</span>
                      <button
                        onClick={() => setActivePreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={activePreviewPage >= totalPages - 1}
                        className="w-6 h-6 rounded border border-border flex items-center justify-center text-xs hover:bg-muted disabled:opacity-30 transition-colors"
                      >›</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Format A4 portrait · 50×25mm · CODE128/EAN13 · 44 étiq./page</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={showSafeZone} onChange={(e) => setShowSafeZone(e.target.checked)} className="accent-primary" />
                      <span>Safe zone</span>
                    </label>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-6 flex items-start justify-center bg-gray-100">
                  {totalLabels === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                      <Icon name="TagIcon" size={40} className="text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Sélectionnez des produits pour voir l'aperçu</p>
                    </div>
                  ) : (
                    <PagePreview
                      labels={currentPage}
                      cfg={cfg}
                      pageIndex={activePreviewPage}
                      showSafeZone={showSafeZone}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Icon name="DocumentTextIcon" size={14} />
              {totalPages} page{totalPages > 1 ? 's' : ''} · {totalLabels} étiquette{totalLabels > 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="Squares2X2Icon" size={14} />
              Grille 4×11 — CODE128/EAN13 scannable
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab('preview')}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-600 text-foreground hover:bg-muted transition-colors"
            >
              <Icon name="EyeIcon" size={15} />
              Aperçu
            </button>
            <button onClick={onClose} className="px-4 py-2 border border-border rounded-lg text-sm font-600 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
              Annuler
            </button>
            <button
              onClick={handlePrint}
              disabled={totalLabels === 0 || isPrinting}
              className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPrinting ? (
                <><Icon name="ArrowPathIcon" size={15} className="animate-spin" />Génération…</>
              ) : (
                <><Icon name="PrinterIcon" size={15} />Imprimer {totalLabels} étiquette{totalLabels > 1 ? 's' : ''}</>
              )}
            </button>
          </div>
        </div>
      </div>

      <iframe ref={printFrameRef} className="hidden" title="print-frame" />
    </div>
  );
}

function escapeXml(str: string): string {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeAttr(str: string): string {
  return (str || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
