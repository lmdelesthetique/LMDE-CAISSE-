'use client';

export interface StockProduct {
  id: string;
  ref: string;
  name: string;
  category: string;
  supplier: string;
  supplierId?: string;
  supplierIdSecondary?: string;
  purchasePriceSupplier: number;
  minOrderQty: number;
  avgRestockDays: number;
  productStatus: string;
  imageUrl: string;
  buyPrice: number;
  costPrice: number;
  sellPriceTtc: number;
  margin: number;
  marginRate: number;
  stock: number;
  stockReserved: number;
  stockTransitContainer: number;
  stockTransitAvion: number;
  stockDamaged: number;
  stockSuspended: number;
  minStock: number;
  /** Live-computed from stock_movements_log — always accurate */
  sales7d: number;
  sales30d: number;
  sales90d: number;
  supplierLeadDays: number;
  isSuspended: boolean;
  status: string;
  stockStatus: 'ok' | 'faible' | 'rupture' | 'commande' | 'suspendu' | 'inactif';
  daysBeforeStockout: number | null;
  suggestedReorder: number;
  totalStockValue: number;
}

export interface StockKPIs {
  totalStockValue: number;
  dormantStockValue: number;
  profitableStockValue: number;
  ruptureCount: number;
  atRiskCount: number;
  transitCount: number;
  reservedCount: number;
  globalMargin: number;
  totalProducts: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  movementType: string;
  quantityBefore: number;
  quantityAfter: number;
  quantityChange: number;
  reason: string;
  reference: string;
  performedBy: string;
  createdAt: string;
}

export interface TransitOrder {
  id: string;
  orderNumber: string;
  supplierName: string;
  orderStatus: string;
  transportType: 'container' | 'avion' | 'standard';
  totalAmount: number;
  expectedDeliveryAt: string | null;
  itemsCount: number;
  currency: string;
}

function computeStockStatus(p: {
  stock: number;
  minStock: number;
  isSuspended: boolean;
  stockTransitContainer: number;
  stockTransitAvion: number;
  productStatus?: string;
}): 'ok' | 'faible' | 'rupture' | 'commande' | 'suspendu' | 'inactif' {
  if (p.productStatus === 'inactive' || p.productStatus === 'archived') return 'inactif';
  if (p.isSuspended) return 'suspendu';
  if (p.stock <= 0) return 'rupture';
  if (p.stockTransitContainer > 0 || p.stockTransitAvion > 0) return 'commande';
  if (p.stock <= p.minStock) return 'faible';
  return 'ok';
}

function computeDaysBeforeStockout(stock: number, sales7d: number): number | null {
  if (sales7d <= 0) return null;
  const dailyRate = sales7d / 7;
  return Math.floor(stock / dailyRate);
}

function computeSuggestedReorder(p: {
  stock: number;
  minStock: number;
  sales30d: number;
  stockTransitContainer: number;
  stockTransitAvion: number;
  stockReserved: number;
  supplierLeadDays: number;
}): number {
  const dailyRate = p.sales30d / 30;
  const transitTotal = p.stockTransitContainer + p.stockTransitAvion;
  const safetyBuffer = Math.ceil(dailyRate * p.supplierLeadDays * 1.3);
  const needed = safetyBuffer - p.stock - transitTotal + p.stockReserved;
  return Math.max(0, Math.ceil(needed / 6) * 6);
}

