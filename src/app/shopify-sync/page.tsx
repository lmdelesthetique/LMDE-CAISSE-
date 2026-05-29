'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShopifyVariant {
  id: number;
  title: string;
  sku: string;
  barcode: string | null;
  inventory_item_id: number;
  inventory_quantity: number;
  price: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  status: string;
  image: { src: string } | null;
  variants: ShopifyVariant[];
}

interface POSProduct {
  id: string;
  name: string;
  ref: string;
  barcode: string | null;
  stock: number;
  shopify: boolean;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  shopify_inventory_item_id: string | null;
}

interface MatchResult {
  pos: POSProduct;
  shopifyProduct: ShopifyProduct | null;
  shopifyVariant: ShopifyVariant | null;
  confidence: number;
  reason: string;
  linked: boolean;
  ignored: boolean;
}

type ActiveTab = 'linked' | 'ready' | 'verify' | 'unmatched' | 'ignored';

const IGNORED_STORAGE_KEY = 'shopify_sync_ignored_v1';

function loadIgnoredIds(): Set<string> {
  try {
    const raw = localStorage.getItem(IGNORED_STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

function saveIgnoredIds(ids: Set<string>) {
  try { localStorage.setItem(IGNORED_STORAGE_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
}

// ─── Matching ─────────────────────────────────────────────────────────────────

function buildMatches(
  posProducts: POSProduct[],
  shopifyProducts: ShopifyProduct[],
  ignoredIds: Set<string>,
): MatchResult[] {
  const bySkuLower = new Map<string, { p: ShopifyProduct; v: ShopifyVariant }>();
  const byBarcodeLower = new Map<string, { p: ShopifyProduct; v: ShopifyVariant }>();
  const byTitleLower = new Map<string, { p: ShopifyProduct; v: ShopifyVariant }>();

  for (const p of shopifyProducts) {
    const titleKey = p.title.trim().toLowerCase();
    if (!byTitleLower.has(titleKey)) byTitleLower.set(titleKey, { p, v: p.variants[0] });
    for (const v of p.variants) {
      const skuKey = (v.sku ?? '').trim().toLowerCase();
      const bcKey = (v.barcode ?? '').trim().toLowerCase();
      if (skuKey && !bySkuLower.has(skuKey)) bySkuLower.set(skuKey, { p, v });
      if (bcKey && !byBarcodeLower.has(bcKey)) byBarcodeLower.set(bcKey, { p, v });
    }
  }

  return posProducts.map((pos) => {
    const ignored = ignoredIds.has(pos.id);

    if (pos.shopify_variant_id) {
      let shopifyProduct: ShopifyProduct | null = null;
      let shopifyVariant: ShopifyVariant | null = null;
      outer: for (const p of shopifyProducts) {
        for (const v of p.variants) {
          if (String(v.id) === pos.shopify_variant_id) { shopifyProduct = p; shopifyVariant = v; break outer; }
        }
      }
      return { pos, shopifyProduct, shopifyVariant, confidence: 100, reason: 'Déjà lié', linked: true, ignored };
    }

    const bc = (pos.barcode ?? '').trim().toLowerCase();
    const nm = pos.name.trim().toLowerCase();
    const rf = (pos.ref ?? '').trim().toLowerCase();

    if (bc) { const m = bySkuLower.get(bc); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 100, reason: 'Code-barres = SKU Shopify', linked: false, ignored }; }
    if (bc) { const m = byBarcodeLower.get(bc); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 100, reason: 'Code-barres identiques', linked: false, ignored }; }
    if (rf) { const m = bySkuLower.get(rf); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 90, reason: 'Référence = SKU Shopify', linked: false, ignored }; }
    if (nm) { const m = byTitleLower.get(nm); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 90, reason: 'Nom identique', linked: false, ignored }; }

    let best: { p: ShopifyProduct; v: ShopifyVariant; conf: number; reason: string } | null = null;
    if (nm.length >= 4) {
      for (const p of shopifyProducts) {
        const tl = p.title.trim().toLowerCase();
        let conf = 0; let reason = '';
        if (tl.includes(nm) && nm.length >= 5)      { conf = 75; reason = `Nom inclus dans "${p.title}"`; }
        else if (nm.includes(tl) && tl.length >= 5) { conf = 70; reason = `Titre "${p.title}" inclus dans le nom`; }
        if (conf > 0 && (!best || conf > best.conf)) best = { p, v: p.variants[0], conf, reason };
      }
    }
    if (rf.length >= 3) {
      for (const p of shopifyProducts) {
        for (const v of p.variants) {
          const sk = (v.sku ?? '').trim().toLowerCase();
          if (sk.length >= 3 && (sk.includes(rf) || rf.includes(sk))) {
            const conf = 65;
            if (!best || conf > best.conf) best = { p, v, conf, reason: `Référence ≈ SKU "${v.sku}"` };
          }
        }
      }
    }
    if (best) return { pos, shopifyProduct: best.p, shopifyVariant: best.v, confidence: best.conf, reason: best.reason, linked: false, ignored };
    return { pos, shopifyProduct: null, shopifyVariant: null, confidence: 0, reason: 'Aucune correspondance', linked: false, ignored };
  });
}

// ─── Confidence badge ─────────────────────────────────────────────────────────

function ConfBadge({ confidence }: { confidence: number }) {
  const s =
    confidence === 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
    confidence >= 80   ? 'bg-blue-100 text-blue-700 border-blue-200' :
    confidence >= 60   ? 'bg-amber-100 text-amber-700 border-amber-200' :
                         'bg-slate-100 text-slate-500 border-slate-200';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${s}`}>
      {confidence > 0 ? `${confidence}%` : '—'}
    </span>
  );
}

// ─── Inline Shopify product picker ───────────────────────────────────────────

function ShopifyPicker({
  shopifyProducts,
  onSelect,
  onCancel,
}: {
  shopifyProducts: ShopifyProduct[];
  onSelect: (p: ShopifyProduct, v: ShopifyVariant) => void;
  onCancel: () => void;
}) {
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const lq = q.trim().toLowerCase();
    if (!lq) return shopifyProducts.slice(0, 12);
    return shopifyProducts.filter(
      (p) => p.title.toLowerCase().includes(lq) || p.variants.some((v) => (v.sku ?? '').toLowerCase().includes(lq))
    ).slice(0, 12);
  }, [q, shopifyProducts]);

  return (
    <div className="mt-2 border border-border rounded-lg bg-slate-50 p-3 space-y-2">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher un produit Shopify…"
        className="w-full text-xs border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary bg-white"
      />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {results.map((p) =>
          p.variants.map((v) => (
            <button
              key={`${p.id}-${v.id}`}
              onClick={() => onSelect(p, v)}
              className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-border transition-colors flex items-center justify-between gap-2"
            >
              <span className="font-medium truncate">{p.title}{v.title !== 'Default Title' ? ` — ${v.title}` : ''}</span>
              <span className="text-muted-foreground flex-shrink-0">{v.sku || 'sans SKU'}</span>
            </button>
          ))
        )}
        {results.length === 0 && <p className="text-xs text-muted-foreground px-3 py-2">Aucun résultat</p>}
      </div>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Annuler</button>
    </div>
  );
}

// ─── Match card ───────────────────────────────────────────────────────────────

function MatchCard({
  match,
  tabVariant,
  shopifyProducts,
  onLink,
  onUnlink,
  onIgnore,
  onRestore,
  linking,
}: {
  match: MatchResult;
  tabVariant: ActiveTab;
  shopifyProducts: ShopifyProduct[];
  onLink: (posId: string, p: ShopifyProduct, v: ShopifyVariant) => Promise<void>;
  onUnlink: (posId: string) => Promise<void>;
  onIgnore: (posId: string) => void;
  onRestore: (posId: string) => void;
  linking: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (p: ShopifyProduct, v: ShopifyVariant) => {
    setPickerOpen(false);
    onLink(match.pos.id, p, v);
  };

  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${
      match.linked ? 'border-emerald-200' :
      match.ignored ? 'border-slate-200 opacity-70' :
      'border-border'
    }`}>
      <div className="flex items-start gap-4">
        {/* POS product */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">POS</p>
          <p className="font-semibold text-foreground truncate">{match.pos.name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {match.pos.ref && <span className="text-[11px] text-muted-foreground">Ref: {match.pos.ref}</span>}
            {match.pos.barcode && <span className="text-[11px] text-muted-foreground">EAN: {match.pos.barcode}</span>}
            <span className={`text-[11px] font-medium ${match.pos.stock <= 0 ? 'text-red-500' : 'text-emerald-600'}`}>
              Stock POS: {match.pos.stock}
            </span>
          </div>
        </div>

        {/* Centre: confidence + reason */}
        <div className="flex flex-col items-center gap-1 w-36 flex-shrink-0 pt-4">
          {match.linked ? (
            <span className="text-xs text-emerald-600 font-semibold">✅ Lié</span>
          ) : match.ignored ? (
            <span className="text-xs text-slate-400 font-semibold">🚫 Ignoré</span>
          ) : (
            <ConfBadge confidence={match.confidence} />
          )}
          <p className="text-[10px] text-muted-foreground text-center leading-tight">{match.reason}</p>
        </div>

        {/* Shopify product */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Shopify</p>
          {match.shopifyProduct ? (
            <>
              <p className="font-semibold text-foreground truncate">{match.shopifyProduct.title}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                {match.shopifyVariant?.sku && <span className="text-[11px] text-muted-foreground">SKU: {match.shopifyVariant.sku}</span>}
                {match.shopifyVariant?.barcode && <span className="text-[11px] text-muted-foreground">EAN: {match.shopifyVariant.barcode}</span>}
                <span className="text-[11px] text-muted-foreground">Stock: {match.shopifyVariant?.inventory_quantity ?? '?'}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">Non trouvé</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 pt-3 flex flex-col gap-2 items-end">
          {tabVariant === 'linked' && (
            <button
              onClick={() => onUnlink(match.pos.id)}
              disabled={linking}
              className="text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              Délier
            </button>
          )}

          {tabVariant === 'ready' && match.shopifyVariant && (
            <button
              onClick={() => onLink(match.pos.id, match.shopifyProduct!, match.shopifyVariant!)}
              disabled={linking}
              className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {linking ? '…' : 'Lier'}
            </button>
          )}

          {tabVariant === 'verify' && (
            <>
              <button
                onClick={() => onLink(match.pos.id, match.shopifyProduct!, match.shopifyVariant!)}
                disabled={linking || !match.shopifyVariant}
                className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                {linking ? '…' : '✅ Confirmer'}
              </button>
              <button
                onClick={() => onIgnore(match.pos.id)}
                disabled={linking}
                className="text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors disabled:opacity-40 whitespace-nowrap"
              >
                ❌ Ignorer
              </button>
            </>
          )}

          {tabVariant === 'unmatched' && (
            <>
              <button
                onClick={() => setPickerOpen((v) => !v)}
                className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                Associer
              </button>
              <button
                onClick={() => onIgnore(match.pos.id)}
                className="text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                🚫 Ignorer
              </button>
            </>
          )}

          {tabVariant === 'ignored' && (
            <button
              onClick={() => onRestore(match.pos.id)}
              className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              ↩️ Restaurer
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <ShopifyPicker
          shopifyProducts={shopifyProducts}
          onSelect={handleSelect}
          onCancel={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'linked',    label: '✅ Liés' },
  { id: 'ready',     label: '🎯 À lier' },
  { id: 'verify',    label: '⚠️ Vérifier' },
  { id: 'unmatched', label: '❌ Non liés' },
  { id: 'ignored',   label: '🚫 Ignorés' },
];

export default function ShopifySyncPage() {
  const supabase = createClient();

  const [posProducts, setPosProducts]         = useState<POSProduct[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [loadingMsg, setLoadingMsg]           = useState('Chargement…');
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);

  const [matches, setMatches]         = useState<MatchResult[]>([]);
  const [ignoredIds, setIgnoredIds]   = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab]     = useState<ActiveTab>('ready');
  const [linking, setLinking]         = useState<Set<string>>(new Set());
  const [autoLinking, setAutoLinking] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [pushingStock, setPushingStock] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ done: number; total: number } | null>(null);
  const [pushResult, setPushResult] = useState<{ ok: number; failed: number } | null>(null);

  // ── Load ignored from localStorage on mount ────────────────────────────────
  useEffect(() => {
    setIgnoredIds(loadIgnoredIds());
  }, []);

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const currentIgnored = loadIgnoredIds();
    setIgnoredIds(currentIgnored);
    try {
      setLoadingMsg('Chargement des produits POS…');
      const posRaw = await fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from('products')
          .select('id, name, ref, barcode, stock, shopify, shopify_product_id, shopify_variant_id, shopify_inventory_item_id')
          .eq('product_status', 'active')
          .order('name')
          .range(from, to)
      );
      const pos: POSProduct[] = posRaw.map((r) => ({
        id: r.id as string,
        name: (r.name as string) || '',
        ref: (r.ref as string) || '',
        barcode: (r.barcode as string) || null,
        stock: Number(r.stock) || 0,
        shopify: Boolean(r.shopify),
        shopify_product_id: (r.shopify_product_id as string) || null,
        shopify_variant_id: (r.shopify_variant_id as string) || null,
        shopify_inventory_item_id: (r.shopify_inventory_item_id as string) || null,
      }));
      setPosProducts(pos);

      setLoadingMsg('Chargement des produits Shopify…');
      const shopifyRes = await fetch('/api/shopify/products');
      if (!shopifyRes.ok) {
        const j = await shopifyRes.json();
        throw new Error(j.error ?? `HTTP ${shopifyRes.status}`);
      }
      const shopifyJson = await shopifyRes.json();
      const shopify: ShopifyProduct[] = (shopifyJson.products ?? []).filter(
        (p: ShopifyProduct) => p.status === 'active'
      );
      setShopifyProducts(shopify);

      setLoadingMsg('Calcul des correspondances…');
      setMatches(buildMatches(pos, shopify, currentIgnored));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Tab counts ─────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    linked:    matches.filter((m) => m.linked).length,
    ready:     matches.filter((m) => !m.linked && !m.ignored && m.confidence >= 80 && m.shopifyVariant).length,
    verify:    matches.filter((m) => !m.linked && !m.ignored && m.confidence >= 1 && m.confidence < 80 && m.shopifyVariant).length,
    unmatched: matches.filter((m) => !m.linked && !m.ignored && m.confidence === 0).length,
    ignored:   matches.filter((m) => m.ignored).length,
  }), [matches]);

  const visibleMatches = useMemo(() => {
    let base: MatchResult[];
    switch (activeTab) {
      case 'linked':    base = matches.filter((m) => m.linked); break;
      case 'ready':     base = matches.filter((m) => !m.linked && !m.ignored && m.confidence >= 80 && m.shopifyVariant); break;
      case 'verify':    base = matches.filter((m) => !m.linked && !m.ignored && m.confidence >= 1 && m.confidence < 80 && m.shopifyVariant); break;
      case 'unmatched': base = matches.filter((m) => !m.linked && !m.ignored && m.confidence === 0); break;
      case 'ignored':   base = matches.filter((m) => m.ignored); break;
    }
    if (!searchQuery.trim()) return base;
    const q = searchQuery.trim().toLowerCase();
    return base.filter(
      (m) =>
        m.pos.name.toLowerCase().includes(q) ||
        (m.pos.ref ?? '').toLowerCase().includes(q) ||
        (m.pos.barcode ?? '').toLowerCase().includes(q) ||
        (m.shopifyProduct?.title ?? '').toLowerCase().includes(q)
    );
  }, [matches, activeTab, searchQuery]);

  const linkedCount = tabCounts.linked;
  const totalPos = posProducts.length;
  const pct = totalPos > 0 ? Math.round((linkedCount / totalPos) * 100) : 0;

  // ── Link / Unlink ──────────────────────────────────────────────────────────
  const handleLink = useCallback(async (posId: string, sp: ShopifyProduct, sv: ShopifyVariant) => {
    setLinking((prev) => new Set(prev).add(posId));
    const { error } = await supabase.from('products').update({
      shopify_variant_id: String(sv.id),
      shopify_inventory_item_id: String(sv.inventory_item_id),
      shopify_product_id: String(sp.id),
      shopify: true,
    }).eq('id', posId);
    if (!error) {
      setMatches((prev) => prev.map((m) =>
        m.pos.id === posId
          ? { ...m, shopifyProduct: sp, shopifyVariant: sv, confidence: 100, reason: 'Lié manuellement', linked: true, ignored: false }
          : m
      ));
      // Push POS stock → Shopify immediately after linking (POS is source of truth)
      fetch('/api/shopify/push-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: [posId] }),
      }).catch(() => {});
    }
    setLinking((prev) => { const s = new Set(prev); s.delete(posId); return s; });
  }, [supabase]);

  const handleUnlink = useCallback(async (posId: string) => {
    setLinking((prev) => new Set(prev).add(posId));
    const { error } = await supabase.from('products').update({
      shopify_variant_id: null,
      shopify_inventory_item_id: null,
      shopify_product_id: null,
      shopify: false,
    }).eq('id', posId);
    if (!error) {
      setMatches((prev) => prev.map((m) =>
        m.pos.id === posId ? { ...m, linked: false, confidence: 0, reason: 'Délié', shopifyProduct: null, shopifyVariant: null } : m
      ));
    }
    setLinking((prev) => { const s = new Set(prev); s.delete(posId); return s; });
  }, [supabase]);

  // ── Ignore / Restore ───────────────────────────────────────────────────────
  const handleIgnore = useCallback((posId: string) => {
    setIgnoredIds((prev) => {
      const next = new Set(prev);
      next.add(posId);
      saveIgnoredIds(next);
      return next;
    });
    setMatches((prev) => prev.map((m) =>
      m.pos.id === posId ? { ...m, ignored: true } : m
    ));
  }, []);

  const handleRestore = useCallback((posId: string) => {
    setIgnoredIds((prev) => {
      const next = new Set(prev);
      next.delete(posId);
      saveIgnoredIds(next);
      return next;
    });
    setMatches((prev) => prev.map((m) =>
      m.pos.id === posId ? { ...m, ignored: false } : m
    ));
  }, []);

  const handleAutoLink = useCallback(async () => {
    const toLink = matches.filter((m) => !m.linked && !m.ignored && m.confidence >= 80 && m.shopifyProduct && m.shopifyVariant);
    if (!toLink.length) return;
    setAutoLinking(true);
    setAutoProgress(0);
    for (let i = 0; i < toLink.length; i++) {
      const { pos, shopifyProduct, shopifyVariant } = toLink[i];
      await handleLink(pos.id, shopifyProduct!, shopifyVariant!);
      setAutoProgress(Math.round(((i + 1) / toLink.length) * 100));
    }
    setAutoLinking(false);
    setAutoProgress(0);
  }, [matches, handleLink]);

  // ── Bulk push POS stock → Shopify ─────────────────────────────────────────
  const handlePushAllStock = useCallback(async () => {
    const linked = matches.filter((m) => m.linked);
    if (!linked.length) return;
    setPushingStock(true);
    setPushResult(null);
    setPushProgress({ done: 0, total: linked.length });

    // Push in batches of 20 to show progress
    const BATCH = 20;
    let totalOk = 0;
    let totalFailed = 0;
    for (let i = 0; i < linked.length; i += BATCH) {
      const batch = linked.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/shopify/push-stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: batch.map((m) => m.pos.id) }),
        });
        const j = await res.json();
        totalOk += j.ok ?? 0;
        totalFailed += j.failed ?? 0;
      } catch {
        totalFailed += batch.length;
      }
      setPushProgress({ done: Math.min(i + BATCH, linked.length), total: linked.length });
    }

    setPushResult({ ok: totalOk, failed: totalFailed });
    setPushingStock(false);
    setPushProgress(null);
    setTimeout(() => setPushResult(null), 8000);
  }, [matches]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Sticky header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 py-4 sticky top-0 z-20">
          <div className="max-w-screen-xl mx-auto flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-foreground">🔗 Synchronisation Shopify</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {loading ? loadingMsg : `${linkedCount} / ${totalPos} produits POS liés — ${shopifyProducts.length} produits actifs Shopify`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={load}
                  disabled={loading}
                  className="text-xs border border-border rounded-lg px-3 py-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  ↻ Actualiser
                </button>
                {tabCounts.ready > 0 && (
                  <button
                    onClick={handleAutoLink}
                    disabled={autoLinking || loading || pushingStock}
                    className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {autoLinking ? (
                      <><span className="animate-spin inline-block">⟳</span> {autoProgress}%</>
                    ) : (
                      `🔗 Lier automatiquement (confiance ≥ 80%) — ${tabCounts.ready}`
                    )}
                  </button>
                )}
                {tabCounts.linked > 0 && (
                  <button
                    onClick={handlePushAllStock}
                    disabled={pushingStock || loading || autoLinking}
                    className="text-xs font-medium bg-blue-600 text-white rounded-lg px-4 py-1.5 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {pushingStock && pushProgress ? (
                      <><span className="animate-spin inline-block">⟳</span> {pushProgress.done}/{pushProgress.total} mis à jour</>
                    ) : (
                      `📤 Pousser tout le stock POS → Shopify`
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {!loading && totalPos > 0 && (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-muted-foreground w-12 text-right">{pct}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="max-w-screen-xl mx-auto px-6 lg:px-8 py-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
              ❌ Erreur : {error}
              <button onClick={load} className="ml-3 underline text-red-600 hover:text-red-800">Réessayer</button>
            </div>
          )}

          {pushResult && (
            <div className={`rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${pushResult.failed > 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
              {pushResult.failed > 0 ? '⚠️' : '✅'}
              <span>
                Stock POS → Shopify : <strong>{pushResult.ok}</strong> produit{pushResult.ok !== 1 ? 's' : ''} mis à jour
                {pushResult.failed > 0 && <>, <strong>{pushResult.failed}</strong> échec{pushResult.failed !== 1 ? 's' : ''}</>}
              </span>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">{loadingMsg}</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-border pb-0 overflow-x-auto">
                {TABS.map((tab) => {
                  const count = tabCounts[tab.id];
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setSearchQuery(''); }}
                      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                        active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                      <span className={`text-[11px] rounded-full px-1.5 py-0.5 font-semibold ${
                        active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Ignored tab info banner */}
              {activeTab === 'ignored' && tabCounts.ignored > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-500">
                  Ces produits ont été marqués comme ignorés et ne seront pas synchronisés avec Shopify. Cliquez sur <strong>↩️ Restaurer</strong> pour les remettre dans la liste.
                </div>
              )}

              {/* Search within tab */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0Z" />
                </svg>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrer par nom, référence, EAN…"
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Match list */}
              {visibleMatches.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-sm">
                  {searchQuery ? 'Aucun résultat pour cette recherche.' : 'Aucun produit dans cet onglet.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleMatches.map((match) => (
                    <MatchCard
                      key={match.pos.id}
                      match={match}
                      tabVariant={activeTab}
                      shopifyProducts={shopifyProducts}
                      onLink={handleLink}
                      onUnlink={handleUnlink}
                      onIgnore={handleIgnore}
                      onRestore={handleRestore}
                      linking={linking.has(match.pos.id)}
                    />
                  ))}
                  {visibleMatches.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      {visibleMatches.length} produit{visibleMatches.length > 1 ? 's' : ''}
                      {searchQuery && ` pour "${searchQuery}"`}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
