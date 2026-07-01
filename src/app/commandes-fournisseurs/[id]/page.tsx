'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { supplierOrderService, FoOrder, FoOrderLine, FoOrderStatus, FoStatusHistory } from '@/lib/services/supplierOrderService';
import { exportPurchaseOrderPDF } from '@/lib/utils/purchaseOrderPDF';
import BarcodeLabelModal from '@/app/product-management/components/BarcodeLabelModal';
import { type ProductRecord } from '@/app/product-management/components/mockProducts';

const STATUS_LABELS: Record<FoOrderStatus, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'Attente validation',
  validated: 'Validée', modification_requested: 'Modif. demandée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée', payment_received_by_supplier: 'Paiement reçu fournisseur',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue totalement',
  costs_recorded: 'Frais enregistrés', stock_integrated: 'Stock intégré',
  closed: 'Clôturée', suspended: 'Suspendue', cancelled: 'Annulée',
};

const STATUS_FLOW: FoOrderStatus[] = [
  'draft', 'sent', 'awaiting_validation', 'validated', 'payment_pending',
  'payment_in_progress', 'paid', 'payment_received_by_supplier',
  'in_preparation', 'in_production', 'ready_to_ship', 'shipped',
  'partially_received', 'fully_received', 'costs_recorded', 'stock_integrated', 'closed',
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700', sent: 'bg-blue-50 text-blue-700',
  awaiting_validation: 'bg-amber-50 text-amber-700', validated: 'bg-emerald-50 text-emerald-700',
  modification_requested: 'bg-orange-50 text-orange-700', payment_pending: 'bg-amber-50 text-amber-700',
  payment_in_progress: 'bg-blue-50 text-blue-700', paid: 'bg-emerald-50 text-emerald-700',
  payment_received_by_supplier: 'bg-emerald-50 text-emerald-700',
  in_preparation: 'bg-purple-50 text-purple-700', in_production: 'bg-purple-50 text-purple-700',
  ready_to_ship: 'bg-indigo-50 text-indigo-700', shipped: 'bg-cyan-50 text-cyan-700',
  partially_received: 'bg-amber-50 text-amber-700', fully_received: 'bg-emerald-50 text-emerald-700',
  costs_recorded: 'bg-teal-50 text-teal-700', stock_integrated: 'bg-green-50 text-green-700',
  closed: 'bg-gray-100 text-gray-700', suspended: 'bg-red-50 text-red-700', cancelled: 'bg-red-50 text-red-700',
};

interface StructureHistoryEntry {
  date: string;
  oldPct: number;
  newPct: number;
  oldImportCost: number;
  newBusinessCost: number;
  changedBy: string;
}

interface CostHistoryEntry {
  date: string;
  productRef: string;
  productName: string;
  oldCost: number;
  newCost: number;
  oldMargin: number;
  newMargin: number;
  oldSellPrice: number;
  newSellPrice: number;
  orderId: string;
  supplierName: string;
  changedBy: string;
}

// Which cost lines are included in supplier payment
interface SupplierPaymentIncludes {
  transport: boolean;
  customs: boolean;
  vat: boolean;
  freight: boolean;
  bank: boolean;
  exchange: boolean;
  local: boolean;
  other: boolean;
}