function mapProduct(r: Record<string, unknown>): StockProduct {
  const stock = Number(r.stock) || 0;
  const minStock = Number(r.min_stock) || 5;
  const buyPrice = Number(r.buy_price) || 0;
  const transport = Number(r.transport) || 0;
  const customs = Number(r.customs) || 0;
  const otherFees = Number(r.other_fees) || 0;
  const structurePct = Number(r.structure_pct) || 0;
  const baseCost = buyPrice + transport + customs + otherFees;
  const costPrice = baseCost + baseCost * (structurePct / 100);
  const sellPriceTtc = Number(r.sell_price_ttc) || 0;
  const sellPriceHt = Number(r.sell_price_ht) || sellPriceTtc / 1.085 || 0;
  const margin = sellPriceHt - costPrice;
  const marginRate = sellPriceHt > 0 ? (margin / sellPriceHt) * 100 : 0;
  const stockTransitContainer = Number(r.stock_transit_container) || 0;
  const stockTransitAvion = Number(r.stock_transit_avion) || 0;
  const stockReserved = Number(r.stock_reserved) || 0;
  const isSuspended = Boolean(r.is_suspended);
  const sales7d = Number(r.sales_7d) || 0;
  const sales30d = Number(r.sales_30d) || 0;
  const supplierLeadDays = Number(r.avg_restock_days) || Number(r.supplier_lead_days) || 21;

  const productStatus = (r.product_status as string) || 'active';
  const stockStatus = computeStockStatus({ stock, minStock, isSuspended, stockTransitContainer, stockTransitAvion, productStatus });
  const daysBeforeStockout = computeDaysBeforeStockout(stock, sales7d);
  const suggestedReorder = computeSuggestedReorder({ stock, minStock, sales30d, stockTransitContainer, stockTransitAvion, stockReserved, supplierLeadDays });

  return {
    id: r.id as string,
    ref: (r.ref as string) || '',
    name: (r.name as string) || '',
    category: (r.category as string) || '',
    supplier: (r.supplier as string) || '',
    supplierId: (r.supplier_id as string) || undefined,
    supplierIdSecondary: (r.supplier_id_secondary as string) || undefined,
    purchasePriceSupplier: Number(r.purchase_price_supplier) || buyPrice,
    minOrderQty: Number(r.min_order_qty) || 1,
    avgRestockDays: supplierLeadDays,
    productStatus,
    imageUrl: (r.image_url as string) || '',
    buyPrice,
    costPrice,
    sellPriceTtc,
    margin,
    marginRate,
    stock,
    stockReserved,
    stockTransitContainer,
    stockTransitAvion,
    stockDamaged: Number(r.stock_damaged) || 0,
    stockSuspended: Number(r.stock_suspended) || 0,
    minStock,
    sales7d,
    sales30d,
    sales90d: 0,
    supplierLeadDays,
    isSuspended,
    status: (r.status as string) || 'active',
    stockStatus,
    daysBeforeStockout,
    suggestedReorder,
    totalStockValue: stock * (costPrice > 0 ? costPrice : sellPriceTtc),
  };
}

