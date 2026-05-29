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
}

type ActiveTab = 'linked' | 'ready' | 'verify' | 'unmatched';

// ─── Matching ─────────────────────────────────────────────────────────────────

function buildMatches(posProducts: POSProduct[], shopifyProducts: ShopifyProduct[]): MatchResult[] {
  // Lookup maps: key → first Shopify product+variant with that key
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
    // Already linked in DB
    if (pos.shopify_variant_id) {
      let shopifyProduct: ShopifyProduct | null = null;
      let shopifyVariant: ShopifyVariant | null = null;
      outer: for (const p of shopifyProducts) {
        for (const v of p.variants) {
          if (String(v.id) === pos.shopify_variant_id) { shopifyProduct = p; shopifyVariant = v; break outer; }
        }
      }
      return { pos, shopifyProduct, shopifyVariant, confidence: 100, reason: 'Déjà lié', linked: true };
    }

    const bc = (pos.barcode ?? '').trim().toLowerCase();
    const nm = pos.name.trim().toLowerCase();
    const rf = (pos.ref ?? '').trim().toLowerCase();

    // P1 – barcode === variant.sku (100%)
    if (bc) { const m = bySkuLower.get(bc); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 100, reason: 'Code-barres = SKU Shopify', linked: false }; }
    // P2 – barcode === variant.barcode (100%)
    if (bc) { const m = byBarcodeLower.get(bc); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 100, reason: 'Code-barres identiques', linked: false }; }
    // P3 – ref === variant.sku (90%)
    if (rf) { const m = bySkuLower.get(rf); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 90, reason: 'Référence = SKU Shopify', linked: false }; }
    // P4 – exact name (90%)
    if (nm) { const m = byTitleLower.get(nm); if (m) return { pos, shopifyProduct: m.p, shopifyVariant: m.v, confidence: 90, reason: 'Nom identique', linked: false }; }

    // P5 – partial name
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
    // P6 – ref partial sku
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
    if (best) return { pos, shopifyProduct: best.p, shopifyVariant: best.v, confidence: best.conf, reason: best.reason, linked: false };
    return { pos, shopifyProduct: null, shopifyVariant: null, confidence: 0, reason: 'Aucune correspondance', linked: false };
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
  shopifyProducts,
  onLink,
  onUnlink,
  linking,
}: {
  match: MatchResult;
  shopifyProducts: ShopifyProduct[];
  onLink: (posId: string, p: ShopifyProduct, v: ShopifyVariant) => Promise<void>;
  onUnlink: (posId: string) => Promise<void>;
  linking: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleSelect = (p: ShopifyProduct, v: ShopifyVariant) => {
    setPickerOpen(false);
    onLink(match.pos.id, p, v);
  };

  return (
    <div className={`bg-white rounded-xl border p-4 transition-colors ${match.linked ? 'border-emerald-200' : 'border-border'}`}>
      <div className="flex items-start gap-4">
        {/* POS product */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">POS</p>
          <p className="font-semibold text-foreground truncate">{match.pos.name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {match.pos.ref && <span className="text-[11px] text-muted-foreground">Ref: {match.pos.ref}</span>}
            {match.pos.barcode && <span className="text-[11px] text-muted-foreground">EAN: {match.pos.barcode}</span>}
          </div>
        </div>

        {/* Centre: confidence + reason */}
        <div className="flex flex-col items-center gap-1 w-36 flex-shrink-0 pt-4">
          {match.linked ? (
            <span className="text-xs text-emerald-600 font-semibold">✅ Lié</span>
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

        {/* Action */}
        <div className="flex-shrink-0 pt-3">
          {match.linked ? (
            <button
              onClick={() => onUnlink(match.pos.id)}
              disabled={linking}
              className="text-xs text-red-600 hover:text-red-700 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-40"
            >
              Délier
            </button>
          ) : match.shopifyVariant ? (
            <button
              onClick={() => onLink(match.pos.id, match.shopifyProduct!, match.shopifyVariant!)}
              disabled={linking}
              className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-3 py-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-40"
            >
              {linking ? '…' : 'Lier'}
            </button>
          ) : (
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              Associer
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

const TABS: { id: ActiveTab; label: string; minConf: number; maxConf: number; linkedOnly: boolean }[] = [
  { id: 'linked',    label: '✅ Liés',       minConf: 0,   maxConf: 100, linkedOnly: true  },
  { id: 'ready',     label: '🎯 À lier',     minConf: 80,  maxConf: 100, linkedOnly: false },
  { id: 'verify',    label: '⚠️ Vérifier',  minConf: 1,   maxConf: 79,  linkedOnly: false },
  { id: 'unmatched', label: '❌ Non liés',   minConf: 0,   maxConf: 0,   linkedOnly: false },
];

export default function ShopifySyncPage() {
  const supabase = createClient();

  const [posProducts, setPosProducts]       = useState<POSProduct[]>([]);
  const [shopifyProducts, setShopifyProducts] = useState<ShopifyProduct[]>([]);
  const [loadingMsg, setLoadingMsg]         = useState('Chargement…');
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  const [matches, setMatches]   = useState<MatchResult[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('ready');
  const [linking, setLinking]   = useState<Set<string>>(new Set());
  const [autoLinking, setAutoLinking] = useState(false);
  const [autoProgress, setAutoProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Load data ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLoadingMsg('Chargement des produits POS…');
      const posRaw = await fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from('products')
          .select('id, name, ref, barcode, shopify, shopify_product_id, shopify_variant_id, shopify_inventory_item_id')
          .eq('product_status', 'active')
          .order('name')
          .range(from, to)
      );
      const pos: POSProduct[] = posRaw.map((r) => ({
        id: r.id as string,
        name: (r.name as string) || '',
        ref: (r.ref as string) || '',
        barcode: (r.barcode as string) || null,
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
      setMatches(buildMatches(pos, shopify));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Tab data ───────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    linked:    matches.filter((m) => m.linked).length,
    ready:     matches.filter((m) => !m.linked && m.confidence >= 80 && m.shopifyVariant).length,
    verify:    matches.filter((m) => !m.linked && m.confidence >= 1 && m.confidence < 80 && m.shopifyVariant).length,
    unmatched: matches.filter((m) => !m.linked && m.confidence === 0).length,
  }), [matches]);

  const visibleMatches = useMemo(() => {
    let base: MatchResult[];
    switch (activeTab) {
      case 'linked':    base = matches.filter((m) => m.linked); break;
      case 'ready':     base = matches.filter((m) => !m.linked && m.confidence >= 80 && m.shopifyVariant); break;
      case 'verify':    base = matches.filter((m) => !m.linked && m.confidence >= 1 && m.confidence < 80 && m.shopifyVariant); break;
      case 'unmatched': base = matches.filter((m) => !m.linked && m.confidence === 0); break;
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
          ? { ...m, shopifyProduct: sp, shopifyVariant: sv, confidence: 100, reason: 'Lié manuellement', linked: true }
          : m
      ));
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

  const handleAutoLink = useCallback(async () => {
    const toLink = matches.filter((m) => !m.linked && m.confidence >= 80 && m.shopifyProduct && m.shopifyVariant);
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
                    disabled={autoLinking || loading}
                    className="text-xs font-medium bg-emerald-600 text-white rounded-lg px-4 py-1.5 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {autoLinking ? (
                      <><span className="animate-spin inline-block">⟳</span> {autoProgress}%</>
                    ) : (
                      `🔗 Lier automatiquement (confiance ≥ 80%) — ${tabCounts.ready}`
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
                      shopifyProducts={shopifyProducts}
                      onLink={handleLink}
                      onUnlink={handleUnlink}
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
