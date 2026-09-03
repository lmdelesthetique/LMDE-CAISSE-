'use client';

import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

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
  if (p.productStatus === 'inactive') return 'inactif';
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
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();

  // Parallel: products + POS receipts (true sales source) + Shopify log
  const [data, { data: receiptRows }, { data: shopifyMoves }] = await Promise.all([
    fetchAll<Record<string, unknown>>((from, to) => {
      if (search && search.trim()) {
        return supabase
          .from('products')
          .select('*')
          .or(`name.ilike.%${search.trim()}%,ref.ilike.%${search.trim()}%,supplier.ilike.%${search.trim()}%,category.ilike.%${search.trim()}%`)
          .order('name')
          .range(from, to);
      }
      return supabase
        .from('products')
        .select('*')
        .order('name')
        .range(from, to);
    }),
    // POS receipts — items JSONB has { product_id, qty }
    supabase
      .from('receipts')
      .select('items, created_at, is_demo, payment_type')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .neq('payment_type', 'avoir')
      .limit(200000),
    // Shopify sales recorded in movements log
    supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .eq('movement_type', 'sale')
      .gte('created_at', since90d)
      .limit(100000),
  ]);

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

  return data.map(r => {
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
  // Try barcode column first
  const { data: byBarcode } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .limit(1)
    .maybeSingle();

  if (byBarcode) return mapProduct(byBarcode as Record<string, unknown>);

  // Fallback: try ref column (case-insensitive)
  const { data: byRef, error } = await supabase
    .from('products')
    .select('*')
    .ilike('ref', barcode)
    .limit(1)
    .maybeSingle();

  if (error || !byRef) return null;
  return mapProduct(byRef as Record<string, unknown>);
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
    totalProducts: products.length,
  };
}

export async function fetchMovementHistory(productId?: string, limit = 50): Promise<StockMovement[]> {
  let query = supabase
    .from('stock_movements_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchMovementHistory', error); return []; }

  return (data || []).map((r: Record<string, unknown>) => ({
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
  const { data, error } = await supabase
    .from('fo_orders')
    .select(`
      id, order_number, order_status, currency, total_real_cost,
      expected_delivery_at, transport_cost,
      suppliers(company_name)
    `)
    .in('order_status', ['shipped', 'partially_received', 'in_production', 'ready_to_ship', 'paid'])
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) { console.error('fetchTransitOrders', error); return []; }

  return (data || []).map((r: Record<string, unknown>) => {
    const supplier = r.suppliers as Record<string, unknown> | null;
    const status = r.order_status as string;
    let transportType: 'container' | 'avion' | 'standard' = 'standard';
    if (r.transport_cost && Number(r.transport_cost) > 500) transportType = 'container';
    else if (r.transport_cost && Number(r.transport_cost) > 100) transportType = 'avion';

    return {
      id: r.id as string,
      orderNumber: r.order_number as string,
      supplierName: supplier?.company_name as string || 'Fournisseur',
      orderStatus: status,
      transportType,
      totalAmount: Number(r.total_real_cost) || 0,
      expectedDeliveryAt: r.expected_delivery_at as string | null,
      itemsCount: 0,
      currency: (r.currency as string) || 'EUR',
    };
  });
}

export async function addStock(productId: string, productName: string, currentStock: number, qty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const newQty = currentStock + qty;
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId);
  // Restore active status only for non-inactive products
  if (!updateError && newQty > 0 && currentStock <= 0) {
    await supabase.from('products')
      .update({ status: 'active', product_status: 'active' })
      .eq('id', productId)
      .neq('product_status', 'inactive');
  }

  if (updateError) { console.error('addStock', updateError); return false; }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName,
    movement_type: 'entry',
    quantity_before: currentStock,
    quantity_after: newQty,
    quantity_change: qty,
    reason,
    performed_by: performedBy,
  });

  // Non-blocking Shopify sync (absolute value)
  if (typeof window !== 'undefined') {
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, delta: qty, newStock: newQty }] }),
    }).catch(() => {});
  }

  return true;
}