export async function fetchStockProducts(search?: string): Promise<StockProduct[]> {
  const now = Date.now();
  const since30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d  = new Date(now -  7 * 24 * 60 * 60 * 1000).toISOString();

  // Use admin API route to bypass RLS on all three tables
  const res = await fetch('/api/stock/products').catch(() => null);
  if (!res?.ok) return [];
  const { products: data, receipts: receiptRows, movements: shopifyMoves, since90d } = await res.json();

  // Client-side search filter
  const filtered = search?.trim()
    ? (data as Record<string, unknown>[]).filter(r => {
        const q = search.toLowerCase();
        return (
          String(r.name || '').toLowerCase().includes(q) ||
          String(r.ref || '').toLowerCase().includes(q) ||
          String(r.supplier || '').toLowerCase().includes(q) ||
          String(r.category || '').toLowerCase().includes(q)
        );
      })
    : data as Record<string, unknown>[];

  // Aggregate sales per product over 7 / 30 / 90 day windows
  const salesMap: Record<string, { s7: number; s30: number; s90: number }> = {};

  // Source 1: POS receipts (main source)
  for (const receipt of receiptRows ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const id = item.product_id as string;
      if (!id || item.is_free_price) continue;
      if (!salesMap[id]) salesMap[id] = { s7: 0, s30: 0, s90: 0 };
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      salesMap[id].s90 += qty;
      if (createdAt >= since30d) salesMap[id].s30 += qty;
      if (createdAt >= since7d)  salesMap[id].s7  += qty;
    }
  }

  // Source 2: Shopify movements log (Shopify-originated sales not in receipts)
  for (const m of shopifyMoves ?? []) {
    const id = m.product_id as string;
    if (!id) continue;
    if (!salesMap[id]) salesMap[id] = { s7: 0, s30: 0, s90: 0 };
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    salesMap[id].s90 += qty;
    if (createdAt >= since30d) salesMap[id].s30 += qty;
    if (createdAt >= since7d)  salesMap[id].s7  += qty;
  }

  return filtered.map((r: Record<string, unknown>) => {
    const p = mapProduct(r);
    const s = salesMap[p.id];
    if (s) {
      p.sales7d  = s.s7;
      p.sales30d = s.s30;
      p.sales90d = s.s90;
      // Recompute derived metrics with live sales data
      p.daysBeforeStockout = computeDaysBeforeStockout(p.stock, s.s7);
      p.suggestedReorder   = computeSuggestedReorder({
        stock: p.stock,
        minStock: p.minStock,
        sales30d: s.s30,
        stockTransitContainer: p.stockTransitContainer,
        stockTransitAvion: p.stockTransitAvion,
        stockReserved: p.stockReserved,
        supplierLeadDays: p.supplierLeadDays,
      });
    }
    return p;
  });
}

/**
 * Lookup a product by barcode (barcode column first, then ref field).
 * Used for barcode scanner integration (USB scanner + camera).
 */
export async function fetchProductByBarcode(barcode: string): Promise<StockProduct | null> {
  // Use admin search API (bypasses RLS), then fetch full product data by ID
  const searchRes = await fetch(`/api/products/search?q=${encodeURIComponent(barcode)}&limit=5`).catch(() => null);
  if (!searchRes?.ok) return null;
  const { products } = await searchRes.json();
  const exact = (products as any[]).find(
    (p: any) => p.barcode?.toLowerCase() === barcode.toLowerCase() || p.ref?.toLowerCase() === barcode.toLowerCase()
  );
  if (!exact) return null;
  const fullRes = await fetch(`/api/products/${exact.id}`).catch(() => null);
  if (!fullRes?.ok) return mapProduct(exact as Record<string, unknown>);
  return mapProduct(await fullRes.json());
}

export async function fetchStockKPIs(products: StockProduct[]): Promise<StockKPIs> {
  const totalStockValue = products.reduce((s, p) => s + p.totalStockValue, 0);
  const dormantProducts = products.filter(p => p.sales30d === 0 && p.stock > 0 && p.productStatus !== 'inactive');
  const dormantStockValue = dormantProducts.reduce((s, p) => s + p.totalStockValue, 0);
  const profitableProducts = products.filter(p => p.marginRate > 40);
  const profitableStockValue = profitableProducts.reduce((s, p) => s + p.totalStockValue, 0);
  const ruptureCount = products.filter(p => p.stockStatus === 'rupture').length;
  const atRiskCount = products.filter(p => p.stockStatus === 'faible' || (p.daysBeforeStockout !== null && p.daysBeforeStockout < 7)).length;
  const transitCount = products.filter(p => p.stockTransitContainer > 0 || p.stockTransitAvion > 0).length;
  const reservedCount = products.filter(p => p.stockReserved > 0).length;
  const totalRevenue = products.reduce((s, p) => s + p.sellPriceTtc * p.stock, 0);
  const totalCost = products.reduce((s, p) => s + p.costPrice * p.stock, 0);
  const globalMargin = totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0;

  return {
    totalStockValue,
    dormantStockValue,
    profitableStockValue,
    ruptureCount,
    atRiskCount,
    transitCount,
    reservedCount,
    globalMargin,
    totalProducts: products.filter(p => p.productStatus !== 'inactive' && p.productStatus !== 'archived').length,
  };
}

