'use client';

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
  movementType: 'entry' | 'exit' | 'adjustment' | 'transfer' | 'return' | 'sale' | 'b2b_sale' | 'shopify_sale';
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
  const res = await fetch('/api/stock/locations').catch(() => null);
  if (!res?.ok) return [];
  return res.json();
}

export async function fetchStockLevels(locationId?: string): Promise<StockLevel[]> {
  const params = locationId && locationId !== 'all' ? `?locationId=${encodeURIComponent(locationId)}` : '';
  const res = await fetch(`/api/stock/levels${params}`).catch(() => null);
  if (!res?.ok) return [];
  return res.json();
}

export async function fetchMovements(locationId?: string, movementType?: string): Promise<StockMovement[]> {
  const params = new URLSearchParams({ limit: '500' });
  if (movementType) params.set('movementType', movementType);

  const res = await fetch(`/api/stock/movements?${params}`).catch(() => null);
  if (!res?.ok) return [];
  const data: any[] = await res.json();

  return data.map((r) => {
    const source = r.source ?? '';
    let displayType: StockMovement['movementType'] = r.movement_type as StockMovement['movementType'];
    if (r.movement_type === 'sale' && source === 'b2b_sale') displayType = 'b2b_sale' as any;
    else if (r.movement_type === 'sale' && source === 'shopify_sale') displayType = 'shopify_sale' as any;
    else if (r.movement_type === 'sale') displayType = 'sale' as any;
    else if (r.movement_type === 'suspended') displayType = 'adjustment';

    const qty = Math.abs(Number(r.quantity_change) || 0);
    const sourceLabel = source === 'pos_sale' ? 'Caisse' : source === 'b2b_sale' ? 'B2B' : source === 'shopify_sale' ? 'Shopify' : '';
    const notes = [r.reason, sourceLabel ? `[${sourceLabel}]` : ''].filter(Boolean).join(' — ');

    return {
      id: r.id,
      productId: r.product_id,
      productName: r.product_name || '',
      locationId: 'main',
      locationName: 'Stock principal',
      movementType: displayType,
      quantity: qty,
      reference: r.reference,
      notes,
      performedBy: r.performed_by || '',
      createdAt: formatDate(r.created_at),
    };
  });
}

export async function fetchInventoryStats(locationId?: string): Promise<InventoryStats> {
  const stockLevels = await fetchStockLevels(locationId);
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const movRes = await fetch(`/api/stock/movements?since=${encodeURIComponent(startOfMonth)}&limit=1000`).catch(() => null);
  const movData: any[] = movRes?.ok ? await movRes.json() : [];

  const totalValue = stockLevels.reduce((s, item) => s + item.quantity * item.unitCost, 0);
  const alertCount = stockLevels.filter((i) => i.alertLevel !== 'ok').length;
  const outOfStockCount = stockLevels.filter((i) => i.alertLevel === 'out_of_stock').length;
  const entries = movData.filter((m) => m.movement_type === 'entry').length;
  const exits = movData.filter((m) => m.movement_type === 'sale' || m.movement_type === 'exit').length;
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
  const res = await fetch('/api/stock/supplier-costs').catch(() => null);
  if (!res?.ok) return [];
  return res.json();
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