export async function removeStock(productId: string, productName: string, currentStock: number, qty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const newQty = Math.max(0, currentStock - qty);
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId);
  // Set rupture only for non-inactive products
  if (!updateError && newQty === 0) {
    await supabase.from('products')
      .update({ status: 'rupture', product_status: 'rupture' })
      .eq('id', productId)
      .neq('product_status', 'inactive');
  }

  if (updateError) { console.error('removeStock', updateError); return false; }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName,
    movement_type: 'exit',
    quantity_before: currentStock,
    quantity_after: newQty,
    quantity_change: -qty,
    reason,
    performed_by: performedBy,
  });

  // Non-blocking Shopify sync (absolute value)
  if (typeof window !== 'undefined') {
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, delta: -qty, newStock: newQty }] }),
    }).catch(() => {});
  }

  return true;
}

export async function adjustStock(productId: string, productName: string, currentStock: number, newQty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (updateError) { console.error('adjustStock', updateError); return false; }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName,
    movement_type: 'adjustment',
    quantity_before: currentStock,
    quantity_after: newQty,
    quantity_change: newQty - currentStock,
    reason,
    performed_by: performedBy,
  });

  // Non-blocking Shopify sync with absolute value (adjustment must set exact qty, not delta)
  if (typeof window !== 'undefined') {
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ productId, delta: newQty - currentStock, newStock: newQty }] }),
    }).catch(() => {});
  }

  return true;
}

export async function suspendProduct(productId: string, productName: string, currentStock: number, performedBy = 'Admin'): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .update({ is_suspended: true, status: 'suspended', updated_at: new Date().toISOString() })
    .eq('id', productId);

  if (error) { console.error('suspendProduct', error); return false; }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName,
    movement_type: 'suspended',
    quantity_before: currentStock,
    quantity_after: currentStock,
    quantity_change: 0,
    reason: 'Produit suspendu',
    performed_by: performedBy,
  });

  return true;
}

export async function markProductAsOrdered(
  productId: string,
  productName: string,
  currentStock: number
): Promise<boolean> {
  const { error } = await supabase
    .from('products')
    .update({ product_status: 'en_commande' })
    .eq('id', productId);
  if (error) { console.error('markProductAsOrdered', error); return false; }

  await supabase.from('stock_movements_log').insert({
    product_id: productId,
    product_name: productName,
    movement_type: 'adjustment',
    quantity_before: currentStock,
    quantity_after: currentStock,
    quantity_change: 0,
    reason: 'Produit mis en commande fournisseur',
    performed_by: 'Admin',
  });
  return true;
}

export async function fetchProductsBySupplier(supplierId: string, supplierName?: string): Promise<StockProduct[]> {
  // Match by UUID column OR by text name column (case-insensitive) — whichever has data
  const orFilter = supplierName
    ? `supplier_id.eq.${supplierId},supplier.ilike.${supplierName}`
    : `supplier_id.eq.${supplierId}`;

  return fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from('products')
      .select('*')
      .or(orFilter)
      .order('name')
      .range(from, to)
  ).then(data => data.map(mapProduct)).catch(e => { console.error('fetchProductsBySupplier', e); return []; });
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

  const { error } = await supabase.from('products').update(updateData).eq('id', productId);
  if (error) { console.error('updateProductSupplier', error); return false; }
  return true;
}

/**
 * Fetch current stock for a single product (for real-time check before adding to cart)
 */
export async function fetchProductStockById(productId: string): Promise<{ stock: number; name: string } | null> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, stock')
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) return null;
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
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProduct(data as Record<string, unknown>);
}

/**
 * Deduct stock for all items sold in a POS sale.
 * Records one stock_movements_log entry per product.
 * For kit products, deducts each kit component individually.
 */
