'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import AppImage from '@/components/ui/AppImage';
import Icon from '@/components/ui/AppIcon';
import { useBarcodeScanner, useCameraBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { fetchProductByBarcode, adjustStock } from '@/lib/services/stockService';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';

interface ColorVariantRow {
  id: string;
  color_name: string;
  color_hex: string;
  quantity: number;
}

interface ScannedItem {
  uid: string;
  productId: string;
  name: string;
  ref: string;
  imageUrl: string;
  currentStock: number;
  countedQty: number;
  isVariant: boolean;
  variantId?: string;
  variantColorHex?: string;
}

function playBeep() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
    setTimeout(() => ctx.close(), 300);
  } catch { /* audio not available */ }
}

export default function InventaireScanPage() {
  const supabase = createClient();

  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [scanMode, setScanMode] = useState<'keyboard' | 'camera'>('keyboard');
  const [manualBarcode, setManualBarcode] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const [lastScanned, setLastScanned] = useState<ScannedItem | null>(null);
  const lastScannedRef = useRef<ScannedItem | null>(null);

  const [variantProduct, setVariantProduct] = useState<{
    id: string; name: string; ref: string; imageUrl: string; stock: number;
  } | null>(null);
  const [variantRows, setVariantRows] = useState<ColorVariantRow[]>([]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [syncDone, setSyncDone] = useState<{ updated: number; skipped: number; errors: number } | null>(null);

  const [pageUrl, setPageUrl] = useState('');
  useEffect(() => {
    if (typeof window !== 'undefined') setPageUrl(window.location.href);
  }, []);

  const addOrIncrementItem = useCallback((baseItem: Omit<ScannedItem, 'uid'>) => {
    const uid = baseItem.isVariant && baseItem.variantId
      ? `${baseItem.productId}-${baseItem.variantId}`
      : baseItem.productId;
    const full: ScannedItem = { ...baseItem, uid };

    setScannedItems((prev) => {
      const existing = prev.find((i) => i.uid === uid);
      if (existing) {
        const updated = { ...existing, countedQty: existing.countedQty + 1 };
        lastScannedRef.current = updated;
        return prev.map((i) => (i.uid === uid ? updated : i));
      }
      lastScannedRef.current = full;
      return [full, ...prev];
    });

    if (lastScannedRef.current) setLastScanned(lastScannedRef.current);
    playBeep();
    try { navigator.vibrate?.(80); } catch { /* vibration not available */ }
  }, []);

  const handleScan = useCallback(async (barcode: string) => {
    if (isLooking) return;
    setIsLooking(true);

    const product = await fetchProductByBarcode(barcode);
    if (!product) {
      toast.error(`Code-barres inconnu : ${barcode}`, { duration: 3000, icon: '❌' });
      setIsLooking(false);
      return;
    }

    const { data: variants } = await supabase
      .from('product_color_stock')
      .select('id, color_name, color_hex, quantity')
      .eq('product_id', product.id)
      .order('created_at', { ascending: true });

    if (variants && variants.length > 0) {
      setVariantProduct({
        id: product.id, name: product.name, ref: product.ref,
        imageUrl: product.imageUrl, stock: product.stock,
      });
      setVariantRows(variants as ColorVariantRow[]);
    } else {
      addOrIncrementItem({
        productId: product.id, name: product.name, ref: product.ref,
        imageUrl: product.imageUrl, currentStock: product.stock,
        countedQty: 1, isVariant: false,
      });
    }

    setIsLooking(false);
  }, [isLooking, addOrIncrementItem, supabase]);

  const handleManualSubmit = useCallback(() => {
    const bc = manualBarcode.trim();
    if (bc.length < 2) return;
    setManualBarcode('');
    handleScan(bc);
  }, [manualBarcode, handleScan]);

  useBarcodeScanner({ onScan: handleScan, enabled: !isLooking });

  const cameraScanner = useCameraBarcodeScanner({
    onScan: handleScan,
    enabled: scanMode === 'camera',
  });

  const handleOpenCamera = useCallback(() => {
    setScanMode('camera');
    cameraScanner.startCamera();
  }, [cameraScanner]);

  const handleCloseCamera = useCallback(() => {
    cameraScanner.stopCamera();
    setScanMode('keyboard');
  }, [cameraScanner]);

  const handleVariantSelect = useCallback((v: ColorVariantRow) => {
    if (!variantProduct) return;
    addOrIncrementItem({
      productId: variantProduct.id,
      name: `${variantProduct.name} — ${v.color_name}`,
      ref: variantProduct.ref,
      imageUrl: variantProduct.imageUrl,
      currentStock: v.quantity,
      countedQty: 1,
      isVariant: true,
      variantId: v.id,
      variantColorHex: v.color_hex,
    });
    setVariantProduct(null);
    setVariantRows([]);
  }, [variantProduct, addOrIncrementItem]);

  const updateCountedQty = useCallback((uid: string, qty: number) => {
    setScannedItems((prev) => prev.map((i) => (i.uid === uid ? { ...i, countedQty: Math.max(0, qty) } : i)));
  }, []);

  const removeItem = useCallback((uid: string) => {
    setScannedItems((prev) => prev.filter((i) => i.uid !== uid));
    setLastScanned((prev) => (prev?.uid === uid ? null : prev));
  }, []);

  const handleValidate = useCallback(async () => {
    setIsSyncing(true);
    let updated = 0, skipped = 0, errors = 0;

    for (const item of scannedItems) {
      if (item.countedQty === item.currentStock) { skipped++; continue; }
      try {
        if (item.isVariant && item.variantId) {
          const { error } = await supabase
            .from('product_color_stock')
            .update({ quantity: item.countedQty })
            .eq('id', item.variantId);

          if (!error) {
            const { data: allV } = await supabase
              .from('product_color_stock')
              .select('quantity')
              .eq('product_id', item.productId);

            if (allV) {
              const total = (allV as { quantity: number }[]).reduce((s, v) => s + (Number(v.quantity) || 0), 0);
              await supabase
                .from('products')
                .update({ stock: total, updated_at: new Date().toISOString() })
                .eq('id', item.productId);
            }

            await supabase.from('stock_movements_log').insert({
              product_id: item.productId,
              product_name: item.name,
              movement_type: 'adjustment',
              quantity_before: item.currentStock,
              quantity_after: item.countedQty,
              quantity_change: item.countedQty - item.currentStock,
              reason: 'Inventaire par scan',
              performed_by: 'Inventaire',
            });
            updated++;
          } else {
            errors++;
          }
        } else {
          const ok = await adjustStock(
            item.productId, item.name, item.currentStock,
            item.countedQty, 'Inventaire par scan', 'Inventaire',
          );
          if (ok) updated++; else errors++;
        }
      } catch { errors++; }
    }

    setIsSyncing(false);
    setSyncDone({ updated, skipped, errors });
    setShowConfirm(false);
    setScannedItems((prev) => prev.map((i) => ({ ...i, currentStock: i.countedQty })));

    if (errors === 0) {
      toast.success(`Inventaire terminé — ${updated} produit(s) mis à jour`, { duration: 5000, icon: '✅' });
    } else {
      toast.warning(`${updated} mis à jour · ${errors} erreur(s)`, { duration: 5000 });
    }
  }, [scannedItems, supabase]);

  const totalScanned = scannedItems.length;
  const withDiff = scannedItems.filter((i) => i.countedQty !== i.currentStock).length;
  const totalUnitsEcart = scannedItems.reduce((s, i) => s + Math.abs(i.countedQty - i.currentStock), 0);

  return (
    <AppLayout>
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-1.5 mb-1 text-sm text-muted-foreground">
              <Link href="/inventory" className="hover:text-foreground transition-colors">Inventaire</Link>
              <Icon name="ChevronRightIcon" size={12} />
              <span className="font-600 text-foreground">Scan</span>
            </div>
            <h1 className="text-2xl font-700 text-foreground">Inventaire par scan</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Scannez les produits pour comparer avec le stock et synchroniser
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/inventory/historique"
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ClockIcon" size={14} />
              Historique
            </Link>
            {scannedItems.length > 0 && (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                <Icon name="CloudArrowUpIcon" size={14} />
                Valider l'inventaire ({totalScanned})
              </button>
            )}
          </div>
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">

          {/* ── Left: Controls ── */}
          <div className="space-y-4">

            {/* Mode toggle */}
            <div className="bg-white rounded-xl border border-border p-4">
              <p className="text-[10px] font-600 uppercase tracking-widest text-muted-foreground mb-3">Mode de scan</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { handleCloseCamera(); setScanMode('keyboard'); }}
                  className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                    scanMode === 'keyboard'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  <Icon name="QrCodeIcon" size={24} />
                  <span className="text-xs font-600 text-center leading-tight">Douchette<br />/ Clavier</span>
                </button>
                <button
                  onClick={handleOpenCamera}
                  className={`flex flex-col items-center gap-2 py-4 rounded-xl border-2 transition-all ${
                    scanMode === 'camera'
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                >
                  <Icon name="CameraIcon" size={24} />
                  <span className="text-xs font-600 text-center leading-tight">Caméra<br />téléphone</span>
                </button>
              </div>
            </div>

            {/* Camera view */}
            {scanMode === 'camera' && (
              <div className="bg-white rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-600 text-foreground">Scan caméra</p>
                  <button onClick={handleCloseCamera} className="p-1 rounded hover:bg-muted text-muted-foreground">
                    <Icon name="XMarkIcon" size={16} />
                  </button>
                </div>

                {cameraScanner.status === 'denied' && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <p className="text-sm font-600 text-red-700">Accès refusé</p>
                    <p className="text-xs text-red-600 mt-1">Autorisez la caméra dans les paramètres du navigateur</p>
                  </div>
                )}

                {/* Container rendered as soon as camera starts so Quagga can attach
                    to the mounted div during the 'requesting' phase */}
                {(cameraScanner.status === 'requesting' || cameraScanner.status === 'active' || cameraScanner.status === 'error') && (
                  <div className="space-y-3">
                    <div className="relative rounded-xl overflow-hidden bg-black" style={{ height: '300px' }}>
                      {/* Quagga injects <video> + <canvas> into this div */}
                      <div
                        ref={cameraScanner.containerRef}
                        className="absolute inset-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
                      />

                      {/* Spinner overlay during camera initialisation */}
                      {cameraScanner.status === 'requesting' && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 gap-3 z-10">
                          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <p className="text-sm text-white">Accès caméra…</p>
                        </div>
                      )}

                      {/* Scanning guide corners */}
                      {cameraScanner.status === 'active' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                          <div className="w-44 h-28 border-2 border-sky-400 rounded-lg relative">
                            <span className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-sky-400 rounded-tl" />
                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-sky-400 rounded-tr" />
                            <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-sky-400 rounded-bl" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-sky-400 rounded-br" />
                            <div className="absolute inset-x-0 top-1/2 h-px bg-sky-400/70 animate-pulse" />
                          </div>
                        </div>
                      )}
                    </div>

                    {cameraScanner.status === 'error' && (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                        <p className="text-xs text-red-700 font-600 mb-1">Erreur d'accès caméra</p>
                        <p className="text-xs text-red-600">Vérifiez les permissions dans les réglages du navigateur</p>
                      </div>
                    )}
                    {cameraScanner.status === 'active' && (
                      <p className="text-xs text-center text-muted-foreground">Pointez vers le code-barres</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual / USB barcode input */}
            <div className="bg-white rounded-xl border border-border p-4">
              <p className="text-[10px] font-600 uppercase tracking-widest text-muted-foreground mb-3">
                {scanMode === 'keyboard' ? 'Douchette USB / Saisie clavier' : 'Saisie manuelle'}
              </p>
              {scanMode === 'keyboard' && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
                  Douchette USB active — scannez directement
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualBarcode}
                  onChange={(e) => setManualBarcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleManualSubmit(); }}
                  placeholder="Code-barres ou référence…"
                  className="flex-1 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  disabled={isLooking}
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={manualBarcode.trim().length < 2 || isLooking}
                  className="px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  {isLooking ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon name="MagnifyingGlassIcon" size={16} />
                  )}
                </button>
              </div>
            </div>

            {/* Last scanned */}
            {lastScanned && (
              <div className="bg-white rounded-xl border-2 border-emerald-300 p-4 shadow-sm">
                <div className="flex items-center gap-1.5 mb-3">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-[10px] font-600 uppercase tracking-widest text-emerald-700">Dernier scan</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                    {lastScanned.imageUrl ? (
                      <AppImage
                        src={lastScanned.imageUrl}
                        alt={lastScanned.name}
                        width={56}
                        height={56}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Icon name="PhotoIcon" size={22} className="text-muted-foreground/40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-600 text-foreground leading-tight line-clamp-2">{lastScanned.name}</p>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{lastScanned.ref}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        Stock : <strong className="text-foreground">{lastScanned.currentStock}</strong>
                      </span>
                      <span className="text-xs font-600 text-primary">
                        Compté : {lastScanned.countedQty}
                      </span>
                      {lastScanned.countedQty !== lastScanned.currentStock && (
                        <span className={`text-xs font-700 px-1.5 py-0.5 rounded-full ${
                          lastScanned.countedQty > lastScanned.currentStock
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {lastScanned.countedQty - lastScanned.currentStock > 0 ? '+' : ''}
                          {lastScanned.countedQty - lastScanned.currentStock}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* QR code for mobile — desktop only */}
            {pageUrl && (
              <div className="bg-white rounded-xl border border-border p-4 hidden lg:block text-center">
                <p className="text-xs font-600 text-muted-foreground mb-3">Scanner sur téléphone</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(pageUrl)}`}
                  alt="QR Code pour ouvrir cette page sur téléphone"
                  width={140}
                  height={140}
                  className="rounded-lg mx-auto"
                />
                <p className="text-[10px] text-muted-foreground mt-2 leading-snug">
                  Pointez la caméra de votre téléphone<br />pour ouvrir cette page et scanner
                </p>
              </div>
            )}
          </div>

          {/* ── Right: Scanned items list ── */}
          <div className="flex flex-col gap-4">

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: totalScanned, label: 'Produits scannés', color: 'text-foreground', border: 'border-border' },
                { value: withDiff, label: 'Avec différences', color: 'text-amber-600', border: 'border-amber-200' },
                { value: totalUnitsEcart, label: 'Unités en écart', color: 'text-foreground', border: 'border-border' },
              ].map((s) => (
                <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-3 text-center`}>
                  <p className={`text-2xl font-700 ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Sync result banner */}
            {syncDone && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <Icon name="CheckCircleIcon" size={20} className="text-emerald-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-600 text-emerald-800">Stock synchronisé avec succès</p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    {syncDone.updated} produit(s) mis à jour · {syncDone.skipped} inchangé(s)
                    {syncDone.errors > 0 && ` · ${syncDone.errors} erreur(s)`}
                  </p>
                </div>
                <button onClick={() => setSyncDone(null)} className="text-emerald-600 hover:text-emerald-800 shrink-0">
                  <Icon name="XMarkIcon" size={16} />
                </button>
              </div>
            )}

            {/* Items list */}
            {scannedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-border py-20 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Icon name="QrCodeIcon" size={28} className="text-muted-foreground/50" />
                </div>
                <p className="text-sm font-600 text-foreground mb-1">Aucun produit scanné</p>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  Utilisez la douchette USB, le clavier ou la caméra pour scanner les produits à inventorier
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                {/* Table header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <p className="text-sm font-600 text-foreground">{totalScanned} produit(s) dans l'inventaire</p>
                  <button
                    onClick={() => { setScannedItems([]); setLastScanned(null); setSyncDone(null); }}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    Tout effacer
                  </button>
                </div>

                <div className="hidden md:grid grid-cols-[40px_1fr_90px_110px_70px_36px] items-center gap-2 px-4 py-2 bg-muted/40 border-b border-border text-[10px] font-600 uppercase tracking-wide text-muted-foreground">
                  <span />
                  <span>Produit</span>
                  <span className="text-center">Stock actuel</span>
                  <span className="text-center">Quantité comptée</span>
                  <span className="text-center">Écart</span>
                  <span />
                </div>

                <div className="divide-y divide-border" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                  {scannedItems.map((item) => {
                    const diff = item.countedQty - item.currentStock;
                    const isMatch = diff === 0;
                    const isRupture = item.countedQty === 0;

                    return (
                      <div
                        key={item.uid}
                        className={`flex md:grid md:grid-cols-[40px_1fr_90px_110px_70px_36px] items-center gap-2 px-4 py-3 hover:bg-muted/20 transition-colors ${
                          isMatch ? '' : isRupture ? 'bg-red-50/30' : 'bg-amber-50/30'
                        }`}
                      >
                        {/* Photo */}
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-muted shrink-0">
                          {item.imageUrl ? (
                            <AppImage src={item.imageUrl} alt={item.name} width={40} height={40} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Icon name="PhotoIcon" size={16} className="text-muted-foreground/40" />
                            </div>
                          )}
                        </div>

                        {/* Name + ref */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-600 text-foreground truncate">{item.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-xs text-muted-foreground font-mono">{item.ref}</p>
                            {item.isVariant && item.variantColorHex && (
                              <span
                                className="w-3 h-3 rounded-full border border-border/60 shrink-0"
                                style={{ backgroundColor: item.variantColorHex }}
                              />
                            )}
                          </div>
                        </div>

                        {/* Current stock */}
                        <div className="text-center hidden md:block">
                          <span className="text-sm text-muted-foreground font-600">{item.currentStock}</span>
                        </div>

                        {/* Counted qty (editable) */}
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => updateCountedQty(item.uid, item.countedQty - 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
                          >
                            <Icon name="MinusIcon" size={10} />
                          </button>
                          <input
                            type="number"
                            value={item.countedQty}
                            onChange={(e) => updateCountedQty(item.uid, parseInt(e.target.value) || 0)}
                            className="w-12 text-center text-sm font-600 border border-border rounded-lg px-1 py-1 focus:outline-none focus:ring-2 focus:ring-primary/30"
                            min={0}
                          />
                          <button
                            onClick={() => updateCountedQty(item.uid, item.countedQty + 1)}
                            className="w-6 h-6 rounded flex items-center justify-center bg-muted hover:bg-muted/70 text-muted-foreground transition-colors"
                          >
                            <Icon name="PlusIcon" size={10} />
                          </button>
                        </div>

                        {/* Diff badge */}
                        <div className="flex items-center justify-center hidden md:flex">
                          {isMatch ? (
                            <span className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center">
                              <Icon name="CheckIcon" size={12} className="text-emerald-600" />
                            </span>
                          ) : (
                            <span className={`text-xs font-700 px-2 py-0.5 rounded-full ${
                              isRupture ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>

                        {/* Remove */}
                        <button
                          onClick={() => removeItem(item.uid)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors shrink-0"
                        >
                          <Icon name="TrashIcon" size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Footer validate */}
                <div className="px-4 py-3 border-t border-border bg-muted/20">
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={isSyncing}
                    className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 active:scale-[0.99]"
                  >
                    {isSyncing ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Synchronisation en cours…
                      </>
                    ) : (
                      <>
                        <Icon name="CloudArrowUpIcon" size={16} />
                        Valider et synchroniser le stock
                        {withDiff > 0 && (
                          <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full">
                            {withDiff} différence{withDiff > 1 ? 's' : ''}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Variant picker modal ── */}
      {variantProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div>
                <p className="text-xs text-muted-foreground">Sélectionnez la déclinaison couleur</p>
                <p className="text-sm font-600 text-foreground truncate max-w-[220px]">{variantProduct.name}</p>
              </div>
              <button
                onClick={() => { setVariantProduct(null); setVariantRows([]); }}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>
            <div className="p-4">
              {variantRows.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto scrollbar-thin">
                  {variantRows.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => handleVariantSelect(v)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all text-left"
                    >
                      <span
                        className="w-5 h-5 rounded-full border border-border/60 shrink-0"
                        style={{ backgroundColor: v.color_hex || '#ccc' }}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-600 text-foreground truncate">{v.color_name}</p>
                        <p className="text-[10px] text-muted-foreground">Stock : {v.quantity}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm sync modal ── */}
      {showConfirm && (() => {
        const itemsWithDiff = scannedItems
          .filter((i) => i.countedQty !== i.currentStock)
          .sort((a, b) => Math.abs(b.countedQty - b.currentStock) - Math.abs(a.countedQty - a.currentStock));
        const gains = itemsWithDiff.filter((i) => i.countedQty > i.currentStock);
        const pertes = itemsWithDiff.filter((i) => i.countedQty < i.currentStock);
        const totalGain = gains.reduce((s, i) => s + (i.countedQty - i.currentStock), 0);
        const totalPerte = pertes.reduce((s, i) => s + (i.currentStock - i.countedQty), 0);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" style={{ maxHeight: '90vh' }}>
              {/* Header */}
              <div className="px-6 pt-6 pb-4 shrink-0">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                    <Icon name="ExclamationTriangleIcon" size={22} className="text-amber-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-700 text-foreground">Analyse de l'inventaire</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {totalScanned} produit(s) scannés · {withDiff} écart(s) détecté(s)
                    </p>
                  </div>
                </div>

                {/* KPI strip */}
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { label: 'Scannés', value: totalScanned, color: 'text-foreground', bg: 'bg-muted/50' },
                    { label: 'Identiques', value: totalScanned - withDiff, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { label: 'Surplus', value: gains.length, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { label: 'Manquants', value: pertes.length, color: 'text-red-600', bg: 'bg-red-50' },
                  ].map((k) => (
                    <div key={k.label} className={`${k.bg} rounded-xl p-2.5 text-center`}>
                      <p className={`text-lg font-700 tabular-nums ${k.color}`}>{k.value}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{k.label}</p>
                    </div>
                  ))}
                </div>

                {gains.length > 0 && (
                  <div className="text-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2 flex justify-between">
                    <span className="text-amber-700 font-600">📦 Surplus total (stock supérieur au comptage DB)</span>
                    <span className="text-amber-700 font-700">+{totalGain} unités</span>
                  </div>
                )}
                {pertes.length > 0 && (
                  <div className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 flex justify-between">
                    <span className="text-red-700 font-600">⚠️ Manquants total (stock inférieur au comptage DB)</span>
                    <span className="text-red-700 font-700">-{totalPerte} unités</span>
                  </div>
                )}
              </div>

              {/* Scrollable detail */}
              {itemsWithDiff.length > 0 && (
                <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
                  <p className="text-[10px] font-700 uppercase tracking-wide text-muted-foreground mb-2">Détail des écarts</p>
                  <div className="space-y-1.5">
                    {itemsWithDiff.map((item) => {
                      const diff = item.countedQty - item.currentStock;
                      const isGain = diff > 0;
                      return (
                        <div key={item.uid} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${isGain ? 'bg-amber-50 border-amber-100' : 'bg-red-50 border-red-100'}`}>
                          <div className="w-8 h-8 rounded-lg overflow-hidden bg-muted shrink-0">
                            {item.imageUrl
                              ? <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                              : <div className="w-full h-full flex items-center justify-center text-muted-foreground/40 text-xs">?</div>
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-600 text-foreground truncate">{item.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              DB : <strong>{item.currentStock}</strong> → Compté : <strong>{item.countedQty}</strong>
                            </p>
                          </div>
                          <span className={`text-xs font-700 px-2 py-0.5 rounded-full shrink-0 ${isGain ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
                >
                  Corriger
                </button>
                <button
                  onClick={handleValidate}
                  disabled={isSyncing}
                  className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-2"
                >
                  {isSyncing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Synchronisation…
                    </>
                  ) : `Confirmer (${withDiff} mise${withDiff > 1 ? 's' : ''} à jour)`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppLayout>
  );
}
