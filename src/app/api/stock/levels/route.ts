import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/stock/levels?locationId=xxx
// Returns stock levels, preferring inventory_stock_levels and falling back to products table.
export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('locationId') ?? undefined;
  const supabase = createAdminClient();

  // Try inventory_stock_levels first
  let q = supabase
    .from('inventory_stock_levels')
    .select(`
      id, quantity, alert_level, product_id, location_id,
      inventory_products!inner(product_name, sku, category, unit_cost, min_stock_level, reorder_point, supplier_id, suppliers(company_name)),
      inventory_locations!inner(name)
    `)
    .order('alert_level', { ascending: false })
    .limit(2000) as any;

  if (locationId && locationId !== 'all') q = q.eq('location_id', locationId);

  const { data: levelsData, error: levelsError } = await q;

  if (!levelsError && levelsData?.length) {
    return NextResponse.json(
      levelsData.map((r: any) => ({
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
        alertLevel: r.alert_level,
        unitCost: r.inventory_products?.unit_cost || 0,
        minStockLevel: r.inventory_products?.min_stock_level || 0,
        reorderPoint: r.inventory_products?.reorder_point || 0,
      }))
    );
  }

  // Fallback: use products table
  const PAGE = 1000;
  const products: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, ref, category, buy_price, stock, min_stock, supplier')
      .order('name')
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    products.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return NextResponse.json(
    products.map((p: any) => {
      const qty = Number(p.stock) || 0;
      const minStock = Number(p.min_stock) || 0;
      let alertLevel = 'ok';
      if (qty === 0) alertLevel = 'out_of_stock';
      else if (minStock > 0 && qty <= minStock * 0.5) alertLevel = 'critical';
      else if (minStock > 0 && qty <= minStock) alertLevel = 'warning';
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
    })
  );
}
