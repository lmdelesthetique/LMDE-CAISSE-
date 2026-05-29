'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  // Print labels from order
  const [showOrderLabelModal, setShowOrderLabelModal] = useState(false);
  const [orderLabelProducts, setOrderLabelProducts] = useState<ProductRecord[]>([]);
  const [orderLabelInitialQtys, setOrderLabelInitialQtys] = useState<Record<string, number>>({});
  const [orderLabelLoading, setOrderLabelLoading] = useState(false);

  // Stock update on reception
  const [receivedQtys, setReceivedQtys] = useState<Record<string, number>>({});
  const [stockUpdateBanner, setStockUpdateBanner] = useState<string | null>(null);
  const [updatingStock, setUpdatingStock] = useState(false);

  // Cost modes: 'eur' (fixed amount) | 'pct' (% of product subtotal)
  const [costModes, setCostModes] = useState<Record<string, 'eur' | 'pct'>>({
    transport: 'eur', customs: 'eur', vat: 'eur', freight: 'eur',
    bank: 'eur', exchange: 'eur', local: 'eur', other: 'eur',
  });
  const [costPcts, setCostPcts] = useState<Record<string, number>>({
    transport: 0, customs: 0, vat: 0, freight: 0,
    bank: 0, exchange: 0, local: 0, other: 0,
  });

  // Draft edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedLines, setEditedLines] = useState<FoOrderLine[]>([]);
  const [editNotes, setEditNotes] = useState('');
  const [editTransport, setEditTransport] = useState(0);
  const [editCustoms, setEditCustoms] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sendingOrder, setSendingOrder] = useState(false);
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
        // Load saved structure pct for this order if exists
        const savedPct = localStorage.getItem(`beautypos_structure_pct_${id}`);
        if (savedPct !== null) setStructurePct(parseFloat(savedPct));
        // Init received quantities per line
        if (o.lines) {
          const rq: Record<string, number> = {};
          o.lines.forEach(l => { rq[l.id] = l.qtyReceived || 0; });
          setReceivedQtys(rq);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    await supplierOrderService.changeStatus(order.id, targetStatus, 'Sophie Fontaine', statusComment || undefined);
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
    const structureAmount = importCost * (structurePct / 100);
    const businessCost = importCost + structureAmount;

    // Record structure history if pct changed
    const prevPct = parseFloat(localStorage.getItem(`beautypos_structure_pct_${order.id}`) || '0');
    if (prevPct !== structurePct) {
      const entry: StructureHistoryEntry = {
        date: new Date().toISOString(),
        oldPct: prevPct,
        newPct: structurePct,
        oldImportCost: importCost,
        newBusinessCost: businessCost,
        changedBy: 'Sophie Fontaine',
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
    const avgCostPerProduct = totalQty > 0 ? businessCost / totalQty : 0;
    const newCostEntries: CostHistoryEntry[] = lines.map((line) => {
      const lineWeight = totalQty > 0 ? line.qtyOrdered / totalQty : 0;
      const newUnitCost = avgCostPerProduct;
      const oldUnitCost = line.unitRealCost || line.unitPrice;
      const oldMargin = line.salePrice > 0 ? ((line.salePrice - oldUnitCost) / line.salePrice) * 100 : 0;
      const newMargin = line.salePrice > 0 ? ((line.salePrice - newUnitCost) / line.salePrice) * 100 : 0;
      return {
        date: new Date().toISOString(),
        productRef: line.productRef,
        productName: line.productName,
        oldCost: oldUnitCost,
        newCost: newUnitCost,
        oldMargin,
        newMargin,
        oldSellPrice: line.salePrice,
        newSellPrice: line.salePrice,
        orderId: order.id,
        supplierName: order.supplierName || '',
        changedBy: 'Sophie Fontaine',
      };
    });
    const allCostHistory = [...costHistory, ...newCostEntries];
    setCostHistory(allCostHistory);
    localStorage.setItem(`beautypos_cost_history_${order.id}`, JSON.stringify(allCostHistory));

    await supplierOrderService.update(order.id, {
      transportCost: getEC('transport'), customsCost: getEC('customs'), vatImport: getEC('vat'),
      freightForwarderCost: getEC('freight'), bankFees: getEC('bank'), exchangeFees: getEC('exchange'),
      localDelivery: getEC('local'), otherCosts: getEC('other'),
      totalRealCost: businessCost, costMethod, costsValidated: true,
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
    const structureAmountLocal = importCostLocal * (structurePct / 100);
    const businessCostLocal = importCostLocal + structureAmountLocal;
    const linesLocal = order.lines || [];
    const totalQtyLocal = linesLocal.reduce((s, l) => s + l.qtyOrdered, 0);
    const avgCostPerProductLocal = totalQtyLocal > 0 ? businessCostLocal / totalQtyLocal : 0;

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
      changedBy: 'Sophie Fontaine',
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
          changed_by: 'Sophie Fontaine',
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
    const structureAmountLocal2 = importCostLocal2 * (structurePct / 100);
    const businessCostLocal2 = importCostLocal2 + structureAmountLocal2;
    const totalQtyLocal2 = lines.reduce((s, l) => s + l.qtyOrdered, 0);
    const avgCostPerProductLocal2 = totalQtyLocal2 > 0 ? businessCostLocal2 / totalQtyLocal2 : 0;

    const productUpdates = JSON.parse(localStorage.getItem('beautypos_bulk_cost_updates') || '{}');
    lines.forEach((line) => {
      productUpdates[line.productRef] = {
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
      .select('id, name, ref, buy_price, sell_price_ttc')
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
    const supabase = createClient();
    const originalIds = new Set(order.lines?.map((l) => l.id) ?? []);

    // Delete removed lines
    for (const orig of order.lines ?? []) {
      if (!editedLines.some((el) => el.id === orig.id)) {
        await supplierOrderService.deleteLine(orig.id);
      }
    }

    // Update existing lines
    for (const el of editedLines.filter((l) => !l.id.startsWith('new-') && originalIds.has(l.id))) {
      await supplierOrderService.updateLine(el.id, {
        qtyOrdered: el.qtyOrdered,
        unitPrice: el.unitPrice,
        lineTotal: el.qtyOrdered * el.unitPrice,
      });
    }

    // Add new lines
    for (const nl of editedLines.filter((l) => l.id.startsWith('new-'))) {
      await supplierOrderService.addLine({
        orderId: order.id,
        productId: nl.productId,
        productName: nl.productName,
        productRef: nl.productRef,
        qtyOrdered: nl.qtyOrdered,
        unitPrice: nl.unitPrice,
        salePrice: nl.salePrice,
      });
    }

    // Recalculate subtotal
    const newSubtotal = editedLines.reduce((s, l) => s + l.qtyOrdered * l.unitPrice, 0);
    await supplierOrderService.update(order.id, {
      notes: editNotes,
      transportCost: editTransport,
      customsCost: editCustoms,
      subtotal: newSubtotal,
    });

    setEditMode(false);
    setSavingEdit(false);
    load();
  };

  const handleSendOrder = async () => {
    if (!order) return;
    setSendingOrder(true);
    await supplierOrderService.changeStatus(order.id, 'sent', 'Admin', 'Commande envoyée au fournisseur');
    setSendingOrder(false);
    load();
  };

  const handleFullReception = async () => {
    if (!order) return;
    await supplierOrderService.changeStatus(order.id, 'fully_received', 'Sophie Fontaine', 'Réception totale');
    const qtys: Record<string, number> = {};
    (order.lines || []).forEach(l => { qtys[l.id] = l.qtyOrdered; });
    await updateStockForReception(qtys);
    load();
  };

  const handlePartialReception = async () => {
    if (!order) return;
    await supplierOrderService.changeStatus(order.id, 'partially_received', 'Sophie Fontaine', 'Réception partielle');
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

  // Internal business cost = products + ALL fees + structure %
  const totalFees = getEC('transport') + getEC('customs') + getEC('vat') + getEC('freight') + getEC('bank') + getEC('exchange') + getEC('local') + getEC('other');
  const importCost = order.subtotal + totalFees;
  const structureAmount = importCost * (structurePct / 100);
  const businessCost = importCost + structureAmount;

  const lines = order.lines || [];
  const totalQty = lines.reduce((s, l) => s + l.qtyOrdered, 0);
  const avgCostPerProduct = totalQty > 0 ? businessCost / totalQty : 0;
  const totalSalePrice = lines.reduce((s, l) => s + l.salePrice * l.qtyOrdered, 0);
  const grossMarginAmt = totalSalePrice > 0 ? totalSalePrice - businessCost : 0;
  const grossMarginPct = totalSalePrice > 0 ? (grossMarginAmt / totalSalePrice) * 100 : 0;
  const netMarginPct = grossMarginPct - structurePct;

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
            {order.orderStatus === 'draft' && (
              <>
                {!editMode && (
                  <button
                    onClick={enterEditMode}
                    className="flex items-center gap-2 px-3 py-2 border border-primary text-primary rounded-lg text-sm font-500 hover:bg-primary/5 transition-colors"
                  >
                    <Icon name="PencilIcon" size={15} />
                    Modifier
                  </button>
                )}
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
              </>
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
            <button
              onClick={() => setShowStatusModal(true)}
              className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm font-500 hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={15} />
              Changer statut
            </button>
          </div>
        </div>

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

        {/* Overview */}
        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-4">Informations commande</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    { label: 'Fournisseur', value: order.supplierName || '—' },
                    { label: 'Devise', value: `${order.currency} (×${order.exchangeRate})` },
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
                </div>
                {order.notes && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{order.notes}</p>
                  </div>
                )}
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Montant produits</span><span className="font-500">{order.subtotal.toFixed(2)} {order.currency}</span></div>
                  {supplierExtraFees > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Frais inclus fournisseur</span><span>{supplierExtraFees.toFixed(2)} {order.currency}</span></div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-700 text-blue-700">
                    <span>À payer fournisseur</span>
                    <span>{supplierPaymentAmount.toFixed(2)} {order.currency}</span>
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
                  <div className="flex justify-between"><span className="text-muted-foreground">Coût import réel</span><span className="font-500">{importCost.toFixed(2)} {order.currency}</span></div>
                  {structurePct > 0 && (
                    <div className="flex justify-between text-purple-700"><span>Frais structure ({structurePct}%)</span><span>{structureAmount.toFixed(2)} {order.currency}</span></div>
                  )}
                  <div className="border-t border-border pt-2 flex justify-between font-700 text-purple-700">
                    <span>Coût business réel</span>
                    <span>{businessCost.toFixed(2)} {order.currency}</span>
                  </div>
                  {totalSalePrice > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-600"><span>Marge brute</span><span className="font-600">{grossMarginPct.toFixed(1)}%</span></div>
                      <div className={`flex justify-between font-600 ${netMarginPct >= 20 ? 'text-emerald-600' : netMarginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
                        <span>Marge nette est.</span><span>{netMarginPct.toFixed(1)}%</span>
                      </div>
                    </>
                  )}
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
                          <td colSpan={3} className="px-4 py-2 text-sm text-muted-foreground">Sous-total</td>
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
                  <div className="mt-3 bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between text-purple-800">
                      <span>+ Frais structure ({structurePct}%)</span>
                      <span className="font-600">{structureAmount.toFixed(2)} {order.currency}</span>
                    </div>
                    <p className="text-[10px] text-purple-400">Loyer · Salaires · Assurance · Charges fixes</p>
                  </div>
                  <div className="mt-3 bg-purple-100/60 border border-purple-200 rounded-lg p-3 space-y-1.5 text-sm">
                    <div className="flex justify-between font-700 text-purple-800 text-base">
                      <span>= Coût business réel final</span>
                      <span>{businessCost.toFixed(2)} {order.currency}</span>
                    </div>
                    {totalQty > 0 && (
                      <div className="flex justify-between text-xs text-purple-600">
                        <span>Coût moyen / produit ({totalQty} unités)</span>
                        <span className="font-600">{avgCostPerProduct.toFixed(2)} {order.currency}</span>
                      </div>
                    )}
                    {totalSalePrice > 0 && (
                      <>
                        <div className="flex justify-between text-xs text-emerald-700 font-600">
                          <span>Marge brute</span><span>{grossMarginPct.toFixed(1)}%</span>
                        </div>
                        <div className={`flex justify-between text-xs font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                          <span>Marge nette estimée</span><span>{netMarginPct.toFixed(1)}%</span>
                        </div>
                      </>
                    )}
                  </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Coût import réel', value: `${importCost.toFixed(2)} ${order.currency}`, icon: 'ShoppingBagIcon', color: 'text-blue-600 bg-blue-50' },
                { label: `Frais structure (${structurePct}%)`, value: `${structureAmount.toFixed(2)} ${order.currency}`, icon: 'BuildingOfficeIcon', color: 'text-purple-600 bg-purple-50' },
                { label: 'Coût business réel', value: `${businessCost.toFixed(2)} ${order.currency}`, icon: 'CalculatorIcon', color: 'text-red-600 bg-red-50' },
                { label: 'Marge brute estimée', value: totalSalePrice > 0 ? `${grossMarginPct.toFixed(1)}%` : '—', icon: 'ChartBarIcon', color: 'text-emerald-600 bg-emerald-50' },
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
                <div className="bg-purple-50 rounded-xl p-4">
                  <p className="text-xs text-purple-600 font-600 uppercase mb-2">Frais structure</p>
                  <p className="text-xl font-700 text-purple-700">{structureAmount.toFixed(2)} {order.currency}</p>
                  <p className="text-xs text-purple-500 mt-1">{structurePct}% du coût import</p>
                </div>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-xs text-red-600 font-600 uppercase mb-2">Coût business réel final</p>
                  <p className="text-xl font-700 text-red-700">{businessCost.toFixed(2)} {order.currency}</p>
                  <p className="text-xs text-red-500 mt-1">Import + structure</p>
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
                    <div className={`rounded-xl p-4 ${netMarginPct >= 20 ? 'bg-emerald-50' : netMarginPct >= 10 ? 'bg-amber-50' : 'bg-red-50'}`}>
                      <p className={`text-xs font-600 uppercase mb-2 ${netMarginPct >= 20 ? 'text-emerald-600' : netMarginPct >= 10 ? 'text-amber-600' : 'text-red-600'}`}>Marge nette estimée</p>
                      <p className={`text-xl font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>{netMarginPct.toFixed(1)}%</p>
                      <p className={`text-xs mt-1 ${netMarginPct >= 20 ? 'text-emerald-500' : netMarginPct >= 10 ? 'text-amber-500' : 'text-red-500'}`}>Marge brute − structure</p>
                    </div>
                  </>
                )}
              </div>
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
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coût import réel</span>
                    <span className="font-500">{importCost.toFixed(2)} {order.currency}</span>
                  </div>
                  <div className="flex justify-between text-purple-700">
                    <span>Frais structure ({structurePct}%)</span>
                    <span className="font-500">{structureAmount.toFixed(2)} {order.currency}</span>
                  </div>
                  <div className="border-t-2 border-purple-200 pt-2 flex justify-between font-700 text-purple-800 text-base">
                    <span>Coût business réel final</span>
                    <span>{businessCost.toFixed(2)} {order.currency}</span>
                  </div>
                  {totalSalePrice > 0 && (
                    <>
                      <div className="flex justify-between text-emerald-700 font-600">
                        <span>Marge brute</span><span>{grossMarginPct.toFixed(1)}%</span>
                      </div>
                      <div className={`flex justify-between font-700 ${netMarginPct >= 20 ? 'text-emerald-700' : netMarginPct >= 10 ? 'text-amber-700' : 'text-red-700'}`}>
                        <span>Marge nette estimée</span><span>{netMarginPct.toFixed(1)}%</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-purple-100">
                  <p className="text-[10px] text-purple-400 italic">Ce montant sert uniquement au calcul de rentabilité. Il ne doit pas être utilisé pour calculer le solde dû fournisseur.</p>
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
