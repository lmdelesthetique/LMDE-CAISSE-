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
  sales7d: number;
  sales30d: number;
  supplierLeadDays: number;
  isSuspended: boolean;
  status: string;
  stockStatus: 'ok' | 'faible' | 'rupture' | 'commande' | 'suspendu';
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
}): 'ok' | 'faible' | 'rupture' | 'commande' | 'suspendu' {
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

  const stockStatus = computeStockStatus({ stock, minStock, isSuspended, stockTransitContainer, stockTransitAvion });
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
    productStatus: (r.product_status as string) || 'active',
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
    supplierLeadDays,
    isSuspended,
    status: (r.status as string) || 'active',
    stockStatus,
    daysBeforeStockout,
    suggestedReorder,
    totalStockValue: stock * costPrice,
  };
}

export async function fetchStockProducts(search?: string): Promise<StockProduct[]> {
  const data = await fetchAll<Record<string, unknown>>((from, to) => {
    if (search && search.trim()) {
      return supabase
        .from('products')
        .select('*')
        .or(`name.ilike.%${search.trim()}%,ref.ilike.%${search.trim()}%,supplier.ilike.%${search.trim()}%,category.ilike.%${search.trim()}%`)
        .order('name')
        .range(from, to);
    }
    return supabase.from('products').select('*').order('name').range(from, to);
  });
  return data.map(mapProduct);
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
  const dormantProducts = products.filter(p => p.sales30d === 0);
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

  return true;
}

export async function removeStock(productId: string, productName: string, currentStock: number, qty: number, reason: string, performedBy = 'Admin'): Promise<boolean> {
  const newQty = Math.max(0, currentStock - qty);
  const { error: updateError } = await supabase
    .from('products')
    .update({ stock: newQty, updated_at: new Date().toISOString() })
    .eq('id', productId);

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

export async function fetchProductsBySupplier(supplierId: string): Promise<StockProduct[]> {
  return fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from('products')
      .select('*')
      .eq('supplier_id', supplierId)
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

/**
 * Deduct stock for all items sold in a POS sale.
 * Records one stock_movements_log entry per product.
 * For kit products, deducts each kit component individually.
 */
export async function deductStockForSale(
  items: Array<{ productId: string; name: string; qty: number; isFreePrice?: boolean }>,
  ticketRef: string,
  paymentMethod: string,
  cashierName: string
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

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
      // For kits: deduct each kit component
      const { data: kitComponents } = await supabase
        .from('product_kits')
        .select('component_id, quantity, products!product_kits_component_id_fkey(id, name, stock)')
        .eq('product_id', item.productId);

      if (kitComponents && kitComponents.length > 0) {
        for (const comp of kitComponents as any[]) {
          const compProduct = comp.products;
          if (!compProduct) continue;
          const compCurrentStock = Number(compProduct.stock) || 0;
          const compQtyToDeduct = (Number(comp.quantity) || 1) * item.qty;
          const compNewStock = Math.max(0, compCurrentStock - compQtyToDeduct);

          const { error: compUpdateError } = await supabase
            .from('products')
            .update({ stock: compNewStock, updated_at: new Date().toISOString() })
            .eq('id', comp.component_id);

          if (compUpdateError) {
            errors.push(`Erreur décompte composant kit: ${compProduct.name}`);
            continue;
          }

          await supabase.from('stock_movements_log').insert({
            product_id: comp.component_id,
            product_name: compProduct.name,
            movement_type: 'sale',
            quantity_before: compCurrentStock,
            quantity_after: compNewStock,
            quantity_change: -compQtyToDeduct,
            reason: `Vente caisse (kit: ${item.name}) — ${paymentMethod}`,
            reference: ticketRef,
            performed_by: cashierName,
            source: 'pos_sale',
          });

          // Update status if stock reaches 0
          if (compNewStock === 0) {
            await supabase.from('products').update({ status: 'rupture' }).eq('id', comp.component_id);
          }
        }
      }
      // Also deduct the kit itself (if it tracks stock)
      if (currentStock > 0) {
        const newKitStock = Math.max(0, currentStock - item.qty);
        await supabase.from('products').update({ stock: newKitStock, updated_at: new Date().toISOString() }).eq('id', item.productId);
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
          await supabase.from('products').update({ status: 'rupture' }).eq('id', item.productId);
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

      // Update product status if stock reaches 0
      if (newStock === 0) {
        await supabase.from('products').update({ status: 'rupture' }).eq('id', item.productId);
      } else if (newStock > 0) {
        // If it was rupture and now has stock, restore to active
        const { data: statusData } = await supabase.from('products').select('status').eq('id', item.productId).maybeSingle();
        if (statusData && (statusData as any).status === 'rupture') {
          // Keep rupture status — stock was just deducted, don't auto-restore
        }
      }
    }
  }

  return { success: errors.length === 0, errors };
}
