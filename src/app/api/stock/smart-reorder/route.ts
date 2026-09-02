import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAll } from '@/lib/utils/fetchAll';

const DAYS = 90;
const COVERAGE_TARGET_MONTHS = 3;

export interface SmartReorderItem {
  productId: string;
  productName: string;
  productRef: string;
  productImageUrl: string | null;
  supplierId: string | null;
  supplierName: string;
  currentStock: number;
  minStock: number;
  soldQty90: number;
  velocityPerMonth: number;
  coverageMonths: number;
  suggestedQty: number;
  unitPrice: number;
  salePrice: number;
}

export interface SmartReorderGroup {
  supplierId: string | null;
  supplierName: string;
  items: SmartReorderItem[];
  totalEstimatedCost: number;
}

// GET — compute suggestions from sales data
export async function GET() {
  try {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

    // 1. Receipts last 90 days
    const receipts = await fetchAll<any>((from, to) =>
      supabase
        .from('receipts')
        .select('items')
        .eq('status', 'completed')
        .gte('created_at', since)
        .range(from, to)
    );

    // 2. Aggregate qty per product_id
    const qtyMap = new Map<string, number>();
    for (const r of receipts) {
      const items = Array.isArray(r.items) ? r.items : [];
      for (const item of items) {
        const pid = item?.product_id || item?.productId;
        if (!pid) continue;
        const qty = Number(item?.qty ?? item?.quantity ?? 1);
        qtyMap.set(pid, (qtyMap.get(pid) ?? 0) + qty);
      }
    }

    if (qtyMap.size === 0) return NextResponse.json({ groups: [] });

    // 3. Fetch all products with supplier info
    // Filter to valid UUIDs only — some receipt items may have non-UUID IDs (Shopify, legacy)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const productIds = Array.from(qtyMap.keys()).filter(id => UUID_RE.test(id));

    if (productIds.length === 0) return NextResponse.json({ groups: [] });

    // Batch query by 100 to stay within URL length limits
    const BATCH = 100;
    const allProducts: any[] = [];
    for (let i = 0; i < productIds.length; i += BATCH) {
      const { data: batch, error: batchErr } = await supabase
        .from('products')
        .select('id, name, ref, image_url, stock, min_stock, supplier, supplier_id, buy_price, sell_price_ttc, product_status')
        .in('id', productIds.slice(i, i + BATCH));
      if (batchErr) return NextResponse.json({ error: batchErr.message, step: 'products' }, { status: 500 });
      if (batch) allProducts.push(...batch);
    }
    const products = allProducts;

    // 4. Fetch supplier names for those with supplier_id
    const supplierIds = [...new Set((products ?? []).map((p: any) => p.supplier_id).filter(Boolean))];
    const supplierMap = new Map<string, string>();
    if (supplierIds.length > 0) {
      const { data: suppliers } = await supabase
        .from('suppliers')
        .select('id, company_name')
        .in('id', supplierIds);
      for (const s of suppliers ?? []) supplierMap.set(s.id, s.company_name);
    }

    // 5. Build suggestion items
    const items: SmartReorderItem[] = [];
    for (const prod of products ?? []) {
      if (prod.product_status === 'inactive') continue;

      const soldQty90 = qtyMap.get(prod.id) ?? 0;
      if (soldQty90 === 0) continue;

      const velocityPerMonth = soldQty90 / (DAYS / 30);
      const currentStock = Number(prod.stock) ?? 0;
      const coverageMonths = velocityPerMonth > 0 ? currentStock / velocityPerMonth : 99;

      // Only suggest if less than 2 months of coverage or below min_stock
      const minStock = Number(prod.min_stock) ?? 0;
      if (coverageMonths >= 2 && currentStock >= minStock) continue;

      const suggestedQty = Math.max(
        Math.ceil(velocityPerMonth * COVERAGE_TARGET_MONTHS) - currentStock,
        Math.max(minStock - currentStock, 1)
      );

      const supplierName = prod.supplier_id
        ? (supplierMap.get(prod.supplier_id) ?? prod.supplier ?? 'Sans fournisseur')
        : (prod.supplier ?? 'Sans fournisseur');

      items.push({
        productId: prod.id,
        productName: prod.name,
        productRef: prod.ref ?? '',
        productImageUrl: prod.image_url ?? null,
        supplierId: prod.supplier_id ?? null,
        supplierName,
        currentStock,
        minStock,
        soldQty90,
        velocityPerMonth: Math.round(velocityPerMonth * 10) / 10,
        coverageMonths: Math.round(coverageMonths * 10) / 10,
        suggestedQty,
        unitPrice: Number(prod.buy_price) ?? 0,
        salePrice: Number(prod.sell_price_ttc) ?? 0,
      });
    }

    // 6. Sort by velocity desc
    items.sort((a, b) => b.velocityPerMonth - a.velocityPerMonth);

    // 7. Group by supplier
    const groupMap = new Map<string, SmartReorderGroup>();
    for (const item of items) {
      const key = item.supplierId ?? item.supplierName;
      if (!groupMap.has(key)) {
        groupMap.set(key, {
          supplierId: item.supplierId,
          supplierName: item.supplierName,
          items: [],
          totalEstimatedCost: 0,
        });
      }
      const group = groupMap.get(key)!;
      group.items.push(item);
      group.totalEstimatedCost += item.suggestedQty * item.unitPrice;
    }

    const groups = Array.from(groupMap.values())
      .map((g) => ({ ...g, totalEstimatedCost: Math.round(g.totalEstimatedCost * 100) / 100 }))
      .sort((a, b) => b.items.length - a.items.length);

    return NextResponse.json({ groups, totalItems: items.length, period: DAYS });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — create draft fo_orders + fo_order_lines
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const orders: Array<{
      supplierId: string | null;
      supplierName: string;
      notes?: string;
      items: Array<{
        productId: string;
        productName: string;
        productRef: string;
        productImageUrl: string | null;
        qty: number;
        unitPrice: number;
        salePrice: number;
      }>;
    }> = body.orders ?? [];

    if (!orders.length) return NextResponse.json({ error: 'Aucune commande' }, { status: 400 });

    const supabase = createAdminClient();
    const created: Array<{ orderId: string; orderNumber: string; supplierName: string; lineCount: number }> = [];

    for (const order of orders) {
      if (!order.items.length) continue;

      const subtotal = order.items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
      const orderNum = `FO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}-A`;

      // Create the order
      const { data: foOrder, error: orderErr } = await supabase
        .from('fo_orders')
        .insert({
          supplier_id: order.supplierId ?? null,
          order_number: orderNum,
          order_status: 'draft',
          currency: 'EUR',
          exchange_rate: 1,
          notes: order.notes ?? `Réassort automatique — 90 jours de ventes`,
          subtotal: Math.round(subtotal * 100) / 100,
          transport_cost: 0,
          customs_cost: 0,
          vat_import: 0,
          freight_forwarder_cost: 0,
          bank_fees: 0,
          exchange_fees: 0,
          local_delivery: 0,
          other_costs: 0,
          total_real_cost: Math.round(subtotal * 100) / 100,
          cost_method: 'by_value',
          payment_status: 'pending',
          costs_validated: false,
          stock_integrated: false,
        })
        .select('id, order_number')
        .single();

      if (orderErr || !foOrder) continue;

      // Create lines
      const lines = order.items.map((it) => ({
        order_id: foOrder.id,
        product_id: it.productId,
        product_name: it.productName,
        product_ref: it.productRef || null,
        product_image_url: it.productImageUrl || null,
        qty_ordered: it.qty,
        qty_received: 0,
        unit_price: it.unitPrice,
        line_total: Math.round(it.qty * it.unitPrice * 100) / 100,
        sale_price: it.salePrice,
        weight_kg: 0,
        volume_m3: 0,
      }));

      await supabase.from('fo_order_lines').insert(lines);

      created.push({
        orderId: foOrder.id,
        orderNumber: foOrder.order_number,
        supplierName: order.supplierName,
        lineCount: order.items.length,
      });
    }

    return NextResponse.json({ created });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
