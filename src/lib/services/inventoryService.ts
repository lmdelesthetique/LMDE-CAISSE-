'use client';

import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

const supabase = createClient();

export interface InventoryLocation {
  id: string;
  name: string;
  isMain: boolean;
  isActive: boolean;
}

export interface InventoryProduct {
  id: string;
  productName: string;
  sku?: string;
  category?: string;
  supplierId?: string;
  supplierName?: string;
  unitCost: number;
  sellingPrice: number;
  minStockLevel: number;
  maxStockLevel: number;
  reorderPoint: number;
}

export interface StockLevel {
  id: string;
  productId: string;
  productName: string;
  sku?: string;
  category?: string;
  supplierId?: string;
  supplierName?: string;
  locationId: string;
  locationName: string;
  quantity: number;
  alertLevel: 'ok' | 'warning' | 'critical' | 'out_of_stock';
  unitCost: number;
  minStockLevel: number;
  reorderPoint: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  locationId: string;
  locationName: string;
  movementType: 'entry' | 'exit' | 'adjustment' | 'transfer' | 'return';
  quantity: number;
  unitCost?: number;
  totalCost?: number;
  supplierId?: string;
  reference?: string;
  notes?: string;
  performedBy: string;
  createdAt: string;
}

export interface InventoryStats {
  totalProducts: number;
  totalValue: number;
  alertCount: number;
  outOfStockCount: number;
  entriesThisMonth: number;
  exitsThisMonth: number;
}

export interface SupplierCostData {
  supplierName: string;
  totalCost: number;
  orderCount: number;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export async function fetchLocations(): Promise<InventoryLocation[]> {
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('id, name, is_main, is_active')
    .eq('is_active', true)
    .order('is_main', { ascending: false });
  if (error) { console.error('fetchLocations', error); return []; }
  return (data || []).map((r: { id: string; name: string; is_main: boolean; is_active: boolean }) => ({
    id: r.id,
    name: r.name,
    isMain: r.is_main,
    isActive: r.is_active,
  }));
}

export async function fetchStockLevels(locationId?: string): Promise<StockLevel[]> {
  // Try inventory_stock_levels first
  let query = supabase
    .from('inventory_stock_levels')
    .select(`
      id,
      quantity,
      alert_level,
      product_id,
      location_id,
      inventory_products!inner(product_name, sku, category, unit_cost, min_stock_level, reorder_point, supplier_id, suppliers(company_name)),
      inventory_locations!inner(name)
    `);

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId);
  }

  const { data, error } = await query.order('alert_level', { ascending: false });

  // If inventory_stock_levels has data, use it
  if (!error && data && data.length > 0) {
    return data.map((r: {
      id: string;
      quantity: number;
      alert_level: string;
      product_id: string;
      location_id: string;
      inventory_products: {
        product_name: string;
        sku?: string;
        category?: string;
        unit_cost: number;
        min_stock_level: number;
        reorder_point: number;
        supplier_id?: string;
        suppliers?: { company_name: string } | null;
      };
      inventory_locations: { name: string };
    }) => ({
      id: r.id,
      productId: r.product_id,
      productName: r.inventory_products?.product_name || '',
      sku: r.inventory_products?.sku,
      category: r.inventory_products?.category,
      supplierId: r.inventory_products?.supplier_id,
      supplierName: r.inventory_products?.suppliers?.company_name,
      locationId: r.location_id,
      locationName: r.inventory_locations?.name || '',
      quantity: r.quantity,
      alertLevel: r.alert_level as StockLevel['alertLevel'],
      unitCost: r.inventory_products?.unit_cost || 0,
      minStockLevel: r.inventory_products?.min_stock_level || 0,
      reorderPoint: r.inventory_products?.reorder_point || 0,
    }));
  }

  // Fallback: use main products table (load all, bypass Supabase 1000-row default)
  const products = await fetchAll((from, to) =>
    supabase
      .from('products')
      .select('id, name, ref, category, buy_price, stock, min_stock, supplier')
      .order('name')
      .range(from, to)
  );

  if (!products.length) return [];

  return products.map((p: {
    id: string;
    name: string;
    ref?: string;
    category?: string;
    buy_price?: number;
    stock?: number;
    min_stock?: number;
    supplier?: string;
  }) => {
    const qty = Number(p.stock) || 0;
    const minStock = Number(p.min_stock) || 5;
    let alertLevel: StockLevel['alertLevel'] = 'ok';
    if (qty === 0) alertLevel = 'out_of_stock';
    else if (qty <= minStock * 0.5) alertLevel = 'critical';
    else if (qty <= minStock) alertLevel = 'warning';
    return {
      id: p.id,
      productId: p.id,
      productName: p.name,
      sku: p.ref,
      category: p.category,
      supplierId: undefined,
      supplierName: p.supplier,
      locationId: 'main',
      locationName: 'Stock principal',
      quantity: qty,
      alertLevel,
      unitCost: Number(p.buy_price) || 0,
      minStockLevel: minStock,
      reorderPoint: minStock,
    };
  });
}