type Tab = 'overview' | 'lines' | 'reception' | 'costs' | 'margins' | 'history' | 'payment';

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FoOrder | null>(null);
  const [history, setHistory] = useState<FoStatusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [statusComment, setStatusComment] = useState('');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [targetStatus, setTargetStatus] = useState<FoOrderStatus | null>(null);
  const [costs, setCosts] = useState({ transport: 0, customs: 0, vat: 0, freight: 0, bank: 0, exchange: 0, local: 0, other: 0 });
  // Which cost lines are included in supplier payment amount
  const [supplierIncludes, setSupplierIncludes] = useState<SupplierPaymentIncludes>({
    transport: false, customs: false, vat: false, freight: false,
    bank: false, exchange: false, local: false, other: false,
  });
  const [structurePct, setStructurePct] = useState(0);
  const [costMethod, setCostMethod] = useState<'by_value' | 'by_quantity' | 'by_weight' | 'by_volume' | 'custom'>('by_value');
  const [savingCosts, setSavingCosts] = useState(false);
  const [exportingPDF, setExportingPDF] = useState(false);
  const [structureHistory, setStructureHistory] = useState<StructureHistoryEntry[]>([]);
  const [costHistory, setCostHistory] = useState<CostHistoryEntry[]>([]);
  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('wire_transfer');
  const [paymentDate, setPaymentDate] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  // Quick price edit state
  const [editingPriceLineId, setEditingPriceLineId] = useState<string | null>(null);
  const [newSellPrice, setNewSellPrice] = useState('');
  const [savingPrice, setSavingPrice] = useState(false);
  // Bulk update state
  const [bulkUpdateEnabled, setBulkUpdateEnabled] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkUpdateDone, setBulkUpdateDone] = useState(false);
  // Validate prices (step 4)
  const [validatingPrices, setValidatingPrices] = useState(false);
  const [validatePricesResult, setValidatePricesResult] = useState<string | null>(null);
  const [markingPaid, setMarkingPaid] = useState(false);

  // Print labels from order
  const [showOrderLabelModal, setShowOrderLabelModal] = useState(false);
  const [orderLabelProducts, setOrderLabelProducts] = useState<ProductRecord[]>([]);
  const [orderLabelInitialQtys, setOrderLabelInitialQtys] = useState<Record<string, number>>({});
  const [orderLabelLoading, setOrderLabelLoading] = useState(false);

  // Image backfill
  const [backfilledImages, setBackfilledImages] = useState(false);

  // Stock update on reception
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [stockUpdateBanner, setStockUpdateBanner] = useState<string | null>(null);
  const [updatingStock, setUpdatingStock] = useState(false);

  // Invoice real prices (entered by employee from received PDF)
  const [realPrices, setRealPrices] = useState<Record<string, string>>({});
  const [savingPrices, setSavingPrices] = useState(false);
  const [pricesSaved, setPricesSaved] = useState(false);

  // Cost modes: 'eur' (fixed amount) | 'pct' (% of product subtotal)
  const [costModes, setCostModes] = useState<Record<string, 'eur' | 'pct'>>({
    transport: 'eur', customs: 'eur', vat: 'eur', freight: 'eur',
    bank: 'eur', exchange: 'eur', local: 'eur', other: 'eur',
  });
  const [costPcts, setCostPcts] = useState<Record<string, number>>({
    transport: 0, customs: 0, vat: 0, freight: 0,
    bank: 0, exchange: 0, local: 0, other: 0,
  });

  // Group / transport inline edit
  const [editingMeta, setEditingMeta] = useState(false);
  const [editGroup, setEditGroup] = useState('');
  const [editTransportMeth, setEditTransportMeth] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // Notes inline edit
  const [editingNotes, setEditingNotes] = useState(false);
  const [editNotesVal, setEditNotesVal] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);

  // Currency inline edit
  const [editingCurrency, setEditingCurrency] = useState(false);
  const [editCurrencyVal, setEditCurrencyVal] = useState('');
  const [editExchangeRateVal, setEditExchangeRateVal] = useState('');
  const [savingCurrency, setSavingCurrency] = useState(false);

  // Draft edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedLines, setEditedLines] = useState<FoOrderLine[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editTransport, setEditTransport] = useState(0);
  const [editCustoms, setEditCustoms] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
  const [saveEditError, setSaveEditError] = useState<string | null>(null);
  const [uploadLink, setUploadLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showAddLineModal, setShowAddLineModal] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);

  // Load default structure % from localStorage (set in admin-config)
  useEffect(() => {
    const defaultPct = parseFloat(localStorage.getItem('beautypos_default_structure_pct') || '0');
    if (defaultPct > 0) setStructurePct(defaultPct);
  }, []);

  // Load structure history from localStorage per order
  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`beautypos_structure_history_${id}`);
    if (stored) {
      try { setStructureHistory(JSON.parse(stored)); } catch { /* ignore */ }
    }
    // Load supplier includes per order
    const storedIncludes = localStorage.getItem(`beautypos_supplier_includes_${id}`);
    if (storedIncludes) {
      try { setSupplierIncludes(JSON.parse(storedIncludes)); } catch { /* ignore */ }
    }
    // Load cost history
    const storedCostHistory = localStorage.getItem(`beautypos_cost_history_${id}`);
    if (storedCostHistory) {
      try { setCostHistory(JSON.parse(storedCostHistory)); } catch { /* ignore */ }
    }
    // Load cost modes/pcts (EUR vs %)
    const storedCostModes = localStorage.getItem(`beautypos_cost_modes_${id}`);
    if (storedCostModes) {
      try { setCostModes(JSON.parse(storedCostModes)); } catch { /* ignore */ }
    }
    const storedCostPcts = localStorage.getItem(`beautypos_cost_pcts_${id}`);
    if (storedCostPcts) {
      try { setCostPcts(JSON.parse(storedCostPcts)); } catch { /* ignore */ }
    }
  }, [id]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [o, h] = await Promise.all([
        supplierOrderService.getById(id),
        supplierOrderService.getStatusHistory(id),
      ]);
      setOrder(o);
      setHistory(h);
      if (o) {
        setCosts({
          transport: o.transportCost, customs: o.customsCost, vat: o.vatImport,
          freight: o.freightForwarderCost, bank: o.bankFees, exchange: o.exchangeFees,
          local: o.localDelivery, other: o.otherCosts,
        });
        setCostMethod(o.costMethod);
        // Generate upload link (token is always available via API)
        if (o.invoiceUploadToken) {
          const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';
          setUploadLink(`${siteUrl}/depot-facture/${o.invoiceUploadToken}`);
        } else if (id) {
          // Auto-fetch token (deterministic, no DB column required)
          fetch(`/api/fo-orders/${id}/generate-upload-token`, { method: 'POST' })
            .then(r => r.ok ? r.json() : null)
            .then(json => {
              if (json?.token) {
                const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';
                setUploadLink(`${siteUrl}/depot-facture/${json.token}`);
              }
            })
            .catch(() => {});
        }
        // Load saved structure pct for this order if exists
        const savedPct = localStorage.getItem(`beautypos_structure_pct_${id}`);
        if (savedPct !== null) setStructurePct(parseFloat(savedPct));
        // Init received quantities and real prices per line
        if (o.lines) {
          const rq: Record<string, number> = {};
          const rp: Record<string, string> = {};
          o.lines.forEach(l => {
            rq[l.id] = l.qtyReceived || 0;
            rp[l.id] = l.confirmedUnitPrice != null ? String(l.confirmedUnitPrice) : String(l.unitPrice || '');
          });
          setReceivedQtys(rq);
          setRealPrices(rp);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-backfill product images silently on first load (fixes supplier portal too)
  useEffect(() => {
    if (backfilledImages || !id || loading) return;
    setBackfilledImages(true);
    fetch(`/api/fo-orders/${id}/backfill-images`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => { if (data.updated > 0) load(); })
      .catch(() => {});
  }, [backfilledImages, id, loading, load]);

  const updateStockForReception = useCallback(async (qtysToAdd: Record<string, number>) => {
    if (!order) return;
    const supabase = createClient();

    // DB-level idempotency guard — fresh fetch so it works after reloads and on any device
    const { data: freshOrder } = await supabase
      .from('fo_orders').select('stock_updated').eq('id', order.id).single();
    if (freshOrder?.stock_updated) {
      setStockUpdateBanner('⚠️ Stock déjà mis à jour pour cette commande');
      setTimeout(() => setStockUpdateBanner(null), 5000);
      return;
    }

    setUpdatingStock(true);
    let updatedCount = 0;
    const shopifySyncItems: Array<{ productId: string; delta: number }> = [];
    for (const line of (order.lines || [])) {
      const qty = qtysToAdd[line.id] || 0;
      if (qty <= 0) continue;
      const { data: product } = await supabase
        .from('products').select('id, stock').eq('ref', line.productRef).maybeSingle();
      if (!product) continue;
      const stockBefore = Number(product.stock) || 0;
      const stockAfter = stockBefore + qty;
      await supabase.from('products').update({ stock: stockAfter, updated_at: new Date().toISOString() }).eq('id', product.id);
      if (line.color) {
        const { data: varRow } = await supabase
          .from('product_color_stock').select('id, quantity')
          .eq('product_id', product.id).ilike('color_name', line.color).maybeSingle();
        if (varRow) {
          await supabase.from('product_color_stock').update({ quantity: Number(varRow.quantity || 0) + qty }).eq('id', varRow.id);
        }
      }
      try {
        await supabase.from('stock_movements').insert({
          product_id: product.id, type: 'reception',
          reason: `Commande fournisseur ${order.orderNumber}`,
          quantity: qty, stock_before: stockBefore, stock_after: stockAfter,
        });
      } catch { /* non-blocking if table schema differs */ }
      shopifySyncItems.push({ productId: product.id, delta: qty });
      updatedCount++;
    }

    // Mark as done in DB — prevents any subsequent call from running again
    await supabase.from('fo_orders').update({
      stock_updated: true,
      stock_updated_at: new Date().toISOString(),
    }).eq('id', order.id);

    // Non-blocking Shopify inventory sync
    if (shopifySyncItems.length > 0) {
      fetch('/api/shopify/sync-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: shopifySyncItems }),
      }).catch(() => {});
    }

    setUpdatingStock(false);
    setStockUpdateBanner(`✅ Stock mis à jour — ${updatedCount} produit${updatedCount > 1 ? 's' : ''} réapprovisionnés`);
    setTimeout(() => setStockUpdateBanner(null), 6000);
  }, [order]);

  const handleStatusChange = async () => {
    if (!targetStatus || !order) return;
    await supplierOrderService.changeStatus(order.id, targetStatus, 'Caisse', statusComment || undefined);
    if (targetStatus === 'fully_received') {
      const qtys: Record<string, number> = {};
      (order.lines || []).forEach(l => { qtys[l.id] = l.qtyOrdered; });
      await updateStockForReception(qtys);
    } else if (targetStatus === 'partially_received') {
      const qtys: Record<string, number> = {};
      (order.lines || []).forEach(l => { qtys[l.id] = receivedQtys[l.id] ?? l.qtyReceived ?? 0; });
      await updateStockForReception(qtys);
    }
    setShowStatusModal(false);
    setStatusComment('');
    setTargetStatus(null);
    load();
  };

  const handleSaveCosts = async () => {
    if (!order) return;
    setSavingCosts(true);

    const getEC = (key: string): number =>
      costModes[key] === 'pct' ? order.subtotal * (costPcts[key] || 0) / 100 : (costs as any)[key] || 0;

    const importCost = order.subtotal + getEC('transport') + getEC('customs') + getEC('vat') + getEC('freight') + getEC('bank') + getEC('exchange') + getEC('local') + getEC('other');

    // Record structure history if pct changed
    const prevPct = parseFloat(localStorage.getItem(`beautypos_structure_pct_${order.id}`) || '0');
    if (prevPct !== structurePct) {
      const entry: StructureHistoryEntry = {
        date: new Date().toISOString(),
        oldPct: prevPct,
        newPct: structurePct,
        oldImportCost: importCost,
        newBusinessCost: importCost, // structure is info only, not added to cost
        changedBy: 'Caisse',
      };
      const newHistory = [...structureHistory, entry];
      setStructureHistory(newHistory);
      localStorage.setItem(`beautypos_structure_history_${order.id}`, JSON.stringify(newHistory));
    }
    localStorage.setItem(`beautypos_structure_pct_${order.id}`, String(structurePct));
    // Save supplier includes + cost modes
    localStorage.setItem(`beautypos_supplier_includes_${order.id}`, JSON.stringify(supplierIncludes));
    localStorage.setItem(`beautypos_cost_modes_${order.id}`, JSON.stringify(costModes));
    localStorage.setItem(`beautypos_cost_pcts_${order.id}`, JSON.stringify(costPcts));

    // Record cost history per product line
    const lines = order.lines || [];
    const totalQty = lines.reduce((s, l) => s + l.qtyOrdered, 0);
    const avgCostPerProduct = totalQty > 0 ? importCost / totalQty : 0;
    const newCostEntries: CostHistoryEntry[] = lines.map((line) => {
      const lineWeight = totalQty > 0 ? line.qtyOrdered / totalQty : 0;
      const newUnitCost = avgCostPerProduct;
      const oldUnitCost = line.unitRealCost || line.unitPrice;
      const oldMargin = line.salePrice > 0 ? ((line.salePrice - oldUnitCost) / line.salePrice) * 100 : 0;
      const newMargin = line.salePrice > 0 ? ((line.salePrice - newUnitCost) / line.salePrice) * 100 : 0;
      return {
        date: new Date().toISOString(),
        productRef: line.productRef ?? '',
        productName: line.productName,
        oldCost: oldUnitCost,
        newCost: newUnitCost,
        oldMargin,
        newMargin,
        oldSellPrice: line.salePrice,
        newSellPrice: line.salePrice,
        orderId: order.id,
        supplierName: order.supplierName || '',
        changedBy: 'Caisse',
      };
    });
    const allCostHistory = [...costHistory, ...newCostEntries];
    setCostHistory(allCostHistory);
    localStorage.setItem(`beautypos_cost_history_${order.id}`, JSON.stringify(allCostHistory));

    await supplierOrderService.update(order.id, {
      transportCost: getEC('transport'), customsCost: getEC('customs'), vatImport: getEC('vat'),
      freightForwarderCost: getEC('freight'), bankFees: getEC('bank'), exchangeFees: getEC('exchange'),
      localDelivery: getEC('local'), otherCosts: getEC('other'),
      totalRealCost: importCost, costMethod, costsValidated: true,
      orderStatus: 'costs_recorded',
    });

    setSavingCosts(false);
    load();
  };

  const handleSavePayment = async () => {
    if (!order) return;
    setSavingPayment(true);
    const amt = parseFloat(paymentAmount) || 0;

    // Calculate supplierPaymentAmount inline here using effective costs
    const getECLocal = (key: string): number =>
      costModes[key] === 'pct' ? order.subtotal * (costPcts[key] || 0) / 100 : (costs as any)[key] || 0;
    const supplierExtraFeesLocal =
      (supplierIncludes.transport ? getECLocal('transport') : 0) +
      (supplierIncludes.customs ? getECLocal('customs') : 0) +
      (supplierIncludes.vat ? getECLocal('vat') : 0) +
      (supplierIncludes.freight ? getECLocal('freight') : 0) +
      (supplierIncludes.bank ? getECLocal('bank') : 0) +
      (supplierIncludes.exchange ? getECLocal('exchange') : 0) +
      (supplierIncludes.local ? getECLocal('local') : 0) +
      (supplierIncludes.other ? getECLocal('other') : 0);
    const supplierPaymentAmountLocal = order.subtotal + supplierExtraFeesLocal;

    const newBalance = Math.max(0, supplierPaymentAmountLocal - amt);
    const newStatus = amt >= supplierPaymentAmountLocal ? 'paid' : amt > 0 ? 'partial' : 'pending';
    await supplierOrderService.update(order.id, {
      paymentAmount: amt,
      balanceDue: newBalance,
      paymentStatus: newStatus,
      paymentMethod,
      paymentDate: paymentDate || undefined,
      orderStatus: newStatus === 'paid' ? 'paid' : order.orderStatus,
    });
    // Sync payment to fo_orders portal so supplier sees it
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      // Find matching fo_order by order number
      const { data: foOrders } = await supabase
        .from('fo_orders')
        .select('id')
        .eq('order_number', order.orderNumber)
        .limit(1);
      if (foOrders && foOrders.length > 0) {
        await supabase.from('fo_orders').update({
          payment_amount: amt,
          payment_status: newStatus,
          payment_method: paymentMethod,
          payment_date: paymentDate || null,
          order_status: newStatus === 'paid' ? 'paid' : undefined,
          updated_at: new Date().toISOString(),
        }).eq('id', foOrders[0].id);
      }
    } catch (syncErr) {
      console.warn('Portal payment sync failed (non-blocking):', syncErr);
    }
    setSavingPayment(false);
    load();
  };

  const handleQuickPriceEdit = (lineId: string, currentPrice: number) => {
    setEditingPriceLineId(lineId);
    setNewSellPrice(currentPrice.toFixed(2));
  };

  const handleSaveQuickPrice = async (line: any) => {
    if (!order || !editingPriceLineId) return;
    setSavingPrice(true);
    const newPrice = parseFloat(newSellPrice) || 0;
    const oldPrice = line.salePrice;

    // Calculate avgCostPerProduct inline here using effective costs
    const getECQ = (key: string): number =>
      costModes[key] === 'pct' ? order.subtotal * (costPcts[key] || 0) / 100 : (costs as any)[key] || 0;
    const totalFeesLocal = getECQ('transport') + getECQ('customs') + getECQ('vat') + getECQ('freight') + getECQ('bank') + getECQ('exchange') + getECQ('local') + getECQ('other');
    const importCostLocal = order.subtotal + totalFeesLocal;
    const linesLocal = order.lines || [];
    const totalQtyLocal = linesLocal.reduce((s, l) => s + l.qtyOrdered, 0);
    const avgCostPerProductLocal = totalQtyLocal > 0 ? importCostLocal / totalQtyLocal : 0;

    const newUnitCost = line.unitRealCost || avgCostPerProductLocal;
    const oldMargin = oldPrice > 0 ? ((oldPrice - newUnitCost) / oldPrice) * 100 : 0;
    const newMargin = newPrice > 0 ? ((newPrice - newUnitCost) / newPrice) * 100 : 0;

    // Record in cost history
    const entry: CostHistoryEntry = {
      date: new Date().toISOString(),
      productRef: line.productRef,
      productName: line.productName,
      oldCost: newUnitCost,
      newCost: newUnitCost,
      oldMargin,
      newMargin,
      oldSellPrice: oldPrice,
      newSellPrice: newPrice,
      orderId: order.id,
      supplierName: order.supplierName || '',
      changedBy: 'Caisse',
    };
    const allCostHistory = [...costHistory, entry];
    setCostHistory(allCostHistory);
    localStorage.setItem(`beautypos_cost_history_${order.id}`, JSON.stringify(allCostHistory));

    // ── Sync new price to Supabase products table ──
    try {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();

      // Find product by ref
      const { data: productData } = await supabase
        .from('products')
        .select('id, sell_price_ht, sell_price_ttc, buy_price, transport, customs, other_fees')
        .eq('ref', line.productRef)
        .maybeSingle();

      if (productData) {
        const tvaRate = 8.5;
        const newSellPriceHT = newPrice / (1 + tvaRate / 100);
        const newSellPriceTTC = newPrice;

        // Update product price in DB
        await supabase.from('products').update({
          sell_price_ht: newSellPriceHT,
          sell_price_ttc: newSellPriceTTC,
          updated_at: new Date().toISOString(),
        }).eq('id', productData.id);

        // Record price change history
        const oldSellPriceHT = productData.sell_price_ht || 0;
        const costPrice = (productData.buy_price || 0) + (productData.transport || 0) + (productData.customs || 0) + (productData.other_fees || 0);
        const oldMarginPct = oldSellPriceHT > 0 ? ((oldSellPriceHT - costPrice) / oldSellPriceHT) * 100 : 0;
        const newMarginPct = newSellPriceHT > 0 ? ((newSellPriceHT - costPrice) / newSellPriceHT) * 100 : 0;

        await supabase.from('product_price_history').insert({
          product_id: productData.id,
          product_ref: line.productRef,
          product_name: line.productName,
          old_sell_price_ht: oldSellPriceHT,
          new_sell_price_ht: newSellPriceHT,
          old_sell_price_ttc: productData.sell_price_ttc || 0,
          new_sell_price_ttc: newSellPriceTTC,
          old_margin_pct: oldMarginPct,
          new_margin_pct: newMarginPct,
          old_margin_amount: oldSellPriceHT - costPrice,
          new_margin_amount: newSellPriceHT - costPrice,
          supplier_order_id: order.id,
          changed_by: 'Caisse',
          change_reason: 'profitability_adjustment',
        });
      }
    } catch (syncErr) {
      console.warn('Price sync to products failed (non-blocking):', syncErr);
    }

    setSavingPrice(false);
    setEditingPriceLineId(null);
    setNewSellPrice('');
    load();
  };

  const handleBulkUpdate = async () => {
    if (!order) return;
    setBulkUpdating(true);
    // Simulate bulk update of all products with new costs
    const lines = order.lines || [];

    // Calculate avgCostPerProduct inline here using effective costs
    const getECB = (key: string): number =>
      costModes[key] === 'pct' ? order.subtotal * (costPcts[key] || 0) / 100 : (costs as any)[key] || 0;
    const totalFeesLocal2 = getECB('transport') + getECB('customs') + getECB('vat') + getECB('freight') + getECB('bank') + getECB('exchange') + getECB('local') + getECB('other');
    const importCostLocal2 = order.subtotal + totalFeesLocal2;
    const totalQtyLocal2 = lines.reduce((s, l) => s + l.qtyOrdered, 0);
    const avgCostPerProductLocal2 = totalQtyLocal2 > 0 ? importCostLocal2 / totalQtyLocal2 : 0;

    const productUpdates = JSON.parse(localStorage.getItem('beautypos_bulk_cost_updates') || '{}');
    lines.forEach((line) => {
      productUpdates[line.productRef ?? ''] = {
        newCost: avgCostPerProductLocal2,
        newMargin: line.salePrice > 0 ? ((line.salePrice - avgCostPerProductLocal2) / line.salePrice) * 100 : 0,
        updatedAt: new Date().toISOString(),
        orderId: order.id,
        supplierName: order.supplierName,
      };
    });
    localStorage.setItem('beautypos_bulk_cost_updates', JSON.stringify(productUpdates));
    await new Promise((r) => setTimeout(r, 1200));
    setBulkUpdating(false);
    setBulkUpdateDone(true);
    setTimeout(() => setBulkUpdateDone(false), 4000);
  };

  const enterEditMode = () => {
    if (!order) return;
    setEditedLines(order.lines ? [...order.lines] : []);
    setEditNotes(order.notes || '');
    setEditTransport(order.transportCost);
    setEditCustoms(order.customsCost);
    setEditMode(true);
    setTab('lines');
  };

  const handleEditLineChange = (lineId: string, field: 'qtyOrdered' | 'unitPrice', value: number) => {
    setEditedLines((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, [field]: value, lineTotal: field === 'qtyOrdered' ? value * l.unitPrice : l.qtyOrdered * value }
          : l
      )
    );
  };

  const handleRemoveEditLine = (lineId: string) => {
    setEditedLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const searchProducts = async (q: string) => {
    if (!q.trim()) { setProductResults([]); return; }
    setSearchingProducts(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('products')
      .select('id, name, ref, buy_price, sell_price_ttc, image_url')
      .ilike('name', `%${q}%`)
      .limit(10);
    setProductResults(data || []);
    setSearchingProducts(false);
  };

  const handleAddProductToOrder = (product: any) => {
    const newLine: FoOrderLine = {
      id: `new-${Date.now()}`,
      orderId: order?.id ?? '',
      productId: product.id,
      productName: product.name,
      productRef: product.ref ?? '',
      productImageUrl: product.image_url ?? undefined,
      qtyOrdered: 1,
      qtyReceived: 0,
      unitPrice: product.buy_price ?? 0,
      lineTotal: product.buy_price ?? 0,
      unitTransport: 0, unitCustoms: 0, unitVatImport: 0, unitFreight: 0, unitOther: 0,
      unitRealCost: 0, salePrice: product.sell_price_ttc ?? 0,
      grossMargin: 0, marginRate: 0, previousCost: 0,
      qtyMissing: 0, qtyDamaged: 0, weightKg: 0, volumeM3: 0, customCostShare: 0,
    };
    setEditedLines((prev) => [...prev, newLine]);
    setShowAddLineModal(false);
    setProductSearch('');
    setProductResults([]);
  };

  const handleSaveEdit = async () => {
    if (!order) return;
    setSavingEdit(true);
    setSaveEditError(null);
    try {
      const newSubtotal = editedLines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);
      const newTotalRealCost = newSubtotal
        + (editTransport || 0)
        + (editCustoms || 0)
        + (order.vatImport || 0)
        + (order.freightForwarderCost || 0)
        + (order.bankFees || 0)
        + (order.exchangeFees || 0)
        + (order.localDelivery || 0)
        + (order.otherCosts || 0);

      const res = await fetch(`/api/fo-orders/${order.id}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: editedLines,
          originalLineIds: order.lines?.map((l) => l.id) ?? [],
          subtotal: newSubtotal,
          totalRealCost: newTotalRealCost,
          notes: editNotes,
          transportCost: editTransport,
          customsCost: editCustoms,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSaveEditError(err.error || 'Erreur lors de l\'enregistrement');
        return;
      }

      setEditMode(false);
      load();
    } catch {
      setSaveEditError('Erreur réseau lors de l\'enregistrement');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSendOrder = async () => {
    if (!order) return;
    setSendingOrder(true);
    // Generate upload token if not already done
    try {
      const res = await fetch(`/api/fo-orders/${order.id}/generate-upload-token`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (json.token) {
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';
        setUploadLink(`${siteUrl}/depot-facture/${json.token}`);
      }
    } catch { /* non-blocking */ }
    await supplierOrderService.changeStatus(order.id, 'sent', 'Admin', 'Commande envoyée au fournisseur');
    setSendingOrder(false);
    load();
  };

  const handleGenerateLink = async () => {
    if (!order) return;
    const res = await fetch(`/api/fo-orders/${order.id}/generate-upload-token`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (json.token) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://lmdecaisse.com';
      setUploadLink(`${siteUrl}/depot-facture/${json.token}`);
    }
  };

  const handleCopyLink = () => {
    if (!uploadLink) return;
    navigator.clipboard.writeText(uploadLink).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleSaveInvoicePrices = async () => {
    if (!order) return;
    setSavingPrices(true);
    try {
      const prices = lines.map(l => ({
        lineId: l.id,
        confirmedUnitPrice: parseFloat(realPrices[l.id] || '0') || 0,
      })).filter(p => p.confirmedUnitPrice > 0);
      const res = await fetch(`/api/fo-orders/${order.id}/save-invoice-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      if (res.ok) {
        setPricesSaved(true);
        setTimeout(() => setPricesSaved(false), 3000);
      }
    } finally {
      setSavingPrices(false);
    }
  };

  const handleFullReception = async () => {
    if (!order) return;
    await supplierOrderService.changeStatus(order.id, 'fully_received', 'Caisse', 'Réception totale');
    const qtys: Record<string, number> = {};
    (order.lines || []).forEach(l => { qtys[l.id] = l.qtyOrdered; });
    await updateStockForReception(qtys);
    load();
  };

  const handlePartialReception = async () => {
    if (!order) return;
    await supplierOrderService.changeStatus(order.id, 'partially_received', 'Caisse', 'Réception partielle');
    const qtys = { ...receivedQtys };
    await updateStockForReception(qtys);
    load();
  };

  const handleOpenOrderLabels = async () => {
    if (!order?.lines?.length) return;
    setOrderLabelLoading(true);
    try {
      const supabase = createClient();
      // Batch-fetch barcodes for all distinct product refs in this order
      const uniqueRefs = [...new Set(order.lines.map(l => l.productRef).filter(Boolean))];
      const { data: prodRows } = await supabase
        .from('products')
        .select('ref, barcode')
        .in('ref', uniqueRefs);
      const barcodeByRef: Record<string, string> = {};
      (prodRows || []).forEach((r: any) => {
        if (r.barcode) barcodeByRef[r.ref] = r.barcode;
      });

      const labelProds: ProductRecord[] = order.lines.map((line) => ({
        id: line.id,
        name: line.productName,
        variantName: line.color || line.variant || line.size || '',
        ref: line.productRef,
        barcode: (line.productRef ? barcodeByRef[line.productRef] : undefined) || line.productRef || line.id,
        category: '',
        sellPriceTTC: line.salePrice || 0,
        stock: line.qtyOrdered,
        minStock: 0,
        imageUrl: line.productImageUrl || '',
        variants: false,
        shopify: false,
        supplier: order.supplierName || '',
        buyPrice: line.unitPrice || 0,
        costPrice: line.unitPrice || 0,
        sellPriceHT: line.salePrice || 0,
        marginAmount: 0,
        marginPct: 0,
        status: 'active' as const,
      } as ProductRecord));

      const qtys: Record<string, number> = {};
      order.lines.forEach((line) => { qtys[line.id] = line.qtyOrdered; });

      setOrderLabelProducts(labelProds);
      setOrderLabelInitialQtys(qtys);
      setShowOrderLabelModal(true);
    } finally {
      setOrderLabelLoading(false);
    }
  };

  const handleValidatePrices = async () => {
    if (!order) return;
    setValidatingPrices(true);
    setValidatePricesResult(null);
    try {
      const res = await fetch(`/api/fo-orders/${order.id}/validate-prices`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setValidatePricesResult(`Erreur : ${err.error || 'inconnue'}`);
      } else {
        const data = await res.json();
        setValidatePricesResult(`✅ ${data.updatedCount} prix achat mis à jour`);
        load();
      }
    } catch {
      setValidatePricesResult('Erreur réseau');
    } finally {
      setValidatingPrices(false);
    }
  };

  const handleMarkPaid = async () => {
    if (!order) return;
    setMarkingPaid(true);
    try {
      await supplierOrderService.changeStatus(order.id, 'paid', 'Admin', 'Commande marquée comme payée');
      load();
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleExportPDF = async () => {
    if (!order) return;
    setExportingPDF(true);
    try {
      await exportPurchaseOrderPDF(order, order.lines || []);
    } finally {
      setExportingPDF(false);
    }
  };

  if (loading) return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    </AppLayout>
  );

  if (!order) return (
    <AppLayout>
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Commande introuvable</p>
        <button onClick={() => router.back()} className="mt-3 text-primary text-sm underline">Retour</button>
      </div>
    </AppLayout>
  );

  // ─── CALCULATIONS ───────────────────────────────────────────────────────────

  // Effective cost helper: if mode is '%', compute EUR from subtotal × pct
  const getEC = (key: string): number =>
    costModes[key] === 'pct' ? order.subtotal * (costPcts[key] || 0) / 100 : (costs as any)[key] || 0;

  // Currency conversion: when order is in USD (or non-EUR), show EUR equivalents
  // exchangeRate = EUR per 1 unit of currency (e.g. 1 USD × 0.92 = 0.92 EUR)
  const showEUR = order.currency !== 'EUR' && order.exchangeRate > 0;
  const toEUR = (amount: number) => showEUR ? amount * order.exchangeRate : amount;

  // Supplier payment amount = products + only the cost lines checked as "include in supplier payment"
  const supplierExtraFees =
    (supplierIncludes.transport ? getEC('transport') : 0) +
    (supplierIncludes.customs ? getEC('customs') : 0) +
    (supplierIncludes.vat ? getEC('vat') : 0) +
    (supplierIncludes.freight ? getEC('freight') : 0) +
    (supplierIncludes.bank ? getEC('bank') : 0) +
    (supplierIncludes.exchange ? getEC('exchange') : 0) +
    (supplierIncludes.local ? getEC('local') : 0) +
    (supplierIncludes.other ? getEC('other') : 0);
  const supplierPaymentAmount = order.subtotal + supplierExtraFees;

  // Real import cost = products + all external fees (transport, customs, etc.)
  // Structure is overhead info only — never added to totals
  const totalFees = getEC('transport') + getEC('customs') + getEC('vat') + getEC('freight') + getEC('bank') + getEC('exchange') + getEC('local') + getEC('other');
  const importCost = order.subtotal + totalFees;
  const structureAmount = importCost * (structurePct / 100); // info only

  const lines = order.lines || [];
  const totalQty = lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const avgCostPerProduct = totalQty > 0 ? importCost / totalQty : 0;
  const totalSalePrice = lines.reduce((s, l) => s + l.salePrice * l.qtyOrdered, 0);
  const grossMarginAmt = totalSalePrice > 0 ? totalSalePrice - importCost : 0;
  const grossMarginPct = totalSalePrice > 0 ? (grossMarginAmt / totalSalePrice) * 100 : 0;
  const netMarginPct = grossMarginPct - structurePct; // estimated after overhead, display only

  // Payment tracking uses supplierPaymentAmount (NOT businessCost)
  const amountPaid = order.paymentAmount || 0;
  const balanceDue = Math.max(0, supplierPaymentAmount - amountPaid);
  const paymentStatusLabel =
    amountPaid >= supplierPaymentAmount && supplierPaymentAmount > 0 ? 'Payé' :
    amountPaid > 0 ? 'Paiement partiel': 'En attente';
  const paymentStatusColor =
    amountPaid >= supplierPaymentAmount && supplierPaymentAmount > 0 ? 'bg-emerald-50 text-emerald-700' :
    amountPaid > 0 ? 'bg-amber-50 text-amber-700': 'bg-gray-100 text-gray-700';

  const COST_LINES: { key: keyof typeof costs; label: string }[] = [
    { key: 'transport', label: 'Transport' },
    { key: 'customs', label: 'Douane' },
    { key: 'vat', label: 'TVA import' },
    { key: 'freight', label: 'Transitaire' },
    { key: 'bank', label: 'Frais bancaires' },
    { key: 'exchange', label: 'Frais de change' },
    { key: 'local', label: 'Livraison locale' },
    { key: 'other', label: 'Autres frais' },
  ];

  const TABS: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Aperçu', icon: 'EyeIcon' },
    { id: 'lines', label: 'Produits', icon: 'ShoppingBagIcon' },
    { id: 'reception', label: 'Réception', icon: 'ArchiveBoxIcon' },
    { id: 'costs', label: 'Frais réels', icon: 'BanknotesIcon' },
    { id: 'margins', label: 'Marges', icon: 'ChartBarIcon' },
    { id: 'payment', label: 'Paiement', icon: 'CreditCardIcon' },
    { id: 'history', label: 'Historique', icon: 'ClockIcon' },
  ];

  // Helper: get margin alert for a line
  const getMarginAlert = (unitCost: number, salePrice: number) => {
    if (salePrice <= 0) return null;
    const margin = ((salePrice - unitCost) / salePrice) * 100;
    if (margin < 0) return { level: 'negative', label: '🔴 Marge négative', color: 'bg-red-50 border-red-200 text-red-700' };
    if (margin < 15) return { level: 'loss', label: '⚠️ Vendu à perte estimée', color: 'bg-red-50 border-red-200 text-red-700' };
    if (margin < 30) return { level: 'low', label: '🟡 Marge faible', color: 'bg-amber-50 border-amber-200 text-amber-700' };
    return null;
  };

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="ArrowLeftIcon" size={18} />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-700 text-foreground">{order.orderNumber}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-600 ${STATUS_COLORS[order.orderStatus] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABELS[order.orderStatus]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{order.supplierName} · Créée le {new Date(order.createdAt).toLocaleDateString('fr-FR')}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {!['paid', 'cancelled', 'closed'].includes(order.orderStatus) && !editMode && (
              <button
                onClick={enterEditMode}
                className="flex items-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg text-sm font-500 hover:bg-primary/5 transition-colors"
              >
                <Icon name="PencilIcon" size={15} />
                Modifier
              </button>
            )}
            {order.orderStatus === 'draft' && (
              <button
                onClick={handleSendOrder}
                disabled={sendingOrder}
                className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {sendingOrder ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="PaperAirplaneIcon" size={15} />
                )}
                Envoyer au fournisseur
              </button>
            )}
            <button
              onClick={handleExportPDF}
              disabled={exportingPDF}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors disabled:opacity-50"
            >
              {exportingPDF ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="ArrowDownTrayIcon" size={15} />
              )}
              PDF
            </button>
            {/* Lien dépôt facture */}
            {uploadLink ? (
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-2 px-3 py-2 border border-violet-300 text-violet-700 bg-violet-50 rounded-lg text-sm font-500 hover:bg-violet-100 transition-colors"
                title={uploadLink}
              >
                <Icon name={copiedLink ? 'CheckIcon' : 'LinkIcon'} size={15} />
                {copiedLink ? 'Lien copié !' : 'Copier lien facture'}
              </button>
            ) : (
              <button
                onClick={handleGenerateLink}
                className="flex items-center gap-2 px-3 py-2 border border-dashed border-violet-300 text-violet-600 rounded-lg text-sm font-500 hover:bg-violet-50 transition-colors"
              >
                <Icon name="LinkIcon" size={15} />
                Générer lien dépôt
              </button>
            )}
            <button
              onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={15} />
              Changer statut
            </button>
          </div>
        </div>

        {/* Bannière facture reçue */}
        {order.invoiceReceivedAt && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-xl">📥</span>
            <div className="flex-1">
              <p className="text-sm font-700 text-emerald-800">Facture fournisseur reçue</p>
              <p className="text-xs text-emerald-600">
                {new Date(order.invoiceReceivedAt).toLocaleString('fr-FR')}
              </p>
            </div>
            {order.supplierInvoiceUrl && (
              <a
                href={order.supplierInvoiceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-600 hover:bg-emerald-700 transition-colors"
              >
                <Icon name="DocumentArrowDownIcon" size={13} />
                Voir la facture
              </a>
            )}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-500 border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon name={t.icon as any} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Price validation panel — shown when supplier has confirmed prices */}
        {tab === 'overview' && order.orderStatus === 'awaiting_validation' && (
          <div className="mb-5 bg-blue-50 border border-blue-200 rounded-xl overflow-hidden shadow-card">
            <div className="px-5 py-4 border-b border-blue-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Icon name="CheckBadgeIcon" size={16} className="text-blue-700" />
                </div>
                <div>
                  <h3 className="font-700 text-blue-900 text-sm">Validation des tarifs fournisseur</h3>
                  <p className="text-xs text-blue-600 mt-0.5">Le fournisseur a confirmé ses prix. Vérifiez et validez pour mettre à jour les prix d'achat.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {validatePricesResult && (
                  <span className={`text-xs px-3 py-1.5 rounded-lg font-600 ${validatePricesResult.startsWith('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                    {validatePricesResult}
                  </span>
                )}
                <button
                  onClick={handleValidatePrices}
                  disabled={validatingPrices}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white text-sm font-600 rounded-lg hover:bg-blue-800 transition-colors disabled:opacity-50"
                >
                  {validatingPrices ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon name="CheckIcon" size={14} />
                  )}
                  Valider les tarifs
                </button>
                <button
                  onClick={handleMarkPaid}
                  disabled={markingPaid}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {markingPaid ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Icon name="BanknotesIcon" size={14} />
                  )}
                  Marquer payée
                </button>
              </div>
            </div>
            {/* Comparison table */}
            {lines.some((l) => l.confirmedUnitPrice != null) ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-blue-100/60">
                      <th className="px-4 py-2.5 text-left text-xs font-600 text-blue-800">Produit</th>
                      <th className="px-4 py-2.5 text-right text-xs font-600 text-blue-800">Qté</th>
                      <th className="px-4 py-2.5 text-right text-xs font-600 text-blue-800">Ancien prix</th>
                      <th className="px-4 py-2.5 text-right text-xs font-600 text-blue-800">Prix confirmé</th>
                      <th className="px-4 py-2.5 text-right text-xs font-600 text-blue-800">Écart</th>
                      <th className="px-4 py-2.5 text-right text-xs font-600 text-blue-800">Total ligne</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-100">
                    {lines.map((line) => {
                      const confirmed = line.confirmedUnitPrice ?? line.unitPrice;
                      const diff = confirmed - line.unitPrice;
                      const diffPct = line.unitPrice > 0 ? (diff / line.unitPrice) * 100 : 0;
                      return (
                        <tr key={line.id} className="bg-white/70 hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3">
                            <p className="font-500 text-foreground text-xs">{line.productName}</p>
                            {line.productRef && <p className="text-[11px] text-muted-foreground font-mono">{line.productRef}</p>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-500">{line.qtyOrdered}</td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{line.unitPrice.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-xs font-700 text-blue-800">
                            {line.confirmedUnitPrice != null ? `${line.confirmedUnitPrice.toFixed(2)} €` : <span className="text-muted-foreground italic">non confirmé</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-600">
                            {line.confirmedUnitPrice != null ? (
                              <span className={diff > 0 ? 'text-red-600' : diff < 0 ? 'text-emerald-600' : 'text-gray-400'}>
                                {diff > 0 ? '+' : ''}{diff.toFixed(2)} € ({diffPct > 0 ? '+' : ''}{diffPct.toFixed(1)}%)
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-700">
                            {(confirmed * line.qtyOrdered).toFixed(2)} €
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-blue-100/60 font-700">
                      <td className="px-4 py-2.5 text-xs text-blue-800" colSpan={5}>Total confirmé</td>
                      <td className="px-4 py-2.5 text-right text-sm text-blue-900">
                        {lines.reduce((s, l) => s + (l.confirmedUnitPrice ?? l.unitPrice) * l.qtyOrdered, 0).toFixed(2)} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="px-5 py-6 text-center text-sm text-blue-600">
                Aucun prix confirmé pour le moment.
              </div>
            )}
          </div>
        )}

        {/* Mark as paid quick action for validated orders */}
        {tab === 'overview' && order.orderStatus === 'validated' && (
          <div className="mb-5 flex items-center justify-between gap-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Icon name="CheckBadgeIcon" size={16} className="text-emerald-700" />
              </div>
              <div>
                <p className="font-600 text-emerald-900 text-sm">Commande validée — tarifs mis à jour</p>
                <p className="text-xs text-emerald-600 mt-0.5">Procédez au paiement fournisseur pour finaliser.</p>
              </div>
            </div>
            <button
              onClick={handleMarkPaid}
              disabled={markingPaid}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {markingPaid ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Icon name="BanknotesIcon" size={14} />
              )}
              Marquer comme payée
            </button>
          </div>
        )}

        {/* Overview */}
        {tab === 'overview' && (
          <div className="space-y-5">

            {/* Notes & Réservation client — section principale */}
            <div className={`rounded-xl border shadow-card overflow-hidden ${(order.notes || order.internalNotes) ? 'bg-amber-50 border-amber-200' : 'bg-white border-border'}`}>
              <div className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(order.notes || order.internalNotes) ? 'bg-amber-100' : 'bg-muted'}`}>
                    <Icon name="DocumentTextIcon" size={16} className={(order.notes || order.internalNotes) ? 'text-amber-700' : 'text-muted-foreground'} />
                  </div>
                  <div>
                    <h3 className={`font-700 text-sm ${(order.notes || order.internalNotes) ? 'text-amber-900' : 'text-foreground'}`}>Note client / Réservation</h3>
                    {!(order.notes || order.internalNotes) && <p className="text-xs text-muted-foreground mt-0.5">Aucune note pour cette commande</p>}
                  </div>
                </div>
                {!editingNotes && (
                  <button
                    onClick={() => { setEditNotesVal(order.notes || ''); setEditingNotes(true); }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${(order.notes || order.internalNotes) ? 'hover:bg-amber-100 text-amber-700' : 'hover:bg-muted text-muted-foreground'}`}
                  >
                    <Icon name="PencilIcon" size={13} />
                    {(order.notes || order.internalNotes) ? 'Modifier' : 'Ajouter une note'}
                  </button>
                )}
              </div>
              {(order.notes || order.internalNotes) && !editingNotes && (
                <div className="px-5 pb-5 space-y-3 border-t border-amber-200">
                  {order.notes && (
                    <div className="pt-3">
                      <p className="text-xs font-700 text-amber-700 uppercase tracking-wide mb-1.5">Note commande</p>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{order.notes}</p>
                    </div>
                  )}
                  {order.internalNotes && (
                    <div className={order.notes ? 'pt-2 border-t border-amber-200' : 'pt-3'}>
                      <p className="text-xs font-700 text-amber-700 uppercase tracking-wide mb-1.5">Note interne</p>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">{order.internalNotes}</p>
                    </div>
                  )}
                </div>
              )}
              {editingNotes && (
                <div className="px-5 pb-5 pt-3 space-y-3 border-t border-amber-200">
                  <div>
                    <label className="block text-xs font-600 text-amber-800 mb-1">Note commande (visible fournisseur)</label>
                    <textarea
                      rows={3}
                      value={editNotesVal}
                      onChange={(e) => setEditNotesVal(e.target.value)}
                      autoFocus
                      className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 resize-none bg-white"
                      placeholder="Ex : Commande urgente — client en attente de la réf XX, livraison avant le …"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        setSavingNotes(true);
                        await supplierOrderService.update(order.id, { notes: editNotesVal });
                        setEditingNotes(false);
                        setSavingNotes(false);
                        load();
                      }}
                      disabled={savingNotes}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-600 hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                      {savingNotes ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={12} />}
                      Sauvegarder
                    </button>
                    <button onClick={() => setEditingNotes(false)} className="px-3 py-1.5 border border-amber-300 rounded-lg text-xs text-amber-700 hover:bg-amber-100 transition-colors">Annuler</button>
                  </div>
                </div>
              )}
            </div>

            {/* Currency conversion banner */}
            {showEUR && (
              <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <Icon name="ArrowsRightLeftIcon" size={16} className="text-blue-600 shrink-0" />
                <div className="flex-1">
                  <span className="font-700 text-blue-900">Conversion {order.currency} → EUR active</span>
                  <span className="text-blue-600 ml-2">1 {order.currency} = {order.exchangeRate} €</span>
                  <span className="text-blue-500 ml-2 text-xs">· Sous-total : {order.subtotal.toFixed(2)} {order.currency} = <strong>{toEUR(order.subtotal).toFixed(2)} €</strong></span>
                </div>
                <button
                  onClick={() => { setEditCurrencyVal(order.currency); setEditExchangeRateVal(String(order.exchangeRate)); setEditingCurrency(true); }}
                  className="shrink-0 text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  Modifier
                </button>
              </div>
            )}

            {/* Currency editor */}
            {editingCurrency && (
              <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-card space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon name="ArrowsRightLeftIcon" size={16} className="text-blue-600" />
                  <p className="text-sm font-700 text-foreground">Devise & taux de change</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Devise de la commande</label>
                    <select
                      value={editCurrencyVal}
                      onChange={(e) => setEditCurrencyVal(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="EUR">EUR — Euro</option>
                      <option value="USD">USD — Dollar américain</option>
                      <option value="GBP">GBP — Livre sterling</option>
                      <option value="CNY">CNY — Yuan chinois</option>
                      <option value="AED">AED — Dirham EAU</option>
                      <option value="JPY">JPY — Yen japonais</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">
                      Taux de change (1 {editCurrencyVal} = X €)
                    </label>
                    <input
                      type="number" min="0" step="0.0001"
                      value={editExchangeRateVal}
                      onChange={(e) => setEditExchangeRateVal(e.target.value)}
                      placeholder="ex : 0.92"
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    {editCurrencyVal !== 'EUR' && parseFloat(editExchangeRateVal) > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Sous-total : {order.subtotal.toFixed(2)} {editCurrencyVal} = <strong>{(order.subtotal * parseFloat(editExchangeRateVal)).toFixed(2)} €</strong>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setSavingCurrency(true);
                      await supplierOrderService.update(order.id, {
                        currency: editCurrencyVal,
                        exchangeRate: parseFloat(editExchangeRateVal) || 1,
                      });
                      setEditingCurrency(false);
                      setSavingCurrency(false);
                      load();
                    }}
                    disabled={savingCurrency}
                    className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {savingCurrency ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={14} />}
                    Enregistrer
                  </button>
                  <button onClick={() => setEditingCurrency(false)} className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-4">Informations commande</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Fournisseur', value: order.supplierName || '—' },
                    { label: 'Livraison prévue', value: order.expectedDeliveryAt ? new Date(order.expectedDeliveryAt).toLocaleDateString('fr-FR') : '—' },
                    { label: 'Tracking', value: order.trackingNumber || '—' },
                    { label: 'Méthode coût', value: costMethod === 'by_value' ? 'Par valeur' : costMethod === 'by_quantity' ? 'Par quantité' : 'Autre' },
                    { label: 'Frais validés', value: order.costsValidated ? 'Oui' : 'Non' },
                  ].map((item) => (
                    <div key={item.label}>
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-500 text-foreground mt-0.5">{item.value}</p>
                    </div>
                  ))}
                  <div>
                    <p className="text-xs text-muted-foreground">Devise</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`font-600 ${showEUR ? 'text-blue-700' : 'text-foreground'}`}>{order.currency}</span>
                      {showEUR && <span className="text-xs text-blue-500">1 {order.currency} = {order.exchangeRate} €</span>}
                      <button
                        onClick={() => { setEditCurrencyVal(order.currency); setEditExchangeRateVal(String(order.exchangeRate)); setEditingCurrency(true); }}
                        className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                        title="Modifier devise"
                      >
                        <Icon name="PencilIcon" size={11} />
                      </button>
                    </div>
                  </div>
                </div>
                {/* Group & transport */}
                <div className="mt-4 pt-4 border-t border-border">
                  {editingMeta ? (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Groupe de commande</label>
                        <input
                          type="text"
                          value={editGroup}
                          onChange={(e) => setEditGroup(e.target.value)}
                          placeholder="ex : COMMANDE CONTENAIRE 1"
                          className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">Mode de transport</label>
                        <select
                          value={editTransportMeth}
                          onChange={(e) => setEditTransportMeth(e.target.value)}
                          className="w-full px-3 py-1.5 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                        >
                          <option value="">Sélectionner...</option>
                          <option value="avion">✈️ Avion</option>
                          <option value="bateau">🚢 Bateau</option>
                          <option value="camion">🚛 Camion</option>
                          <option value="courrier">📦 Courrier express</option>
                          <option value="autre">Autre</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setSavingMeta(true);
                            await supplierOrderService.update(order.id, { orderGroup: editGroup || undefined, transportMethod: editTransportMeth || undefined });
                            setEditingMeta(false);
                            setSavingMeta(false);
                            load();
                          }}
                          disabled={savingMeta}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                        >
                          {savingMeta ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={12} />}
                          Sauvegarder
                        </button>
                        <button onClick={() => setEditingMeta(false)} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid grid-cols-2 gap-3 flex-1 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Groupe commande</p>
                          {order.orderGroup ? (
                            <span className="inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded-full text-xs font-600 bg-violet-50 text-violet-700 border border-violet-200">{order.orderGroup}</span>
                          ) : <p className="font-500 text-foreground mt-0.5">—</p>}
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Mode de transport</p>
                          <p className="font-500 text-foreground mt-0.5">
                            {order.transportMethod ? ({ avion: '✈️ Avion', bateau: '🚢 Bateau', camion: '🚛 Camion', courrier: '📦 Courrier', autre: 'Autre' } as Record<string,string>)[order.transportMethod] ?? order.transportMethod : '—'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => { setEditGroup(order.orderGroup || ''); setEditTransportMeth(order.transportMethod || ''); setEditingMeta(true); }}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
                        title="Modifier groupe / transport"
                      >
                        <Icon name="PencilIcon" size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-4">
              {/* Bloc 1 — Paiement fournisseur */}
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Icon name="CreditCardIcon" size={14} className="text-blue-600" />
                  </div>
                  <h3 className="font-600 text-foreground">Paiement fournisseur</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Montant produits</span>
                    <span className="font-500 text-right">
                      {order.subtotal.toFixed(2)} {order.currency}
                      {showEUR && <span className="block text-xs text-blue-500 font-400">≈ {toEUR(order.subtotal).toFixed(2)} €</span>}
                    </span>
                  </div>
                  {supplierExtraFees > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Frais inclus fournisseur</span><span>{supplierExtraFees.toFixed(2)} {order.currency}</span></div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-700 text-blue-700">
                    <span>À payer fournisseur</span>
                    <span className="text-right">
                      {supplierPaymentAmount.toFixed(2)} {order.currency}
                      {showEUR && <span className="block text-xs text-blue-400 font-400">≈ {toEUR(supplierPaymentAmount).toFixed(2)} €</span>}
                    </span>
                  </div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Montant payé</span><span className="font-500">{amountPaid.toFixed(2)} {order.currency}</span></div>
                  {balanceDue > 0 && (
                    <div className="flex justify-between text-red-600 font-600"><span>Solde dû</span><span>{balanceDue.toFixed(2)} {order.currency}</span></div>
                  )}
                  <div className="pt-1">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-600 ${paymentStatusColor}`}>{paymentStatusLabel}</span>
                  </div>
                </div>
              </div>
              {/* Bloc 2 — Rentabilité interne */}
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                    <Icon name="ChartBarIcon" size={14} className="text-purple-600" />
                  </div>
                  <h3 className="font-600 text-foreground">Rentabilité interne</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-600 text-blue-700">
                    <span>Coût import réel</span>
                    <span className="text-right">
                      {importCost.toFixed(2)} {order.currency}
                      {showEUR && <span className="block text-xs text-blue-400 font-400">≈ {toEUR(importCost).toFixed(2)} €</span>}
                    </span>
                  </div>
                  {totalSalePrice > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-600"><span>Marge brute</span><span className="font-600">{grossMarginPct.toFixed(1)}%</span></div>
                      {structurePct > 0 && (
                        <div className={`flex justify-between font-600 ${netMarginPct >= 20 ? 'text-emerald-600' : netMarginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                          <span>Marge nette est.</span><span>{netMarginPct.toFixed(1)}%</span>
                        </div>
                      )}
                    </>
                  )}
                  {structurePct > 0 && (
                    <div className="mt-2 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                      ℹ️ Frais structure ({structurePct}%) : {structureAmount.toFixed(2)} {order.currency} — intégrés dans vos prix de vente
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* Lines */}
        {tab === 'lines' && (
          <div className="space-y-4">
            {/* Edit mode toolbar */}
            {editMode && (
              <>
                {/* Notes + costs in edit mode */}
                <div className="bg-white border border-primary/30 rounded-xl p-4 shadow-card space-y-3">
                  <p className="text-sm font-600 text-foreground">Modifier la commande</p>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Notes</label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                      placeholder="Notes de la commande…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Transport ({order.currency})</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={editTransport}
                        onChange={(e) => setEditTransport(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">Douane ({order.currency})</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={editCustoms}
                        onChange={(e) => setEditCustoms(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>
                  {saveEditError && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      <Icon name="ExclamationCircleIcon" size={15} className="shrink-0" />
                      {saveEditError}
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {savingEdit ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={15} />}
                      {savingEdit ? 'Enregistrement…' : 'Sauvegarder'}
                    </button>
                    <button
                      onClick={() => setShowAddLineModal(true)}
                      className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors"
                    >
                      <Icon name="PlusIcon" size={15} />
                      Ajouter produit
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-4 py-2 border border-border rounded-lg text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Image sync banner */}
            {lines.some((l) => !l.productImageUrl) && (
              <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-sm">
                <Icon name="PhotoIcon" size={15} className="text-blue-500 shrink-0" />
                <span className="flex-1 text-blue-700 text-xs">Certains produits n'ont pas d'image dans la commande.</span>
                <button
                  onClick={() => {
                    setBackfilledImages(false);
                  }}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Icon name="ArrowPathIcon" size={13} />
                  Sync images
                </button>
              </div>
            )}

            {/* Lines table */}
            <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
              {(!editMode ? lines : editedLines).length === 0 ? (
                <div className="p-12 text-center">
                  <Icon name="ShoppingBagIcon" size={36} className="text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Aucun produit dans cette commande</p>
                  {editMode && (
                    <button
                      onClick={() => setShowAddLineModal(true)}
                      className="mt-3 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 mx-auto"
                    >
                      <Icon name="PlusIcon" size={15} />
                      Ajouter un produit
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="w-12 px-3 py-3" />
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Produit</th>
                        <th className="text-center px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Qté</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Prix achat</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Total ligne</th>
                        {!editMode && <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Coût réel unit.</th>}
                        {!editMode && <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Marge %</th>}
                        {editMode && <th className="w-10 px-4 py-3" />}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {(editMode ? editedLines : lines).map((line) => (
                        <tr key={line.id} className={`hover:bg-muted/20 ${editMode ? 'bg-amber-50/20' : ''}`}>
                          <td className="pl-3 pr-0 py-3">
                            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden shrink-0">
                              {line.productImageUrl ? (
                                <Image
                                  src={line.productImageUrl}
                                  alt={line.productName}
                                  width={40}
                                  height={40}
                                  className="object-cover w-full h-full"
                                />
                              ) : (
                                <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-500 text-foreground">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">{line.productRef}{line.color ? ` · ${line.color}` : ''}{line.size ? ` · ${line.size}` : ''}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {editMode ? (
                              <input
                                type="number" min="1"
                                value={line.qtyOrdered}
                                onChange={(e) => handleEditLineChange(line.id, 'qtyOrdered', parseInt(e.target.value) || 1)}
                                className="w-16 text-center px-2 py-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            ) : (
                              <span className="font-600">{line.qtyOrdered}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {editMode ? (
                              <input
                                type="number" min="0" step="0.01"
                                value={line.unitPrice}
                                onChange={(e) => handleEditLineChange(line.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="w-24 text-right px-2 py-1 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                              />
                            ) : (
                              <span>{line.unitPrice.toFixed(2)} {order.currency}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right font-600">
                            {(line.qtyOrdered * line.unitPrice).toFixed(2)} {order.currency}
                          </td>
                          {!editMode && (
                            <td className="px-4 py-3 text-right">{line.unitRealCost > 0 ? `${line.unitRealCost.toFixed(2)} ${order.currency}` : '—'}</td>
                          )}
                          {!editMode && (
                            <td className="px-4 py-3 text-right">
                              {line.marginRate > 0 ? (
                                <span className={`font-600 ${line.marginRate >= 40 ? 'text-emerald-600' : line.marginRate >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                                  {line.marginRate.toFixed(1)}%
                                </span>
                              ) : '—'}
                            </td>
                          )}
                          {editMode && (
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleRemoveEditLine(line.id)}
                                className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors"
                                title="Supprimer"
                              >
                                <Icon name="XMarkIcon" size={12} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {editMode && (
                      <tfoot>
                        <tr className="border-t border-border bg-muted/10">
                          <td colSpan={4} className="px-4 py-2 text-sm text-muted-foreground">Sous-total</td>
                          <td className="px-4 py-2 text-right font-700 text-foreground">
                            {editedLines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0).toFixed(2)} {order.currency}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add line modal */}
        {showAddLineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-700 text-foreground">Ajouter un produit</h2>
                <button onClick={() => { setShowAddLineModal(false); setProductSearch(''); setProductResults([]); }} className="p-1 rounded-lg hover:bg-muted text-muted-foreground">
                  <Icon name="XMarkIcon" size={18} />
                </button>
              </div>
              <div className="relative mb-3">
                <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); searchProducts(e.target.value); }}
                  placeholder="Nom du produit…"
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {searchingProducts && (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleAddProductToOrder(p)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-muted transition-colors border border-transparent hover:border-border"
                  >
                    <p className="text-sm font-500 text-foreground">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.ref ?? '—'} · Achat: {p.buy_price?.toFixed(2) ?? '—'} € · Vente: {p.sell_price_ttc?.toFixed(2) ?? '—'} €</p>
                  </button>
                ))}
                {!searchingProducts && productSearch && productResults.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun produit trouvé</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reception */}
        {tab === 'reception' && (
          <div className="space-y-5">

            {/* ── Facture fournisseur ── */}
            {order.invoiceReceivedAt ? (
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-4 flex items-center gap-2">
                  <span className="text-lg">📥</span>
                  Facture fournisseur reçue
                </h3>
                <div className="flex flex-wrap items-center gap-3 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Reçue le {new Date(order.invoiceReceivedAt).toLocaleString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {order.supplierInvoiceUrl && (
                    <a
                      href={order.supplierInvoiceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-500 hover:bg-violet-700 transition-colors"
                    >
                      <Icon name="DocumentIcon" size={14} />
                      Voir la facture PDF
                    </a>
                  )}
                </div>
                {order.supplierInvoiceUrl && (
                  <iframe
                    src={order.supplierInvoiceUrl}
                    className="w-full rounded-lg border border-border"
                    style={{ height: 420 }}
                    title="Facture fournisseur"
                  />
                )}

                {/* Real price entry per line */}
                {lines.length > 0 && (
                  <div className="mt-5">
                    <p className="text-sm font-600 text-foreground mb-3">
                      Saisir les prix réels (d'après la facture) :
                    </p>
                    <div className="space-y-2">
                      {lines.map((line) => (
                        <div key={line.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-500 text-foreground truncate">{line.productName}</p>
                            <p className="text-xs text-muted-foreground">{line.productRef} · Commandé: {line.qtyOrdered}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs text-muted-foreground">Prix estimé: {line.unitPrice?.toFixed(2)} {order.currency}</span>
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={realPrices[line.id] ?? ''}
                                onChange={(e) => setRealPrices(prev => ({ ...prev, [line.id]: e.target.value }))}
                                placeholder="0.00"
                                className="w-28 px-2.5 py-1.5 pr-8 border border-violet-300 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-300 bg-violet-50"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{order.currency}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                      <button
                        onClick={handleSaveInvoicePrices}
                        disabled={savingPrices}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-500 hover:bg-violet-700 transition-colors disabled:opacity-50"
                      >
                        {savingPrices
                          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          : <Icon name="CheckIcon" size={15} />}
                        Enregistrer les prix réels
                      </button>
                      {pricesSaved && (
                        <span className="text-sm text-emerald-600 font-500">✅ Prix sauvegardés</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : uploadLink ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-lg">⏳</span>
                <div className="flex-1">
                  <p className="text-sm font-600 text-amber-800">En attente de la facture</p>
                  <p className="text-xs text-amber-600">Le lien de dépôt a été généré. En attente de l'envoi par le fournisseur.</p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-300 text-amber-700 bg-white rounded-lg text-xs font-500 hover:bg-amber-50 transition-colors"
                >
                  <Icon name={copiedLink ? 'CheckIcon' : 'LinkIcon'} size={13} />
                  {copiedLink ? 'Copié !' : 'Copier le lien'}
                </button>
              </div>
            ) : null}

            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <h3 className="font-600 text-foreground mb-4 flex items-center gap-2">
                <Icon name="ArchiveBoxIcon" size={16} className="text-primary" />
                Réceptionner la commande
              </h3>
              {lines.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun produit à réceptionner</p>
              ) : (
                <div className="space-y-4">
                  {lines.map((line) => (
                    <div key={line.id} className="border border-border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-500 text-foreground">{line.productName}</p>
                          <p className="text-xs text-muted-foreground">{line.productRef} · Commandé: {line.qtyOrdered}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${line.qtyReceived >= line.qtyOrdered ? 'bg-emerald-50 text-emerald-700' : line.qtyReceived > 0 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                          Reçu: {line.qtyReceived}/{line.qtyOrdered}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Qté reçue</label>
                          <input
                            type="number" min="0" max={line.qtyOrdered}
                            value={receivedQtys[line.id] ?? line.qtyReceived ?? 0}
                            onChange={(e) => setReceivedQtys(prev => ({ ...prev, [line.id]: parseInt(e.target.value) || 0 }))}
                            className="w-full px-2.5 py-1.5 border border-primary/40 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-primary/5" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Manquants</label>
                          <input type="number" min="0" defaultValue={line.qtyMissing}
                            className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                        <div>
                          <label className="block text-xs text-muted-foreground mb-1">Abîmés</label>
                          <input type="number" min="0" defaultValue={line.qtyDamaged}
                            className="w-full px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Persistent stock-updated badge */}
                  {order.stockUpdated ? (
                    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800">
                      <Icon name="CheckCircleIcon" size={18} className="text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-600">✅ Stock mis à jour</p>
                        {(order.stockUpdatedAt || order.updatedAt) && (
                          <p className="text-xs text-emerald-600 mt-0.5">
                            le {new Date(order.stockUpdatedAt || order.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] font-700 uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Verrouillé</span>
                    </div>
                  ) : stockUpdateBanner && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-500 text-sm">
                      <span className="flex-1">{stockUpdateBanner}</span>
                      <button onClick={() => setStockUpdateBanner(null)} className="text-emerald-500 hover:text-emerald-700 shrink-0">
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={handleFullReception}
                      disabled={updatingStock || order.stockUpdated}
                      title={order.stockUpdated ? 'Stock déjà mis à jour pour cette commande' : undefined}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-500 hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {updatingStock ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckCircleIcon" size={15} />}
                      Réception totale
                    </button>
                    <button
                      onClick={handlePartialReception}
                      disabled={updatingStock || order.stockUpdated}
                      title={order.stockUpdated ? 'Stock déjà mis à jour pour cette commande' : undefined}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-500 hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {updatingStock ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="ExclamationCircleIcon" size={15} />}
                      Réception partielle (qtés saisies)
                    </button>
                    <button
                      onClick={handleOpenOrderLabels}
                      disabled={orderLabelLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-500 hover:bg-violet-700 transition-colors disabled:opacity-60"
                    >
                      {orderLabelLoading
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Icon name="PrinterIcon" size={15} />}
                      🏷️ Imprimer les étiquettes
                      {!orderLabelLoading && lines.length > 0 && (
                        <span className="ml-1 bg-white/20 rounded px-1.5 py-0.5 text-[11px] font-700">
                          {lines.reduce((s, l) => s + l.qtyOrdered, 0)} étiq.
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Costs */}
        {tab === 'costs' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: Input form */}
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-1 flex items-center gap-2">
                  <Icon name="BanknotesIcon" size={16} className="text-primary" />
                  Saisie des frais réels
                </h3>
                <p className="text-xs text-muted-foreground mb-4">Cochez ✓ pour inclure un frais dans le montant à payer au fournisseur</p>

                {/* Column headers */}
                <div className="flex items-center gap-2 mb-2 px-0.5">
                  <div className="w-28 shrink-0" />
                  <div className="w-14 shrink-0" />
                  <div className="flex-1 text-xs text-muted-foreground font-500">Montant</div>
                  <div className="w-32 text-xs text-blue-600 font-600 text-center">Inclure fournisseur</div>
                </div>

                <div className="space-y-2">
                  {COST_LINES.map(({ key, label }) => {
                    const mode = costModes[key] || 'eur';
                    const pct = costPcts[key] || 0;
                    const computedEur = order.subtotal * pct / 100;
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <label className="w-28 text-sm text-muted-foreground shrink-0">{label}</label>
                        {/* EUR / % toggle */}
                        <div className="flex border border-border rounded-md overflow-hidden shrink-0 w-14">
                          <button
                            type="button"
                            onClick={() => setCostModes(prev => ({ ...prev, [key]: 'eur' }))}
                            className={`flex-1 py-1 text-[11px] font-700 transition-colors ${mode === 'eur' ? 'bg-primary text-primary-foreground' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                          >EUR</button>
                          <button
                            type="button"
                            onClick={() => setCostModes(prev => ({ ...prev, [key]: 'pct' }))}
                            className={`flex-1 py-1 text-[11px] font-700 transition-colors ${mode === 'pct' ? 'bg-primary text-primary-foreground' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                          >%</button>
                        </div>
                        {mode === 'eur' ? (
                          <input
                            type="number" min="0" step="0.01"
                            value={(costs as any)[key]}
                            onChange={(e) => setCosts((prev) => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                            className="flex-1 px-3 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                          />
                        ) : (
                          <div className="flex-1 flex items-center gap-2">
                            <input
                              type="number" min="0" max="100" step="0.1"
                              value={pct}
                              onChange={(e) => setCostPcts(prev => ({ ...prev, [key]: parseFloat(e.target.value) || 0 }))}
                              className="w-20 px-3 py-1.5 border border-primary/40 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 bg-primary/5"
                            />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">= <strong>{computedEur.toFixed(2)}</strong> {order.currency}</span>
                          </div>
                        )}
                        <div className="w-32 flex items-center justify-center gap-1.5 shrink-0">
                          <input
                            type="checkbox"
                            id={`include_${key}`}
                            checked={(supplierIncludes as any)[key]}
                            onChange={(e) => setSupplierIncludes((prev) => ({ ...prev, [key]: e.target.checked }))}
                            className="w-4 h-4 rounded border-border text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <label htmlFor={`include_${key}`} className="text-xs text-blue-600 cursor-pointer select-none">
                            {(supplierIncludes as any)[key] ? 'Inclus' : 'Exclure'}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Structure fees field */}
                <div className="border-t border-border pt-3 mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-5 h-5 rounded bg-purple-100 flex items-center justify-center">
                      <Icon name="BuildingOfficeIcon" size={11} className="text-purple-600" />
                    </div>
                    <span className="text-sm font-600 text-foreground">Frais structure (%)</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-500">Loyer · Salaires · Charges</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="w-36 text-sm text-muted-foreground shrink-0">Structure</label>
                    <input
                      type="number" min="0" max="100" step="0.5"
                      value={structurePct}
                      onChange={(e) => setStructurePct(parseFloat(e.target.value) || 0)}
                      className="flex-1 px-3 py-1.5 border border-purple-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-200 bg-purple-50/30"
                    />
                    <span className="text-xs text-muted-foreground w-10">%</span>
                    <div className="w-32 flex items-center justify-center">
                      <span className="text-[10px] text-purple-500 italic">Jamais fournisseur</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 ml-[156px]">
                    = {structureAmount.toFixed(2)} {order.currency} sur coût import
                  </p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm text-muted-foreground mb-2">Méthode de répartition</label>
                  <select value={costMethod} onChange={(e) => setCostMethod(e.target.value as any)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="by_value">Par valeur (défaut)</option>
                    <option value="by_quantity">Par quantité</option>
                    <option value="by_weight">Par poids</option>
                    <option value="by_volume">Par volume</option>
                    <option value="custom">Personnalisée</option>
                  </select>
                </div>
              </div>

              {/* Right: Two separate calculation blocks */}
              <div className="space-y-4">
                {/* Bloc 1 — Paiement fournisseur */}
                <div className="bg-white border-2 border-blue-200 rounded-xl p-5 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Icon name="CreditCardIcon" size={14} className="text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-700 text-blue-800 text-sm">Bloc 1 — Paiement fournisseur</h3>
                      <p className="text-[10px] text-blue-500">Ce que je dois payer au fournisseur</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Montant produits</span>
                      <span className="font-600">{order.subtotal.toFixed(2)} {order.currency}</span>
                    </div>
                    {COST_LINES.map(({ key, label }) => (supplierIncludes as any)[key] && getEC(key) > 0 ? (
                      <div key={key} className="flex justify-between text-blue-700">
                        <span>+ {label} <span className="text-[10px] bg-blue-50 px-1 rounded">inclus</span></span>
                        <span>{getEC(key).toFixed(2)}</span>
                      </div>
                    ) : null)}
                    <div className="border-t-2 border-blue-200 pt-2 flex justify-between font-700 text-blue-800 text-base">
                      <span>= Montant à payer fournisseur</span>
                      <span>{supplierPaymentAmount.toFixed(2)} {order.currency}</span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-100 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Montant payé</span>
                      <span className="font-500">{amountPaid.toFixed(2)} {order.currency}</span>
                    </div>
                    <div className={`flex justify-between font-700 ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      <span>Solde dû fournisseur</span>
                      <span>{balanceDue.toFixed(2)} {order.currency}</span>
                    </div>
                    <div className="pt-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-600 ${paymentStatusColor}`}>{paymentStatusLabel}</span>
                    </div>
                  </div>
                </div>

                {/* Bloc 2 — Rentabilité interne */}
                <div className="bg-white border-2 border-purple-200 rounded-xl p-5 shadow-card">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                      <Icon name="ChartBarIcon" size={14} className="text-purple-600" />
                    </div>
                    <div>
                      <h3 className="font-700 text-purple-800 text-sm">Bloc 2 — Rentabilité interne</h3>
                      <p className="text-[10px] text-purple-500">Calcul de marge uniquement — pas une dette fournisseur</p>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">Coût import réel</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Montant produits</span><span>{order.subtotal.toFixed(2)}</span></div>
                    {COST_LINES.map(({ key, label }) => getEC(key) > 0 ? (
                      <div key={key} className="flex justify-between text-muted-foreground">
                        <span>+ {label}{costModes[key] === 'pct' ? ` (${costPcts[key]}%)` : ''}</span>
                        <span>{getEC(key).toFixed(2)}</span>
                      </div>
                    ) : null)}
                    <div className="border-t border-purple-100 pt-1.5 flex justify-between font-600 text-blue-700">
                      <span>= Coût import réel</span>
                      <span>{importCost.toFixed(2)} {order.currency}</span>
                    </div>
                  </div>
                  {totalQty > 0 && (
                    <div className="mt-2 flex justify-between text-xs text-blue-600">
                      <span>Coût moyen / produit ({totalQty} unités)</span>
                      <span className="font-600">{avgCostPerProduct.toFixed(2)} {order.currency}</span>
                    </div>
                  )}
                  {totalSalePrice > 0 && (
                    <div className="mt-2 space-y-1.5 text-sm">
                      <div className="flex justify-between text-emerald-700 font-600">
                        <span>Marge brute</span><span>{grossMarginPct.toFixed(1)}%</span>
                      </div>
                      {structurePct > 0 && (
                        <div className={`flex justify-between text-xs font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                          <span>Marge nette est.</span><span>{netMarginPct.toFixed(1)}%</span>
                        </div>
                      )}
                    </div>
                  )}
                  {structurePct > 0 && (
                    <div className="mt-3 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                      ℹ️ Frais structure ({structurePct}%) : {structureAmount.toFixed(2)} {order.currency}<br />
                      <span className="text-gray-400">Ces frais sont intégrés dans vos prix de vente — pas un coût fournisseur</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveCosts}
                  disabled={savingCosts || updatingStock}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingCosts || updatingStock ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={15} />}
                  {savingCosts ? 'Enregistrement...' : updatingStock ? 'Mise à jour stock...' : 'Valider les frais'}
                </button>
                {order.stockUpdated ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 mt-2">
                    <Icon name="CheckCircleIcon" size={16} className="text-emerald-600 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600">✅ Stock mis à jour</p>
                      {(order.stockUpdatedAt || order.updatedAt) && (
                        <p className="text-xs text-emerald-600 mt-0.5">
                          le {new Date(order.stockUpdatedAt || order.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] font-700 uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">Verrouillé</span>
                  </div>
                ) : stockUpdateBanner && (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 font-500 text-sm mt-2">
                    <span className="flex-1">{stockUpdateBanner}</span>
                    <button onClick={() => setStockUpdateBanner(null)} className="text-emerald-500 hover:text-emerald-700 shrink-0">
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Structure history */}
            {structureHistory.length > 0 && (
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="ClockIcon" size={15} className="text-purple-600" />
                  Historique des frais structure
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Date</th>
                        <th className="text-center px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Ancien %</th>
                        <th className="text-center px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Nouveau %</th>
                        <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Coût import</th>
                        <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Coût business</th>
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground uppercase">Modifié par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {structureHistory.map((entry, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString('fr-FR')} {new Date(entry.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-3 py-2 text-center"><span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">{entry.oldPct}%</span></td>
                          <td className="px-3 py-2 text-center"><span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 text-xs font-600">{entry.newPct}%</span></td>
                          <td className="px-3 py-2 text-right text-xs">{entry.oldImportCost.toFixed(2)} {order.currency}</td>
                          <td className="px-3 py-2 text-right text-xs font-600 text-primary">{entry.newBusinessCost.toFixed(2)} {order.currency}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{entry.changedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Margins */}
        {tab === 'margins' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Coût import réel', value: `${importCost.toFixed(2)} ${order.currency}`, icon: 'ShoppingBagIcon', color: 'text-blue-600 bg-blue-50' },
                { label: 'Marge brute', value: totalSalePrice > 0 ? `${grossMarginPct.toFixed(1)}%` : '—', icon: 'ChartBarIcon', color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Marge nette est.', value: totalSalePrice > 0 ? `${netMarginPct.toFixed(1)}%` : '—', icon: 'CalculatorIcon', color: netMarginPct >= 20 ? 'text-emerald-600 bg-emerald-50' : netMarginPct >= 10 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50' },
              ].map((k) => (
                <div key={k.label} className="bg-white border border-border rounded-xl p-4 shadow-card">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${k.color}`}>
                      <Icon name={k.icon as any} size={18} />
                    </div>
                    <div>
                      <p className="text-lg font-700 text-foreground">{k.value}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {structurePct > 0 && (
              <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 flex items-center gap-2">
                <span className="text-base">ℹ️</span>
                <span>Frais structure ({structurePct}%) : <strong>{structureAmount.toFixed(2)} {order.currency}</strong> — intégrés dans vos prix de vente, non comptés dans le coût import</span>
              </div>
            )}

            {/* Bulk update option */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <Icon name="ArrowPathIcon" size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-600 text-foreground">Mettre à jour tous les produits concernés</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Recalcule les coûts de revient et marges pour tous les produits de cette commande déjà en stock</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <div
                      onClick={() => setBulkUpdateEnabled(!bulkUpdateEnabled)}
                      className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${bulkUpdateEnabled ? 'bg-indigo-600' : 'bg-muted'}`}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${bulkUpdateEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-sm text-muted-foreground">{bulkUpdateEnabled ? 'Activé' : 'Désactivé'}</span>
                  </label>
                  <button
                    onClick={handleBulkUpdate}
                    disabled={!bulkUpdateEnabled || bulkUpdating || lines.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-600 hover:bg-indigo-700 transition-colors disabled:opacity-40"
                  >
                    {bulkUpdating ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Icon name="ArrowPathIcon" size={14} />
                    )}
                    {bulkUpdating ? 'Mise à jour...' : 'Lancer la mise à jour'}
                  </button>
                </div>
              </div>
              {bulkUpdateDone && (
                <div className="mt-3 flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 font-500">
                  <Icon name="CheckCircleIcon" size={16} />
                  {lines.length} produit{lines.length > 1 ? 's' : ''} mis à jour avec le nouveau coût de revient ({avgCostPerProduct.toFixed(2)} {order.currency}/unité)
                </div>
              )}
            </div>

            {/* Business cost breakdown summary */}
            <div className="bg-white border border-border rounded-xl p-5 shadow-card">
              <h3 className="font-600 text-foreground mb-4 flex items-center gap-2">
                <Icon name="CalculatorIcon" size={15} className="text-primary" />
                Synthèse rentabilité réelle
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div className="bg-blue-50 rounded-xl p-4">
                  <p className="text-xs text-blue-600 font-600 uppercase mb-2">Coût achat</p>
                  <p className="text-xl font-700 text-blue-700">{order.subtotal.toFixed(2)} {order.currency}</p>
                  <p className="text-xs text-blue-500 mt-1">Montant produits commandés</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-4">
                  <p className="text-xs text-amber-600 font-600 uppercase mb-2">Coût import réel</p>
                  <p className="text-xl font-700 text-amber-700">{importCost.toFixed(2)} {order.currency}</p>
                  <p className="text-xs text-amber-500 mt-1">Produits + tous frais import</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs text-slate-600 font-600 uppercase mb-2">Coût moyen / produit</p>
                  <p className="text-xl font-700 text-slate-700">{totalQty > 0 ? avgCostPerProduct.toFixed(2) : '—'} {totalQty > 0 ? order.currency : ''}</p>
                  <p className="text-xs text-slate-500 mt-1">{totalQty} unités commandées</p>
                </div>
                {totalSalePrice > 0 && (
                  <>
                    <div className="bg-emerald-50 rounded-xl p-4">
                      <p className="text-xs text-emerald-600 font-600 uppercase mb-2">Marge brute</p>
                      <p className="text-xl font-700 text-emerald-700">{grossMarginPct.toFixed(1)}%</p>
                      <p className="text-xs text-emerald-500 mt-1">{grossMarginAmt.toFixed(2)} {order.currency}</p>
                    </div>
                    {structurePct > 0 && (
                      <div className={`rounded-xl p-4 ${netMarginPct >= 20 ? 'bg-emerald-50' : netMarginPct >= 10 ? 'bg-amber-50' : 'bg-red-50'}`}>
                        <p className={`text-xs font-600 uppercase mb-2 ${netMarginPct >= 20 ? 'text-emerald-600' : netMarginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>Marge nette estimée</p>
                        <p className={`text-xl font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>{netMarginPct.toFixed(1)}%</p>
                        <p className={`text-xs mt-1 ${netMarginPct >= 20 ? 'text-emerald-500' : netMarginPct >= 10 ? 'text-amber-500' : 'text-red-500'}`}>Marge brute − overhead</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              {structurePct > 0 && (
                <div className="mt-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 flex items-center gap-2">
                  <span className="text-base">ℹ️</span>
                  <span>Frais structure ({structurePct}%) : <strong>{structureAmount.toFixed(2)} {order.currency}</strong> — ces frais sont intégrés dans vos prix de vente et ne sont pas un coût fournisseur</span>
                </div>
              )}
            </div>

            {/* Per-product analysis with margin alerts and quick price edit */}
            <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-600 text-foreground">Analyse par produit</h3>
                {lines.some((l) => {
                  const unitCost = l.unitRealCost > 0 ? l.unitRealCost : avgCostPerProduct;
                  return l.salePrice > 0 && ((l.salePrice - unitCost) / l.salePrice) * 100 < 30;
                }) && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 font-600 border border-amber-200">
                    ⚠️ Produits à surveiller détectés
                  </span>
                )}
              </div>
              {lines.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Aucun produit</div>
              ) : (
                <div className="divide-y divide-border">
                  {lines.sort((a, b) => b.marginRate - a.marginRate).map((line) => {
                    const unitCost = line.unitRealCost > 0 ? line.unitRealCost : avgCostPerProduct;
                    const computedMargin = line.salePrice > 0 ? ((line.salePrice - unitCost) / line.salePrice) * 100 : 0;
                    const alert = getMarginAlert(unitCost, line.salePrice);
                    const isEditingThis = editingPriceLineId === line.id;

                    return (
                      <div key={line.id} className={`px-5 py-4 ${alert ? 'bg-red-50/30' : ''}`}>
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-500 text-foreground">{line.productName}</p>
                              {alert && (
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-600 ${alert.color}`}>
                                  {alert.label}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{line.productRef}</p>
                          </div>
                          <div className="flex items-center gap-6 text-sm shrink-0">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Coût réel unit.</p>
                              <p className="font-600 text-foreground">{unitCost.toFixed(2)} {order.currency}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Prix vente</p>
                              {isEditingThis ? (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={newSellPrice}
                                    onChange={(e) => setNewSellPrice(e.target.value)}
                                    className="w-20 px-2 py-1 border border-primary rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveQuickPrice(line)}
                                    disabled={savingPrice}
                                    className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                                  >
                                    <Icon name="CheckIcon" size={12} />
                                  </button>
                                  <button
                                    onClick={() => { setEditingPriceLineId(null); setNewSellPrice(''); }}
                                    className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                                  >
                                    <Icon name="XMarkIcon" size={12} />
                                  </button>
                                </div>
                              ) : (
                                <p className="font-600 text-foreground">{line.salePrice > 0 ? `${line.salePrice.toFixed(2)} ${order.currency}` : '—'}</p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Marge</p>
                              <p className={`font-700 ${computedMargin >= 40 ? 'text-emerald-600' : computedMargin >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                                {line.salePrice > 0 ? `${computedMargin.toFixed(1)}%` : '—'}
                              </p>
                            </div>
                            {alert && !isEditingThis && (
                              <button
                                onClick={() => handleQuickPriceEdit(line.id, line.salePrice)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-600 hover:opacity-90 transition-opacity whitespace-nowrap"
                              >
                                <Icon name="PencilSquareIcon" size={12} />
                                Modifier prix de vente
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment */}
        {tab === 'payment' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Bloc 1 — Paiement fournisseur */}
            <div className="bg-white border-2 border-blue-200 rounded-xl p-5 shadow-card">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Icon name="CreditCardIcon" size={14} className="text-blue-600" />
                </div>
                <div>
                  <h3 className="font-700 text-blue-800">Bloc 1 — Paiement fournisseur</h3>
                  <p className="text-[11px] text-blue-500">Ce que je dois réellement payer au fournisseur</p>
                </div>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant produits fournisseur</span>
                  <span className="font-600">{order.subtotal.toFixed(2)} {order.currency}</span>
                </div>
                {supplierExtraFees > 0 && (
                  <div className="flex justify-between text-blue-700">
                    <span>Frais inclus fournisseur</span>
                    <span className="font-500">{supplierExtraFees.toFixed(2)} {order.currency}</span>
                  </div>
                )}
                <div className="border-t-2 border-blue-200 pt-2 flex justify-between font-700 text-blue-800 text-base">
                  <span>Montant à payer fournisseur</span>
                  <span>{supplierPaymentAmount.toFixed(2)} {order.currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant payé</span>
                  <span className="font-600 text-emerald-700">{amountPaid.toFixed(2)} {order.currency}</span>
                </div>
                <div className={`flex justify-between font-700 text-base ${balanceDue > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  <span>Solde dû fournisseur</span>
                  <span>{balanceDue.toFixed(2)} {order.currency}</span>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-muted-foreground text-sm">Mode paiement</span>
                  <span className="font-500">{order.paymentMethod || '—'}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">Date paiement</span>
                  <span className="font-500">{order.paymentDate ? new Date(order.paymentDate).toLocaleDateString('fr-FR') : '—'}</span>
                </div>
                <div className="pt-1">
                  <span className={`px-3 py-1 rounded-full text-sm font-600 ${paymentStatusColor}`}>{paymentStatusLabel}</span>
                </div>
              </div>
            </div>

            {/* Right column: register payment + Bloc 2 rentabilité */}
            <div className="space-y-4">
              {/* Register payment form */}
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-4">Enregistrer un paiement</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Montant payé</label>
                    <input
                      type="number" min="0" step="0.01"
                      placeholder={`Sur ${supplierPaymentAmount.toFixed(2)} ${order.currency}`}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <p className="text-[11px] text-blue-600 mt-1">Montant fournisseur à payer : {supplierPaymentAmount.toFixed(2)} {order.currency}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Mode de paiement</label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="wire_transfer">Virement bancaire</option>
                      <option value="wise">Wise</option>
                      <option value="paypal">PayPal</option>
                      <option value="alibaba">Alibaba Trade Assurance</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Date de paiement</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <button
                    onClick={handleSavePayment}
                    disabled={savingPayment || !paymentAmount}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Icon name="CheckIcon" size={15} />
                    {savingPayment ? 'Enregistrement...' : 'Enregistrer le paiement'}
                  </button>
                </div>
              </div>

              {/* Bloc 2 — Rentabilité interne */}
              <div className="bg-white border-2 border-purple-200 rounded-xl p-5 shadow-card">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                    <Icon name="ChartBarIcon" size={14} className="text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-700 text-purple-800">Bloc 2 — Rentabilité interne</h3>
                    <p className="text-[11px] text-purple-500">Calcul de marge uniquement — pas une dette fournisseur</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-700 text-blue-800">
                    <span>Coût import réel</span>
                    <span>{importCost.toFixed(2)} {order.currency}</span>
                  </div>
                  {totalSalePrice > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-700 font-600">
                        <span>Marge brute</span><span>{grossMarginPct.toFixed(1)}%</span>
                      </div>
                      {structurePct > 0 && (
                        <div className={`flex justify-between font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                          <span>Marge nette estimée</span><span>{netMarginPct.toFixed(1)}%</span>
                        </div>
                      )}
                    </>
                  )}
                  {structurePct > 0 && (
                    <div className="mt-2 px-2.5 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                      ℹ️ Frais structure ({structurePct}%) : {structureAmount.toFixed(2)} {order.currency} — intégrés dans vos prix de vente
                    </div>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-purple-100">
                  <p className="text-[10px] text-purple-400 italic">Le coût import réel sert au calcul de rentabilité. Le solde dû fournisseur se calcule séparément ci-contre.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History */}
        {tab === 'history' && (
          <div className="space-y-5">
            <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-600 text-foreground">Historique des statuts</h3>
              </div>
              {history.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Aucun historique</div>
              ) : (
                <div className="divide-y divide-border">
                  {history.map((h) => (
                    <div key={h.id} className="px-5 py-4 flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon name="ArrowPathIcon" size={14} className="text-primary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {h.oldStatus && (
                            <>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${STATUS_COLORS[h.oldStatus] || 'bg-gray-100 text-gray-700'}`}>{STATUS_LABELS[h.oldStatus]}</span>
                              <Icon name="ArrowRightIcon" size={12} className="text-muted-foreground" />
                            </>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-xs font-500 ${STATUS_COLORS[h.newStatus] || 'bg-gray-100 text-gray-700'}`}>{STATUS_LABELS[h.newStatus]}</span>
                        </div>
                        {h.comment && <p className="text-sm text-muted-foreground mt-1">{h.comment}</p>}
                        <p className="text-xs text-muted-foreground mt-1">
                          {h.changedBy} · {new Date(h.changedAt).toLocaleDateString('fr-FR')} à {new Date(h.changedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cost history per product */}
            {costHistory.length > 0 && (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                    <Icon name="CurrencyEuroIcon" size={13} className="text-emerald-600" />
                  </div>
                  <h3 className="font-600 text-foreground">Historique des coûts produits</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Produit</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Ancien coût</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Nouveau coût</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Ancienne marge</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Nouvelle marge</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Ancien PV</th>
                        <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Nouveau PV</th>
                        <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Date</th>
                        <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase">Modifié par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {costHistory.map((entry, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <p className="font-500 text-foreground text-xs">{entry.productName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{entry.productRef}</p>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{entry.oldCost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-xs font-600 text-foreground">{entry.newCost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-xs">
                            <span className={entry.oldMargin >= 30 ? 'text-emerald-600' : entry.oldMargin >= 15 ? 'text-amber-600' : 'text-red-600'}>
                              {entry.oldMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs font-600">
                            <span className={entry.newMargin >= 30 ? 'text-emerald-600' : entry.newMargin >= 15 ? 'text-amber-600' : 'text-red-600'}>
                              {entry.newMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-muted-foreground">{entry.oldSellPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-xs font-600">{entry.newSellPrice.toFixed(2)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(entry.date).toLocaleDateString('fr-FR')}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{entry.changedBy}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Structure fees history in history tab */}
            {structureHistory.length > 0 && (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
                    <Icon name="BuildingOfficeIcon" size={13} className="text-purple-600" />
                  </div>
                  <h3 className="font-600 text-foreground">Historique frais structure</h3>
                </div>
                <div className="divide-y divide-border">
                  {structureHistory.map((entry, i) => (
                    <div key={i} className="px-5 py-4 flex items-start gap-4">
                      <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon name="PercentBadgeIcon" size={14} className="text-purple-600" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-full text-xs font-500 bg-gray-100 text-gray-600">{entry.oldPct}%</span>
                          <Icon name="ArrowRightIcon" size={12} className="text-muted-foreground" />
                          <span className="px-2 py-0.5 rounded-full text-xs font-600 bg-purple-50 text-purple-700">{entry.newPct}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Coût import : {entry.oldImportCost.toFixed(2)} {order.currency} → Coût business : <span className="font-600 text-foreground">{entry.newBusinessCost.toFixed(2)} {order.currency}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {entry.changedBy} · {new Date(entry.date).toLocaleDateString('fr-FR')} à {new Date(entry.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Print labels from order — quantities and barcodes pre-loaded */}
      {showOrderLabelModal && orderLabelProducts.length > 0 && (
        <BarcodeLabelModal
          products={orderLabelProducts}
          initialQtys={orderLabelInitialQtys}
          orderRef={order.orderNumber}
          onClose={() => setShowOrderLabelModal(false)}
        />
      )}

      {/* Status change modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-700 text-foreground text-lg mb-4">Changer le statut</h3>
            <div className="mb-4">
              <label className="block text-sm text-muted-foreground mb-2">Nouveau statut</label>
              <select
                value={targetStatus || ''}
                onChange={(e) => setTargetStatus(e.target.value as FoOrderStatus)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Sélectionner...</option>
                {STATUS_FLOW.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                <option value="suspended">Suspendue</option>
                <option value="cancelled">Annulée</option>
              </select>
            </div>
            <div className="mb-5">
              <label className="block text-sm text-muted-foreground mb-2">Commentaire (optionnel)</label>
              <textarea
                value={statusComment}
                onChange={(e) => setStatusComment(e.target.value)}
                rows={3}
                placeholder="Raison du changement..."
                className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowStatusModal(false)} className="flex-1 px-4 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors">Annuler</button>
              <button onClick={handleStatusChange} disabled={!targetStatus} className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors disabled:opacity-50">Confirmer</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