export async function fetchMovementHistory(productId?: string, limit = 50): Promise<StockMovement[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (productId) params.set('productId', productId);
  const res = await fetch(`/api/stock/movements?${params}`).catch(() => null);
  if (!res?.ok) return [];
  const data: Record<string, unknown>[] = await res.json();
  return (data || []).map((r) => ({
    id: r.id as string,
    productId: r.product_id as string,
    productName: r.product_name as string,
    movementType: r.movement_type as string,
    quantityBefore: Number(r.quantity_before) || 0,
    quantityAfter: Number(r.quantity_after) || 0,
    quantityChange: Number(r.quantity_change) || 0,
    reason: (r.reason as string) || '',
    reference: (r.reference as string) || '',
    performedBy: (r.performed_by as string) || 'Admin',
    createdAt: r.created_at as string,
  }));
}

export async function fetchTransitOrders(): Promise<TransitOrder[]> {
  const res = await fetch('/api/stock/transit').catch(() => null);
  if (!res?.ok) return [];
  return res.json();
}

export async function addStock(productId: string, productName: string, currentStock: number, qty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  // Use admin API route (bypass RLS)
  try {
    const res = await fetch('/api/products/stock-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, productName, currentStock, qty, reason, performedBy }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch (e) { console.error('addStock', e); return false; }
}

export async function removeStock(productId: string, productName: string, currentStock: number, qty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const newQty = Math.max(0, currentStock - qty);
  const statusUpdate = newQty === 0 ? { status: 'rupture', product_status: 'rupture' } : {};
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock: newQty,
        updated_at: new Date().toISOString(),
        ...statusUpdate,
        stockMovement: {
          product_id: productId,
          product_name: productName,
          movement_type: 'exit',
          quantity_before: currentStock,
          quantity_after: newQty,
          quantity_change: -qty,
          reason,
          performed_by: performedBy,
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) { console.error('removeStock', data.error); return false; }
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, delta: -qty, newStock: newQty }] }),
    }).catch(() => {});
    return true;
  } catch (e) { console.error('removeStock', e); return false; }
}

export async function adjustStock(productId: string, productName: string, currentStock: number, newQty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const delta = newQty - currentStock;
  const statusUpdate = newQty === 0
    ? { status: 'rupture', product_status: 'rupture' }
    : (currentStock <= 0 && newQty > 0 ? { status: 'active', product_status: 'active' } : {});
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock: newQty,
        updated_at: new Date().toISOString(),
        ...statusUpdate,
        stockMovement: {
          product_id: productId,
          product_name: productName,
          movement_type: 'adjustment',
          quantity_before: currentStock,
          quantity_after: newQty,
          quantity_change: delta,
          reason,
          performed_by: performedBy,
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) { console.error('adjustStock', data.error); return false; }
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, delta, newStock: newQty }] }),
    }).catch(() => {});
    return true;
  } catch (e) { console.error('adjustStock', e); return false; }
}

export async function suspendProduct(productId: string, productName: string, currentStock: number, performedBy = 'Admin'): Promise<boolean> {
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        is_suspended: true,
        status: 'suspended',
        updated_at: new Date().toISOString(),
        stockMovement: {
          product_id: productId,
          product_name: productName,
          movement_type: 'suspended',
          quantity_before: currentStock,
          quantity_after: currentStock,
          quantity_change: 0,
          reason: 'Produit suspendu',
          performed_by: performedBy,
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) { console.error('suspendProduct', data.error); return false; }
    return true;
  } catch (e) { console.error('suspendProduct', e); return false; }
}