export async function deductStockForSale(
  items: Array<{ productId: string; name: string; qty: number; isFreePrice?: boolean; kitComponents?: Array<{ componentId: string; name: string; quantity: number }> }>,
  ticketRef: string,
  paymentMethod: string,
  cashierName: string,
  ticketStatus?: string,
  ticketType?: string
): Promise<{ success: boolean; errors: string[] }> {
  // Guard: only deduct stock for paid/completed sales or explicit vente type
  if (
    ticketStatus !== undefined &&
    ticketStatus !== 'paid' &&
    ticketStatus !== 'completed' &&
    ticketType !== 'vente'
  ) {
    return { success: true, errors: [] };
  }

  const errors: string[] = [];
  const shopifySyncItems: Array<{ productId: string; delta: number; newStock: number }> = [];

  for (const item of items) {
    // Skip free-price items (no product ID in DB)
    if (item.isFreePrice || !item.productId || item.productId.startsWith('free-')) continue;

    // Fetch current stock
    const { data: productData, error: fetchError } = await supabase
      .from('products')
      .select('id, name, stock, is_kit')
      .eq('id', item.productId)
      .maybeSingle();

    if (fetchError || !productData) {
      errors.push(`Produit introuvable: ${item.name}`);
      continue;
    }

    const currentStock = Number(productData.stock) || 0;
    const isKit = Boolean(productData.is_kit);

    if (isKit) {
      // Use custom components from POS (if caissier modified the kit) or fetch from DB
      let resolvedComponents: Array<{ component_id: string; name: string; quantity: number; currentStock: number }> = [];

      if (item.kitComponents && item.kitComponents.length > 0) {
        // Custom components from POS modal — fetch fresh stock for each
        for (const kc of item.kitComponents) {
          const { data: cp } = await supabase.from('products').select('stock').eq('id', kc.componentId).maybeSingle();
          resolvedComponents.push({
            component_id: kc.componentId,
            name: kc.name,
            quantity: kc.quantity,
            currentStock: Number(cp?.stock) || 0,
          });
        }
      } else {
        // Default: fetch from product_kits table
        const { data: kitComponents } = await supabase
          .from('product_kits')
          .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, stock)')
          .eq('product_id', item.productId);
        for (const comp of (kitComponents ?? []) as any[]) {
          if (!comp.products) continue;
          resolvedComponents.push({
            component_id: comp.component_id,
            name: comp.products.name,
            quantity: Number(comp.quantity) || 1,
            currentStock: Number(comp.products.stock) || 0,
          });
        }
      }

      if (resolvedComponents.length > 0) {
        for (const comp of resolvedComponents) {
          const compCurrentStock = comp.currentStock;
          const compQtyToDeduct = comp.quantity * item.qty;
          const compNewStock = Math.max(0, compCurrentStock - compQtyToDeduct);

          const { error: compUpdateError } = await supabase
            .from('products')
            .update({ stock: compNewStock, updated_at: new Date().toISOString() })
            .eq('id', comp.component_id);

          if (compUpdateError) {
            errors.push(`Erreur décompte composant kit: ${comp.name}`);
            continue;
          }

          shopifySyncItems.push({ productId: comp.component_id, delta: -compQtyToDeduct, newStock: compNewStock });

          await supabase.from('stock_movements_log').insert({
            product_id: comp.component_id,
            product_name: comp.name,
            movement_type: 'sale',
            quantity_before: compCurrentStock,
            quantity_after: compNewStock,
            quantity_change: -compQtyToDeduct,
            reason: `Vente caisse (kit: ${item.name}) — ${paymentMethod}`,
            reference: ticketRef,
            performed_by: cashierName,
            source: 'pos_sale',
          });

          if (compNewStock === 0) {
            await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' }).eq('id', comp.component_id).neq('product_status', 'inactive');
          }
        }
      }
      // Also deduct the kit itself (if it tracks stock)
      if (currentStock > 0) {
        const newKitStock = Math.max(0, currentStock - item.qty);
        await supabase.from('products').update({ stock: newKitStock, updated_at: new Date().toISOString() }).eq('id', item.productId);
        shopifySyncItems.push({ productId: item.productId, delta: -item.qty, newStock: newKitStock });
        await supabase.from('stock_movements_log').insert({
          product_id: item.productId,
          product_name: item.name,
          movement_type: 'sale',
          quantity_before: currentStock,
          quantity_after: newKitStock,
          quantity_change: -item.qty,
          reason: `Vente caisse (kit) — ${paymentMethod}`,
          reference: ticketRef,
          performed_by: cashierName,
          source: 'pos_sale',
        });
        if (newKitStock === 0) {
          await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' }).eq('id', item.productId).neq('product_status', 'inactive');
        }
      }
    } else {
      // Regular product
      const newStock = Math.max(0, currentStock - item.qty);

      const { error: updateError } = await supabase
        .from('products')
        .update({ stock: newStock, updated_at: new Date().toISOString() })
        .eq('id', item.productId);

      if (updateError) {
        errors.push(`Erreur décompte stock: ${item.name}`);
        continue;
      }

      shopifySyncItems.push({ productId: item.productId, delta: -item.qty, newStock });

      // Record movement
      await supabase.from('stock_movements_log').insert({
        product_id: item.productId,
        product_name: item.name,
        movement_type: 'sale',
        quantity_before: currentStock,
        quantity_after: newStock,
        quantity_change: -item.qty,
        reason: `Vente caisse — ${paymentMethod}`,
        reference: ticketRef,
        performed_by: cashierName,
        source: 'pos_sale',
      });

      if (newStock === 0) {
        await supabase.from('products').update({ status: 'rupture', product_status: 'rupture' }).eq('id', item.productId).neq('product_status', 'inactive');
      }
    }
  }

  // Non-blocking Shopify inventory sync for products marked as shopify=true
  if (shopifySyncItems.length > 0 && typeof window !== 'undefined') {
    fetch('/api/shopify/sync-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: shopifySyncItems }),
    }).catch(() => {});
  }

  // Non-blocking: recalculate sales_7d / sales_30d from movement history
  const soldIds = [...new Set(
    items.filter(i => !i.isFreePrice && i.productId && !i.productId.startsWith('free-')).map(i => i.productId)
  )];
  if (soldIds.length > 0) {
    recalculateSalesCounters(soldIds).catch(() => {});
  }

  return { success: errors.length === 0, errors };
}