export async function fetchMovements(locationId?: string, movementType?: string): Promise<StockMovement[]> {
  let query = supabase
    .from('inventory_movements')
    .select(`
      id,
      movement_type,
      quantity,
      unit_cost,
      total_cost,
      reference,
      notes,
      performed_by,
      created_at,
      product_id,
      location_id,
      inventory_products(product_name),
      inventory_locations(name)
    `)
    .order('created_at', { ascending: false })
    .limit(50);

  if (locationId && locationId !== 'all') {
    query = query.eq('location_id', locationId);
  }
  if (movementType) {
    query = query.eq('movement_type', movementType);
  }

  const { data, error } = await query;
  if (error) { console.error('fetchMovements', error); return []; }

  return (data || []).map((r: {
    id: string;
    movement_type: string;
    quantity: number;
    unit_cost?: number;
    total_cost?: number;
    reference?: string;
    notes?: string;
    performed_by: string;
    created_at: string;
    product_id: string;
    location_id: string;
    inventory_products?: { product_name: string } | null;
    inventory_locations?: { name: string } | null;
  }) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.inventory_products?.product_name || '',
    locationId: r.location_id,
    locationName: r.inventory_locations?.name || '',
    movementType: r.movement_type as StockMovement['movementType'],
    quantity: r.quantity,
    unitCost: r.unit_cost,
    totalCost: r.total_cost,
    reference: r.reference,
    notes: r.notes,
    performedBy: r.performed_by,
    createdAt: formatDate(r.created_at),
  }));
}

export async function fetchInventoryStats(locationId?: string): Promise<InventoryStats> {
  const stockLevels = await fetchStockLevels(locationId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let movQuery = supabase
    .from('inventory_movements')
    .select('movement_type, quantity')
    .gte('created_at', startOfMonth);

  if (locationId && locationId !== 'all') {
    movQuery = movQuery.eq('location_id', locationId);
  }

  const { data: movData } = await movQuery;

  const totalValue = stockLevels.reduce((s, item) => s + item.quantity * item.unitCost, 0);
  const alertCount = stockLevels.filter((i) => i.alertLevel !== 'ok').length;
  const outOfStockCount = stockLevels.filter((i) => i.alertLevel === 'out_of_stock').length;

  const entries = (movData || []).filter((m: { movement_type: string }) => m.movement_type === 'entry' || m.movement_type === 'return').length;
  const exits = (movData || []).filter((m: { movement_type: string }) => m.movement_type === 'exit' || m.movement_type === 'transfer' || m.movement_type === 'adjustment').length;

  const uniqueProducts = new Set(stockLevels.map((s) => s.productId)).size;

  return {
    totalProducts: uniqueProducts,
    totalValue: Math.round(totalValue * 100) / 100,
    alertCount,
    outOfStockCount,
    entriesThisMonth: entries,
    exitsThisMonth: exits,
  };
}

export async function fetchSupplierCosts(): Promise<SupplierCostData[]> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('inventory_movements')
    .select('total_cost, supplier_id, suppliers(company_name)')
    .eq('movement_type', 'entry')
    .gte('created_at', startOfMonth)
    .not('supplier_id', 'is', null);

  if (error) { console.error('fetchSupplierCosts', error); return []; }

  const map: Record<string, { name: string; cost: number; count: number }> = {};
  (data || []).forEach((r: { total_cost?: number; supplier_id?: string; suppliers?: { company_name: string } | null }) => {
    const name = r.suppliers?.company_name || 'Inconnu';
    if (!map[name]) map[name] = { name, cost: 0, count: 0 };
    map[name].cost += r.total_cost || 0;
    map[name].count += 1;
  });

  return Object.values(map).map((v) => ({
    supplierName: v.name,
    totalCost: Math.round(v.cost * 100) / 100,
    orderCount: v.count,
  })).sort((a, b) => b.totalCost - a.totalCost);
}

export async function fetchLocationStats(locations: InventoryLocation[]): Promise<{
  id: string; name: string; isMain: boolean; totalProducts: number; totalValue: number; alertCount: number;
}[]> {
  const results = await Promise.all(
    locations.map(async (loc) => {
      const levels = await fetchStockLevels(loc.id);
      return {
        id: loc.id,
        name: loc.name,
        isMain: loc.isMain,
        totalProducts: new Set(levels.map((l) => l.productId)).size,
        totalValue: Math.round(levels.reduce((s, l) => s + l.quantity * l.unitCost, 0) * 100) / 100,
        alertCount: levels.filter((l) => l.alertLevel !== 'ok').length,
      };
    })
  );
  return results;
}