export async function markProductAsOrdered(
  productId: string,
  productName: string,
  currentStock: number
): Promise<boolean> {
  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_status: 'en_commande',
        stockMovement: {
          product_id: productId,
          product_name: productName,
          movement_type: 'adjustment',
          quantity_before: currentStock,
          quantity_after: currentStock,
          quantity_change: 0,
          reason: 'Produit mis en commande fournisseur',
          performed_by: 'Admin',
        },
      }),
    });
    const data = await res.json();
    if (!data.ok) { console.error('markProductAsOrdered', data.error); return false; }
    return true;
  } catch (e) { console.error('markProductAsOrdered', e); return false; }
}

export async function fetchProductsBySupplier(supplierId: string, supplierName?: string): Promise<StockProduct[]> {
  const params = new URLSearchParams({ supplierId, all: 'true' });
  if (supplierName) params.set('supplierName', supplierName);
  const res = await fetch(`/api/products/list?${params}`).catch(() => null);
  if (!res?.ok) return [];
  const data: Record<string, unknown>[] = await res.json();
  return data.map(mapProduct);
}

export async function updateProductSupplier(
  productId: string,
  supplierId: string | null,
  purchasePrice?: number,
  minOrderQty?: number,
  avgRestockDays?: number
): Promise<boolean> {
  const updateData: Record<string, unknown> = { supplier_id: supplierId };
  if (purchasePrice !== undefined) updateData.purchase_price_supplier = purchasePrice;
  if (minOrderQty !== undefined) updateData.min_order_qty = minOrderQty;
  if (avgRestockDays !== undefined) updateData.avg_restock_days = avgRestockDays;

  try {
    const res = await fetch(`/api/products/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    });
    const data = await res.json();
    if (!data.ok) { console.error('updateProductSupplier', data.error); return false; }
    return true;
  } catch (e) { console.error('updateProductSupplier', e); return false; }
}

/**
 * Fetch current stock for a single product (for real-time check before adding to cart)
 */
export async function fetchProductStockById(productId: string): Promise<{ stock: number; name: string } | null> {
  const res = await fetch(`/api/products/${productId}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  if (!data?.id) return null;
  return { stock: Number(data.stock) || 0, name: data.name as string };
}

export async function setProductInactive(productId: string, reactivate = false): Promise<boolean> {
  const res = await fetch(`/api/products/${productId}/set-inactive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reactivate }),
  });
  return res.ok;
}

export async function fetchProductById(productId: string): Promise<StockProduct | null> {
  const res = await fetch(`/api/products/${productId}`).catch(() => null);
  if (!res?.ok) return null;
  const data = await res.json();
  return mapProduct(data as Record<string, unknown>);
}

/**
 * Deduct stock for all items sold in a POS sale.
 * Delegates to admin API route to bypass RLS.
 */
export async function deductStockForSale(
  items: Array<{ productId: string; name: string; qty: number; isFreePrice?: boolean; kitComponents?: Array<{ componentId: string; name: string; quantity: number }> }>,
  ticketRef: string,
  paymentMethod: string,
  cashierName: string,
  ticketStatus?: string,
  ticketType?: string
): Promise<{ success: boolean; errors: string[] }> {
  try {
    const res = await fetch('/api/products/deduct-sale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, ticketRef, paymentMethod, cashierName, ticketStatus, ticketType }),
    });
    if (!res.ok) return { success: false, errors: [`Erreur serveur: ${res.status}`] };
    const data = await res.json();
    // Non-blocking: recalculate sales counters
    const soldIds = [...new Set(
      items.filter(i => !i.isFreePrice && i.productId && !i.productId.startsWith('free-')).map(i => i.productId)
    )];
    if (soldIds.length > 0) {
      recalculateSalesCounters(soldIds).catch(() => {});
    }
    return data;
  } catch (e: any) {
    return { success: false, errors: [e.message] };
  }
}

/**
 * Recompute sales_7d and sales_30d for one or more products.
 * Delegates to admin API route to bypass RLS.
 */
export async function recalculateSalesCounters(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  await fetch('/api/products/recalculate-sales', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productIds }),
  }).catch(() => {});
}