/**
 * Recompute sales_7d and sales_30d for one or more products from receipts (primary)
 * and stock_movements_log (Shopify sales). Called after each sale (non-blocking).
 */
export async function recalculateSalesCounters(productIds: string[]): Promise<void> {
  if (productIds.length === 0) return;
  const now = new Date();
  const since7d  = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: receiptRows }, { data: shopifyMoves }] = await Promise.all([
    supabase
      .from('receipts')
      .select('items, created_at')
      .gte('created_at', since90d)
      .neq('is_demo', true)
      .neq('payment_type', 'avoir')
      .limit(200000),
    supabase
      .from('stock_movements_log')
      .select('product_id, quantity_change, created_at')
      .in('product_id', productIds)
      .eq('movement_type', 'sale')
      .gte('created_at', since90d),
  ]);

  const counters: Record<string, { s7: number; s30: number }> = {};
  for (const id of productIds) counters[id] = { s7: 0, s30: 0 };

  // Source 1: POS receipts
  for (const receipt of receiptRows ?? []) {
    const items = Array.isArray(receipt.items) ? receipt.items : [];
    const createdAt = receipt.created_at as string;
    for (const item of items) {
      const id = item.product_id as string;
      if (!id || !counters[id] || item.is_free_price) continue;
      const qty = Number(item.qty) || Number(item.quantity) || 0;
      if (createdAt >= since30d) counters[id].s30 += qty;
      if (createdAt >= since7d)  counters[id].s7  += qty;
    }
  }

  // Source 2: Shopify movements (already filtered by productIds)
  for (const m of shopifyMoves ?? []) {
    const id = m.product_id as string;
    if (!counters[id]) continue;
    const qty = Math.abs(Number(m.quantity_change) || 0);
    const createdAt = m.created_at as string;
    if (createdAt >= since30d) counters[id].s30 += qty;
    if (createdAt >= since7d)  counters[id].s7  += qty;
  }

  await Promise.all(
    productIds.map(id =>
      supabase.from('products')
        .update({ sales_7d: counters[id].s7, sales_30d: counters[id].s30 })
        .eq('id', id)
    )
  );
}
