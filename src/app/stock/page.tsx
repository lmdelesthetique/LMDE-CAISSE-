'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import AppImage from '@/components/ui/AppImage';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import {
  fetchStockProducts,
  fetchStockKPIs,
  fetchMovementHistory,
  fetchTransitOrders,
  addStock,
  removeStock,
  adjustStock,
  suspendProduct,
  markProductAsOrdered,
  fetchProductByBarcode,
  StockProduct,
  StockKPIs,
  StockMovement,
  TransitOrder,
} from '@/lib/services/stockService';
import { supplierService, Supplier } from '@/lib/services/supplierService';
import { supplierOrderService } from '@/lib/services/supplierOrderService';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

type TabId = 'dashboard' | 'liste' | 'historique';

const STATUS_CONFIG = {
  ok: { label: 'Stock OK', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500', ring: 'ring-emerald-200' },
  faible: { label: 'Stock faible', color: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500', ring: 'ring-amber-200' },
  rupture: { label: 'Rupture', color: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', ring: 'ring-red-200' },
  commande: { label: 'Commande en cours', color: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500', ring: 'ring-blue-200' },
  suspendu: { label: 'Suspendu', color: 'bg-gray-100 text-gray-600 border-gray-200', dot: 'bg-gray-400', ring: 'ring-gray-200' },
};

const MOVEMENT_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  entry: { label: 'Entrée', color: 'text-emerald-600', icon: 'ArrowDownTrayIcon' },
  exit: { label: 'Sortie', color: 'text-red-600', icon: 'ArrowUpTrayIcon' },
  adjustment: { label: 'Ajustement', color: 'text-blue-600', icon: 'AdjustmentsHorizontalIcon' },
  reservation: { label: 'Réservation', color: 'text-purple-600', icon: 'BookmarkIcon' },
  cancellation: { label: 'Annulation', color: 'text-orange-600', icon: 'XCircleIcon' },
  return: { label: 'Retour', color: 'text-teal-600', icon: 'ArrowUturnLeftIcon' },
  supplier_reception: { label: 'Réception fournisseur', color: 'text-indigo-600', icon: 'TruckIcon' },
  damaged: { label: 'Abîmé', color: 'text-rose-600', icon: 'ExclamationTriangleIcon' },
  suspended: { label: 'Suspendu', color: 'text-gray-500', icon: 'PauseCircleIcon' },
  transfer: { label: 'Transfert', color: 'text-cyan-600', icon: 'ArrowsRightLeftIcon' },
};

// ─── Mettre en commande Modal ─────────────────────────────────────────────────
interface OrderModalProps {
  product: StockProduct;
  suppliers: Supplier[];
  onClose: () => void;
  onSuccess: () => void;
}

function MettreEnCommandeModal({ product, suppliers, onClose, onSuccess }: OrderModalProps) {
  const router = useRouter();
  const [qty, setQty] = useState(Math.max(product.suggestedReorder, product.minOrderQty, 1));
  const [selectedSupplierId, setSelectedSupplierId] = useState(product.supplierId || '');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'choose' | 'new_order' | 'done'>('choose');

  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId);

  const handleCreateOrder = async () => {
    if (!selectedSupplierId) return;
    setLoading(true);
    try {
      const order = await supplierOrderService.create({
        supplierId: selectedSupplierId,
        orderStatus: 'draft',
        currency: 'EUR',
        notes: `Commande automatique depuis rupture stock — ${product.name}`,
        subtotal: qty * product.purchasePriceSupplier,
        totalRealCost: qty * product.purchasePriceSupplier,
      });
      if (order) {
        await supplierOrderService.addLine({
          orderId: order.id,
          productId: product.id,
          productName: product.name,
          productRef: product.ref,
          productImageUrl: product.imageUrl || undefined,
          qtyOrdered: qty,
          unitPrice: product.purchasePriceSupplier,
          lineTotal: qty * product.purchasePriceSupplier,
          salePrice: product.sellPriceTtc,
          note: `Stock actuel: ${product.stock} — Rupture`,
        });
        await markProductAsOrdered(product.id, product.name, product.stock);
        setMode('done');
        onSuccess();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoToNewOrder = () => {
    const params = new URLSearchParams({
      supplierId: selectedSupplierId,
      productId: product.id,
      qty: String(qty),
    });
    router.push(`/commandes-fournisseurs/nouvelle?${params.toString()}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
            <Icon name="ShoppingCartIcon" size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-foreground truncate">{product.name}</p>
            <p className="text-xs text-muted-foreground">Mettre en commande fournisseur</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="XMarkIcon" size={18} className="text-muted-foreground" />
          </button>
        </div>

        {mode === 'done' ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckCircleIcon" size={28} className="text-emerald-600" />
            </div>
            <p className="font-600 text-foreground mb-1">Commande créée !</p>
            <p className="text-sm text-muted-foreground mb-4">Le produit est maintenant en statut <strong>En commande</strong>.</p>
            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
                Fermer
              </button>
              <button
                onClick={() => router.push('/commandes-fournisseurs')}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors"
              >
                Voir les commandes
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Stock info */}
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-3">
              <Icon name="ExclamationCircleIcon" size={18} className="text-red-600 shrink-0" />
              <div>
                <p className="text-sm font-500 text-red-700">Stock actuel : <strong>{product.stock}</strong> / Min : {product.minStock}</p>
                {product.daysBeforeStockout !== null && (
                  <p className="text-xs text-red-600">Rupture estimée dans {product.daysBeforeStockout} jour(s)</p>
                )}
              </div>
            </div>

            {/* Supplier selection */}
            <div>
              <label className="block text-xs font-500 text-foreground mb-1.5">Fournisseur</label>
              <select
                value={selectedSupplierId}
                onChange={e => setSelectedSupplierId(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Sélectionner un fournisseur</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.companyName}</option>
                ))}
              </select>
              {product.supplierId && !selectedSupplierId && (
                <p className="text-xs text-amber-600 mt-1">⚠️ Ce produit n&apos;a pas de fournisseur principal défini</p>
              )}
            </div>

            {/* Quantity */}
            <div>
              <label className="block text-xs font-500 text-foreground mb-1.5">
                Quantité à commander
                {product.suggestedReorder > 0 && (
                  <span className="ml-2 text-amber-600 font-400">(suggéré : {product.suggestedReorder})</span>
                )}
              </label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {/* Price info */}
            {product.purchasePriceSupplier > 0 && (
              <div className="bg-muted/50 rounded-xl p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Prix achat fournisseur :</span>
                  <span className="font-600 text-foreground">{product.purchasePriceSupplier.toFixed(2)} €</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Total estimé :</span>
                  <span className="font-600 text-primary">{(qty * product.purchasePriceSupplier).toFixed(2)} €</span>
                </div>
                {selectedSupplier && (
                  <div className="flex justify-between mt-1">
                    <span>Délai fournisseur :</span>
                    <span className="font-600 text-foreground">{selectedSupplier.productionDelayDays + selectedSupplier.shippingDelayDays} jours</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
                Annuler
              </button>
              <button
                onClick={handleGoToNewOrder}
                disabled={!selectedSupplierId}
                className="flex-1 py-2.5 rounded-xl border border-primary text-primary text-sm font-500 hover:bg-primary/5 transition-colors disabled:opacity-40"
              >
                Ouvrir commande
              </button>
              <button
                onClick={handleCreateOrder}
                disabled={!selectedSupplierId || loading}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {loading ? 'Création...' : 'Créer commande'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Quick Action Modal ───────────────────────────────────────────────────────
interface QuickActionModalProps {
  product: StockProduct;
  onClose: () => void;
  onSuccess: () => void;
  onOrderClick: (product: StockProduct) => void;
}

function QuickActionModal({ product, onClose, onSuccess, onOrderClick }: QuickActionModalProps) {
  const [action, setAction] = useState<'add' | 'remove' | 'adjust' | 'history' | null>(null);
  const [qty, setQty] = useState(1);
  const [newQty, setNewQty] = useState(product.stock);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<StockMovement[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    const h = await fetchMovementHistory(product.id, 20);
    setHistory(h);
    setHistLoading(false);
  }, [product.id]);

  useEffect(() => {
    if (action === 'history') loadHistory();
  }, [action, loadHistory]);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    let ok = false;
    if (action === 'add') ok = await addStock(product.id, product.name, product.stock, qty, reason);
    else if (action === 'remove') ok = await removeStock(product.id, product.name, product.stock, qty, reason);
    else if (action === 'adjust') ok = await adjustStock(product.id, product.name, product.stock, newQty, reason);
    setLoading(false);
    if (ok) { onSuccess(); onClose(); }
  };

  const handleSuspend = async () => {
    setLoading(true);
    await suspendProduct(product.id, product.name, product.stock);
    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-border">
          <div className="w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
            {product.imageUrl ? (
              <AppImage src={product.imageUrl} alt={product.name} width={48} height={48} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Icon name="ArchiveBoxIcon" size={20} className="text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-600 text-foreground truncate">{product.name}</p>
            <p className="text-xs text-muted-foreground">{product.ref} · Stock actuel : <span className="font-600 text-foreground">{product.stock}</span></p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <Icon name="XMarkIcon" size={18} className="text-muted-foreground" />
          </button>
        </div>

        {/* Actions grid */}
        {!action && (
          <div className="p-5 grid grid-cols-2 gap-3">
            {[
              { id: 'add', label: 'Ajouter stock', icon: 'PlusCircleIcon', color: 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' },
              { id: 'remove', label: 'Retirer stock', icon: 'MinusCircleIcon', color: 'text-red-600 bg-red-50 hover:bg-red-100' },
              { id: 'adjust', label: 'Modifier quantité', icon: 'AdjustmentsHorizontalIcon', color: 'text-blue-600 bg-blue-50 hover:bg-blue-100' },
              { id: 'history', label: 'Voir historique', icon: 'ClockIcon', color: 'text-purple-600 bg-purple-50 hover:bg-purple-100' },
            ].map(a => (
              <button
                key={a.id}
                onClick={() => setAction(a.id as NonNullable<typeof action>)}
                className={`flex items-center gap-3 p-4 rounded-xl border border-border transition-all ${a.color}`}
              >
                <Icon name={a.icon as Parameters<typeof Icon>[0]['name']} size={20} />
                <span className="text-sm font-500">{a.label}</span>
              </button>
            ))}
            {/* Mettre en commande button — highlighted for rupture/faible */}
            <button
              onClick={() => { onClose(); onOrderClick(product); }}
              className={`flex items-center gap-3 p-4 rounded-xl border transition-all col-span-2 ${
                product.stockStatus === 'rupture' || product.stockStatus === 'faible' ?'border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100' :'border-border text-muted-foreground bg-white hover:bg-muted'
              }`}
            >
              <Icon name="ShoppingCartIcon" size={20} />
              <span className="text-sm font-500">Mettre en commande fournisseur</span>
              {(product.stockStatus === 'rupture' || product.stockStatus === 'faible') && (
                <span className="ml-auto text-xs font-600 bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">Recommandé</span>
              )}
            </button>
            <button
              onClick={handleSuspend}
              disabled={loading}
              className="flex items-center gap-3 p-4 rounded-xl border border-border text-gray-600 bg-gray-50 hover:bg-gray-100 transition-all col-span-2"
            >
              <Icon name="PauseCircleIcon" size={20} />
              <span className="text-sm font-500">Suspendre le produit</span>
            </button>
          </div>
        )}

        {/* Add / Remove form */}
        {(action === 'add' || action === 'remove') && (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-500 text-foreground mb-1.5 block">
                Quantité à {action === 'add' ? 'ajouter' : 'retirer'}
              </label>
              <input
                type="number"
                min={1}
                value={qty}
                onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-sm font-500 text-foreground mb-1.5 block">Raison *</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Réception fournisseur, Vente, Casse..."
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
                Retour
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !reason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'En cours...' : 'Confirmer'}
              </button>
            </div>
          </div>
        )}

        {/* Adjust form */}
        {action === 'adjust' && (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-500 text-foreground mb-1.5 block">Nouvelle quantité</label>
              <input
                type="number"
                min={0}
                value={newQty}
                onChange={e => setNewQty(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <p className="text-xs text-muted-foreground mt-1">Actuel : {product.stock} → Nouveau : {newQty} ({newQty - product.stock >= 0 ? '+' : ''}{newQty - product.stock})</p>
            </div>
            <div>
              <label className="text-sm font-500 text-foreground mb-1.5 block">Raison *</label>
              <input
                type="text"
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ex: Inventaire, Correction..."
                className="w-full border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors">
                Retour
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !reason.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'En cours...' : 'Confirmer'}
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {action === 'history' && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="font-500 text-sm text-foreground">Historique des mouvements</p>
              <button onClick={() => setAction(null)} className="text-xs text-primary hover:underline">Retour</button>
            </div>
            {histLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun mouvement enregistré</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {history.map(m => {
                  const cfg = MOVEMENT_LABELS[m.movementType] || MOVEMENT_LABELS.adjustment;
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                      <Icon name={cfg.icon as Parameters<typeof Icon>[0]['name']} size={16} className={cfg.color} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-500 text-foreground">{cfg.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{m.reason || '—'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-600 ${m.quantityChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {m.quantityChange >= 0 ? '+' : ''}{m.quantityChange}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{new Date(m.createdAt).toLocaleDateString('fr-FR')}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function StockPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [kpis, setKpis] = useState<StockKPIs | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [orderProduct, setOrderProduct] = useState<StockProduct | null>(null);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [barcodeStatus, setBarcodeStatus] = useState<'idle' | 'scanning' | 'found' | 'notfound'>('idle');
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiMock, setAiMock] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [prods, transit, sups] = await Promise.all([
      fetchStockProducts(),
      fetchTransitOrders(),
      supplierService.getAll(),
    ]);
    const kpisData = await fetchStockKPIs(prods);
    setProducts(prods);
    setKpis(kpisData);
    setTransitOrders(transit);
    setSuppliers(sups);
    setLoading(false);
  }, []);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    const m = await fetchMovementHistory(undefined, 100);
    setMovements(m);
    setMovementsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { if (activeTab === 'historique') loadMovements(); }, [activeTab, loadMovements]);

  // Real-time sync: refresh stock when products or stock_movements change
  useRealtimeSync({ tables: ['products', 'stock_movements'], onRefresh: loadData });

  // ── Barcode scanner handler for stock management ──────────────────────────
  const handleBarcodeScan = useCallback(async (barcode: string) => {
    setBarcodeStatus('scanning');
    const product = await fetchProductByBarcode(barcode);
    if (product) {
      setSelectedProduct(product);
      setActiveTab('liste');
      setBarcodeStatus('found');
    } else {
      setBarcodeStatus('notfound');
    }
    setTimeout(() => setBarcodeStatus('idle'), 2000);
  }, []);

  useBarcodeScanner({ onScan: handleBarcodeScan });

  const handleAiAnalysis = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/stock-analysis');
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setAiAnalysis(data.analysis);
      setAiMock(data.usedMock ?? false);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    let list = products;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.ref.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      list = list.filter(p => p.stockStatus === statusFilter);
    }
    return list;
  }, [products, search, statusFilter]);

  const restockProducts = useMemo(() =>
    products.filter(p => p.stockStatus === 'rupture' || p.stockStatus === 'faible' || (p.daysBeforeStockout !== null && p.daysBeforeStockout < 7))
      .sort((a, b) => (a.daysBeforeStockout ?? 999) - (b.daysBeforeStockout ?? 999))
      .slice(0, 8),
    [products]
  );

  const topSellers = useMemo(() =>
    [...products].sort((a, b) => b.sales30d - a.sales30d).slice(0, 6),
    [products]
  );

  const dormantProducts = useMemo(() =>
    products.filter(p => p.sales30d === 0 && p.stock > 0).slice(0, 6),
    [products]
  );

  const profitableProducts = useMemo(() =>
    [...products].filter(p => p.marginRate > 0).sort((a, b) => b.marginRate - a.marginRate).slice(0, 6),
    [products]
  );

  const lowMarginProducts = useMemo(() =>
    [...products].filter(p => p.marginRate < 20 && p.marginRate >= 0).sort((a, b) => a.marginRate - b.marginRate).slice(0, 5),
    [products]
  );

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="ArchiveBoxIcon" size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-700 text-foreground">Stock Intelligent</h1>
              <p className="text-xs text-muted-foreground">Vision complète · Décisions rapides</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Barcode scanner status */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-500 transition-all ${
              barcodeStatus === 'scanning' ? 'border-amber-300 bg-amber-50 text-amber-700' :
              barcodeStatus === 'found' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
              barcodeStatus === 'notfound'? 'border-red-300 bg-red-50 text-red-600' : 'border-border bg-white text-muted-foreground'
            }`}>
              <Icon name="QrCodeIcon" size={14} />
              <span>
                {barcodeStatus === 'scanning' ? 'Scan en cours...' :
                 barcodeStatus === 'found' ? 'Produit trouvé ✓' :
                 barcodeStatus === 'notfound'? 'Code inconnu ✗' : 'Scanner actif'}
              </span>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={15} className="text-muted-foreground" />
              <span className="hidden sm:inline">Actualiser</span>
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        {kpis && (
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-px bg-border border-b border-border shrink-0">
            {[
              { label: 'Valeur stock', value: fmt(kpis.totalStockValue), icon: 'BanknotesIcon', color: 'text-emerald-600' },
              { label: 'Stock dormant', value: fmt(kpis.dormantStockValue), icon: 'MoonIcon', color: 'text-amber-600' },
              { label: 'Ruptures', value: String(kpis.ruptureCount), icon: 'ExclamationCircleIcon', color: 'text-red-600' },
              { label: 'À risque', value: String(kpis.atRiskCount), icon: 'ExclamationTriangleIcon', color: 'text-orange-600' },
              { label: 'En transit', value: String(kpis.transitCount), icon: 'TruckIcon', color: 'text-blue-600' },
              { label: 'Réservés', value: String(kpis.reservedCount), icon: 'BookmarkIcon', color: 'text-purple-600' },
              { label: 'Marge globale', value: `${kpis.globalMargin.toFixed(1)}%`, icon: 'ChartBarIcon', color: 'text-teal-600' },
              { label: 'Produits', value: String(kpis.totalProducts), icon: 'TagIcon', color: 'text-foreground' },
            ].map((k, i) => (
              <div key={i} className="bg-white px-4 py-3 flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <Icon name={k.icon as Parameters<typeof Icon>[0]['name']} size={13} className={k.color} />
                  <span className="text-[10px] text-muted-foreground font-500 uppercase tracking-wide">{k.label}</span>
                </div>
                <p className={`text-sm font-700 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-border bg-white shrink-0">
          {([
            { id: 'dashboard', label: 'Dashboard', icon: 'ChartBarIcon' },
            { id: 'liste', label: 'Liste Stock', icon: 'ListBulletIcon' },
            { id: 'historique', label: 'Historique', icon: 'ClockIcon' },
          ] as { id: TabId; label: string; icon: string }[]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-500 transition-all ${
                activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Chargement du stock...</p>
              </div>
            </div>
          ) : (
            <>
              {/* ===== DASHBOARD ===== */}
              {activeTab === 'dashboard' && (
                <div className="p-6 space-y-8">

                  {/* AI Stock Analysis */}
                  <section>
                    <div className="bg-gradient-to-r from-violet-50 to-pink-50 border border-violet-100 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🤖</span>
                          <h2 className="font-700 text-foreground text-sm">Analyse stock IA</h2>
                          {aiMock && aiAnalysis && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 font-500 px-1.5 py-0.5 rounded-full">démo</span>
                          )}
                        </div>
                        <button
                          onClick={handleAiAnalysis}
                          disabled={aiLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-600 hover:bg-violet-700 disabled:opacity-60 transition-colors"
                        >
                          {aiLoading ? (
                            <>
                              <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                              Analyse…
                            </>
                          ) : (
                            <>✨ {aiAnalysis ? 'Réanalyser' : 'Analyser le stock'}</>
                          )}
                        </button>
                      </div>

                      {aiError && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{aiError}</p>
                      )}

                      {!aiAnalysis && !aiLoading && !aiError && (
                        <p className="text-xs text-muted-foreground text-center py-2">Obtenez une analyse IA personnalisée de votre stock en un clic</p>
                      )}

                      {aiLoading && (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <div className="w-5 h-5 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
                          <span className="text-sm text-muted-foreground">Claude analyse votre stock…</span>
                        </div>
                      )}

                      {aiAnalysis && !aiLoading && (
                        <div className="space-y-3">
                          {/* Score santé */}
                          {aiAnalysis.score_sante_stock !== undefined && (
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground font-500">Score santé stock</span>
                              <div className="flex-1 h-2 bg-white/80 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${aiAnalysis.score_sante_stock >= 70 ? 'bg-emerald-500' : aiAnalysis.score_sante_stock >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${aiAnalysis.score_sante_stock}%` }}
                                />
                              </div>
                              <span className={`text-sm font-700 ${aiAnalysis.score_sante_stock >= 70 ? 'text-emerald-600' : aiAnalysis.score_sante_stock >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                                {aiAnalysis.score_sante_stock}/100
                              </span>
                            </div>
                          )}

                          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                            {aiAnalysis.reapprovisionnement_urgent?.length > 0 && (
                              <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                                <p className="text-xs font-700 text-red-700 mb-2">🚨 Réappro urgent</p>
                                <ul className="space-y-1">
                                  {aiAnalysis.reapprovisionnement_urgent.map((item: string, i: number) => (
                                    <li key={i} className="text-xs text-red-800">• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {aiAnalysis.stock_critique?.length > 0 && (
                              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                <p className="text-xs font-700 text-amber-700 mb-2">⚠️ Stock critique</p>
                                <ul className="space-y-1">
                                  {aiAnalysis.stock_critique.map((item: string, i: number) => (
                                    <li key={i} className="text-xs text-amber-800">• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {aiAnalysis.stock_dormant?.length > 0 && (
                              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                <p className="text-xs font-700 text-blue-700 mb-2">💤 Stock dormant</p>
                                <ul className="space-y-1">
                                  {aiAnalysis.stock_dormant.map((item: string, i: number) => (
                                    <li key={i} className="text-xs text-blue-800">• {item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>

                          {aiAnalysis.suggestions?.length > 0 && (
                            <div className="bg-white/70 border border-violet-100 rounded-xl p-3">
                              <p className="text-xs font-700 text-violet-700 mb-2">💡 Suggestions</p>
                              <ul className="space-y-1">
                                {aiAnalysis.suggestions.map((s: string, i: number) => (
                                  <li key={i} className="text-xs text-foreground flex gap-1.5">
                                    <span className="font-700 text-violet-500 shrink-0">{i + 1}.</span>
                                    <span>{s}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Restock urgents */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                        <Icon name="ExclamationCircleIcon" size={16} className="text-red-600" />
                      </div>
                      <h2 className="font-700 text-foreground">🚨 Réapprovisionnement urgent</h2>
                      <span className="ml-auto text-xs text-muted-foreground">{restockProducts.length} produit(s)</span>
                    </div>
                    {restockProducts.length === 0 ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                        <Icon name="CheckCircleIcon" size={32} className="text-emerald-500 mx-auto mb-2" />
                        <p className="text-sm font-500 text-emerald-700">Tous les stocks sont à niveau ✓</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {restockProducts.map(p => {
                          const cfg = STATUS_CONFIG[p.stockStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ok;
                          return (
                            <div key={p.id} className={`bg-white border rounded-2xl p-4 flex gap-4 hover:shadow-md transition-shadow ring-1 ${cfg.ring}`}>
                              <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                                {p.imageUrl ? (
                                  <AppImage src={p.imageUrl} alt={p.name} width={56} height={56} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <p className="font-600 text-sm text-foreground truncate">{p.name}</p>
                                    <p className="text-xs text-muted-foreground">{p.ref} · {p.supplier || 'Fournisseur non défini'}</p>
                                  </div>
                                  <span className={`text-[10px] font-600 px-2 py-0.5 rounded-full border shrink-0 ${cfg.color}`}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  <div className="text-center">
                                    <p className="text-[10px] text-muted-foreground">Stock</p>
                                    <p className={`text-sm font-700 ${p.stock <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.stock}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-muted-foreground">Min</p>
                                    <p className="text-sm font-600 text-foreground">{p.minStock}</p>
                                  </div>
                                  <div className="text-center">
                                    <p className="text-[10px] text-muted-foreground">Rupture dans</p>
                                    <p className={`text-sm font-700 ${p.daysBeforeStockout !== null && p.daysBeforeStockout < 3 ? 'text-red-600' : 'text-amber-600'}`}>
                                      {p.daysBeforeStockout !== null ? `${p.daysBeforeStockout}j` : '—'}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 gap-2">
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>7j: <strong className="text-foreground">{p.sales7d}</strong></span>
                                    <span>30j: <strong className="text-foreground">{p.sales30d}</strong></span>
                                    <span>Délai: <strong className="text-foreground">{p.supplierLeadDays}j</strong></span>
                                  </div>
                                  <button
                                    onClick={() => setOrderProduct(p)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-600 hover:bg-blue-700 transition-colors shrink-0"
                                  >
                                    <Icon name="ShoppingCartIcon" size={12} />
                                    Mettre en commande
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Top sellers + Dormants */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top sellers */}
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <Icon name="ArrowTrendingUpIcon" size={16} className="text-emerald-600" />
                        </div>
                        <h2 className="font-700 text-foreground">📈 Top ventes</h2>
                      </div>
                      <div className="bg-white border border-border rounded-2xl overflow-hidden">
                        {topSellers.map((p, i) => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <span className="text-sm font-700 text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted shrink-0">
                              {p.imageUrl ? (
                                <AppImage src={p.imageUrl} alt={p.name} width={36} height={36} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">{p.category}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-700 text-emerald-600">{p.sales30d} ventes</p>
                              <p className="text-xs text-muted-foreground">30 jours</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    {/* Dormants */}
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                          <Icon name="MoonIcon" size={16} className="text-amber-600" />
                        </div>
                        <h2 className="font-700 text-foreground">💤 Produits dormants</h2>
                      </div>
                      <div className="bg-white border border-border rounded-2xl overflow-hidden">
                        {dormantProducts.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">Aucun produit dormant</div>
                        ) : dormantProducts.map(p => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-muted shrink-0">
                              {p.imageUrl ? (
                                <AppImage src={p.imageUrl} alt={p.name} width={36} height={36} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="PhotoIcon" size={14} className="text-muted-foreground" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">Stock: {p.stock} · Valeur: {fmt(p.totalStockValue)}</p>
                            </div>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setSelectedProduct(p)}
                                className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
                                title="Actions rapides"
                              >
                                <Icon name="BoltIcon" size={13} className="text-amber-600" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* Profitable + Low margin */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-teal-100 flex items-center justify-center">
                          <Icon name="CurrencyEuroIcon" size={16} className="text-teal-600" />
                        </div>
                        <h2 className="font-700 text-foreground">💸 Plus rentables</h2>
                      </div>
                      <div className="bg-white border border-border rounded-2xl overflow-hidden">
                        {profitableProducts.map((p, i) => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <span className="text-sm font-700 text-muted-foreground w-5 shrink-0">#{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">Coût: {fmt(p.costPrice)} · PV: {fmt(p.sellPriceTtc)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-700 text-teal-600">{p.marginRate.toFixed(0)}%</p>
                              <p className="text-xs text-muted-foreground">{fmt(p.margin)}/u</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-7 h-7 rounded-lg bg-rose-100 flex items-center justify-center">
                          <Icon name="ArrowTrendingDownIcon" size={16} className="text-rose-600" />
                        </div>
                        <h2 className="font-700 text-foreground">⚠️ Peu rentables</h2>
                      </div>
                      <div className="bg-white border border-border rounded-2xl overflow-hidden">
                        {lowMarginProducts.length === 0 ? (
                          <div className="p-6 text-center text-sm text-muted-foreground">Aucun produit peu rentable</div>
                        ) : lowMarginProducts.map(p => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">Coût: {fmt(p.costPrice)} · PV: {fmt(p.sellPriceTtc)}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-sm font-700 ${p.marginRate < 10 ? 'text-red-600' : 'text-amber-600'}`}>{p.marginRate.toFixed(0)}%</p>
                              <p className="text-xs text-muted-foreground">{fmt(p.margin)}/u</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  {/* Transit orders */}
                  <section>
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Icon name="TruckIcon" size={16} className="text-blue-600" />
                      </div>
                      <h2 className="font-700 text-foreground">🚢 Commandes en transit</h2>
                      <span className="ml-auto text-xs text-muted-foreground">{transitOrders.length} commande(s)</span>
                    </div>
                    {transitOrders.length === 0 ? (
                      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-center">
                        <Icon name="TruckIcon" size={28} className="text-blue-400 mx-auto mb-2" />
                        <p className="text-sm text-blue-600">Aucune commande en transit</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {transitOrders.map(o => (
                          <div key={o.id} className="bg-white border border-border rounded-2xl p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                  o.transportType === 'container' ? 'bg-blue-100' : o.transportType === 'avion' ? 'bg-sky-100' : 'bg-gray-100'
                                }`}>
                                  <Icon
                                    name={o.transportType === 'avion' ? 'PaperAirplaneIcon' : 'TruckIcon'}
                                    size={14}
                                    className={o.transportType === 'container' ? 'text-blue-600' : o.transportType === 'avion' ? 'text-sky-600' : 'text-gray-600'}
                                  />
                                </div>
                                <div>
                                  <p className="text-xs font-600 text-foreground">{o.orderNumber}</p>
                                  <p className="text-[10px] text-muted-foreground capitalize">{o.transportType}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{o.orderStatus}</span>
                            </div>
                            <p className="text-sm font-500 text-foreground">{o.supplierName}</p>
                            <div className="flex items-center justify-between mt-2">
                              <p className="text-xs text-muted-foreground">
                                {o.expectedDeliveryAt ? `Arrivée: ${new Date(o.expectedDeliveryAt).toLocaleDateString('fr-FR')}` : 'Date non définie'}
                              </p>
                              <p className="text-sm font-700 text-foreground">{fmt(o.totalAmount)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ===== LISTE STOCK ===== */}
              {activeTab === 'liste' && (
                <div className="p-6">
                  <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <div className="relative flex-1">
                      <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Rechercher par nom, référence, fournisseur..."
                        className="w-full pl-9 pr-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {(['all', 'ok', 'faible', 'rupture', 'commande', 'suspendu'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => setStatusFilter(s)}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-500 border transition-all ${
                            statusFilter === s
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-white border-border text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {s !== 'all' && <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[s].dot}`} />}
                          {s === 'all' ? 'Tous' : STATUS_CONFIG[s].label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-3">{filteredProducts.length} produit(s)</p>

                  <div className="space-y-2">
                    {filteredProducts.map(p => {
                      const cfg = STATUS_CONFIG[p.stockStatus as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.ok;
                      return (
                        <div key={p.id} className="bg-white border border-border rounded-2xl p-4 hover:shadow-md transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted shrink-0">
                              {p.imageUrl ? (
                                <AppImage src={p.imageUrl} alt={p.name} width={56} height={56} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Icon name="PhotoIcon" size={20} className="text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-600 text-sm text-foreground">{p.name}</p>
                                <span className={`text-[10px] font-600 px-2 py-0.5 rounded-full border ${cfg.color}`}>
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${cfg.dot}`} />
                                  {cfg.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{p.ref} · {p.supplier || '—'} · {p.category}</p>

                              <div className="flex flex-wrap gap-3 mt-2">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Boutique:</span>
                                  <span className={`text-xs font-700 ${p.stock <= 0 ? 'text-red-600' : p.stock <= p.minStock ? 'text-amber-600' : 'text-emerald-600'}`}>{p.stock}</span>
                                </div>
                                {p.stockReserved > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">Réservé:</span>
                                    <span className="text-xs font-600 text-purple-600">{p.stockReserved}</span>
                                  </div>
                                )}
                                {p.stockTransitContainer > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Icon name="TruckIcon" size={10} className="text-blue-500" />
                                    <span className="text-[10px] text-muted-foreground">Container:</span>
                                    <span className="text-xs font-600 text-blue-600">{p.stockTransitContainer}</span>
                                  </div>
                                )}
                                {p.stockTransitAvion > 0 && (
                                  <div className="flex items-center gap-1">
                                    <Icon name="PaperAirplaneIcon" size={10} className="text-sky-500" />
                                    <span className="text-[10px] text-muted-foreground">Avion:</span>
                                    <span className="text-xs font-600 text-sky-600">{p.stockTransitAvion}</span>
                                  </div>
                                )}
                                {p.stockDamaged > 0 && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-muted-foreground">Abîmé:</span>
                                    <span className="text-xs font-600 text-rose-600">{p.stockDamaged}</span>
                                  </div>
                                )}
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] text-muted-foreground">Min:</span>
                                  <span className="text-xs font-600 text-foreground">{p.minStock}</span>
                                </div>
                              </div>
                            </div>

                            <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
                              <p className="text-xs text-muted-foreground">Coût: <span className="font-600 text-foreground">{fmt(p.costPrice)}</span></p>
                              <p className="text-xs text-muted-foreground">PV: <span className="font-600 text-foreground">{fmt(p.sellPriceTtc)}</span></p>
                              <p className={`text-xs font-700 ${p.marginRate >= 30 ? 'text-teal-600' : p.marginRate >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                                Marge: {p.marginRate.toFixed(0)}%
                              </p>
                            </div>

                            {p.suggestedReorder > 0 && (
                              <div className="hidden lg:flex flex-col items-center gap-1 shrink-0 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                <p className="text-[10px] text-amber-700 font-500">Commander</p>
                                <p className="text-lg font-800 text-amber-700">{p.suggestedReorder}</p>
                                <p className="text-[10px] text-amber-600">unités</p>
                              </div>
                            )}

                            <div className="flex flex-col gap-2 shrink-0">
                              {(p.stockStatus === 'rupture' || p.stockStatus === 'faible') && (
                                <button
                                  onClick={() => setOrderProduct(p)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-600 hover:bg-blue-700 transition-colors"
                                >
                                  <Icon name="ShoppingCartIcon" size={12} />
                                  Commander
                                </button>
                              )}
                              <button
                                onClick={() => setSelectedProduct(p)}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-600 hover:bg-primary/20 transition-colors"
                              >
                                <Icon name="BoltIcon" size={13} />
                                Actions
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {filteredProducts.length === 0 && (
                      <div className="text-center py-12">
                        <Icon name="ArchiveBoxXMarkIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">Aucun produit trouvé</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ===== HISTORIQUE ===== */}
              {activeTab === 'historique' && (
                <div className="p-6">
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="font-700 text-foreground">Historique complet des mouvements</h2>
                    <button
                      onClick={loadMovements}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors"
                    >
                      <Icon name="ArrowPathIcon" size={14} className="text-muted-foreground" />
                      Actualiser
                    </button>
                  </div>

                  {movementsLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : movements.length === 0 ? (
                    <div className="text-center py-12">
                      <Icon name="ClockIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Aucun mouvement enregistré</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-border rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-border bg-muted/30">
                              <th className="text-left text-xs font-600 text-muted-foreground px-4 py-3">Date</th>
                              <th className="text-left text-xs font-600 text-muted-foreground px-4 py-3">Produit</th>
                              <th className="text-left text-xs font-600 text-muted-foreground px-4 py-3">Type</th>
                              <th className="text-right text-xs font-600 text-muted-foreground px-4 py-3">Avant</th>
                              <th className="text-right text-xs font-600 text-muted-foreground px-4 py-3">Après</th>
                              <th className="text-right text-xs font-600 text-muted-foreground px-4 py-3">Variation</th>
                              <th className="text-left text-xs font-600 text-muted-foreground px-4 py-3">Raison</th>
                              <th className="text-left text-xs font-600 text-muted-foreground px-4 py-3">Par</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map(m => {
                              const cfg = MOVEMENT_LABELS[m.movementType] || MOVEMENT_LABELS.adjustment;
                              return (
                                <tr key={m.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(m.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-4 py-3">
                                    <p className="text-xs font-500 text-foreground">{m.productName}</p>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <Icon name={cfg.icon as Parameters<typeof Icon>[0]['name']} size={13} className={cfg.color} />
                                      <span className={`text-xs font-500 ${cfg.color}`}>{cfg.label}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">{m.quantityBefore}</td>
                                  <td className="px-4 py-3 text-right text-xs font-600 text-foreground">{m.quantityAfter}</td>
                                  <td className="px-4 py-3 text-right">
                                    <span className={`text-xs font-700 ${m.quantityChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {m.quantityChange >= 0 ? '+' : ''}{m.quantityChange}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-[160px] truncate">{m.reason || '—'}</td>
                                  <td className="px-4 py-3 text-xs text-muted-foreground">{m.performedBy}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Quick Action Modal */}
      {selectedProduct && (
        <QuickActionModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onSuccess={loadData}
          onOrderClick={(p) => { setSelectedProduct(null); setOrderProduct(p); }}
        />
      )}

      {/* Mettre en commande Modal */}
      {orderProduct && (
        <MettreEnCommandeModal
          product={orderProduct}
          suppliers={suppliers}
          onClose={() => setOrderProduct(null)}
          onSuccess={loadData}
        />
      )}
    </AppLayout>
  );
}
