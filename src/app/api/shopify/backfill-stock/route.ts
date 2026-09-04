import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';
import { createAdminClient } from '@/lib/supabase/admin';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

interface ShopifyLineItem {
  product_id?: number | null;
  variant_id: number | null;
  quantity: number;
  title?: string;
  name?: string;
  sku?: string;
  price?: string;
}

interface ShopifyOrder {
  id: number;
  name: string;
  order_number: number;
  created_at: string;
  total_price?: string;
  line_items: ShopifyLineItem[];
}

interface LineResult {
  title: string;
  sku: string | null;
  variant_id: number | null;
  qty: number;
  matched_by: 'variant_id' | 'sku' | null;
  product_id: string | null;
  product_name: string | null;
  stock_before: number | null;
  stock_after: number | null;
  deducted: boolean;
  reason: string;
}

interface OrderResult {
  order_number: string;
  order_name: string;
  created_at: string;
  already_processed: boolean;
  lines: LineResult[];
  deducted_count: number;
  skipped_count: number;
}

// GET: dry-run analysis (no stock changes)
// POST: actually apply the backfill
export async function GET(req: NextRequest) {
  return runBackfill(req, true);
}

export async function POST(req: NextRequest) {
  return runBackfill(req, false);
}

async function runBackfill(req: NextRequest, dryRun: boolean) {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) {
    return NextResponse.json({ error: 'Shopify non connecté' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();

  // 1. Fetch all paid Shopify orders in the period (paginated)
  const allOrders: ShopifyOrder[] = [];
  let url: string | null =
    `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/orders.json` +
    `?status=any&financial_status=paid&created_at_min=${encodeURIComponent(since)}&limit=250` +
    `&fields=id,name,order_number,created_at,total_price,line_items&order=created_at+asc`;

  try {
    while (url) {
      const res = await fetch(url, {
        headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json({ error: `Shopify API ${res.status}: ${text}` }, { status: 500 });
      }
      const json = await res.json();
      allOrders.push(...(json.orders ?? []));
      url = parseNextUrl(res.headers.get('Link'));
    }
  } catch (e: any) {
    return NextResponse.json({ error: `Shopify fetch error: ${e.message}` }, { status: 500 });
  }

  // 2. Get all already-processed (order_ref, product_id) pairs from stock_movements_log.
  // Use per-product idempotency so that an order with SOME products missing can be re-run
  // without re-deducting the products that were already processed.
  const { data: processedRows } = await supabase
    .from('stock_movements_log')
    .select('reference, product_id')
    .eq('source', 'shopify_sale')
    .gte('created_at', since);

  // "orderRef:productId" — skip this specific combination only, not the whole order
  const processedKeys = new Set(
    (processedRows ?? [])
      .filter((r: any) => r.product_id)
      .map((r: any) => `${r.reference}:${r.product_id}`)
  );
  // Order refs that have at least one processed product (for reporting only)
  const processedOrderRefs = new Set((processedRows ?? []).map((r: any) => String(r.reference)));

  // 3. Load all products with their shopify_variant_id and ref for matching
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, stock, shopify_variant_id, shopify_product_id, ref, barcode')
    .not('product_status', 'eq', 'inactive');

  const byVariantId = new Map<string, { id: string; name: string; stock: number }>();
  const bySku = new Map<string, { id: string; name: string; stock: number }>();
  // Fallback: match by Shopify product_id — catches orders where the variant sold
  // differs from the stored shopify_variant_id (e.g. multi-variant products)
  const byProductId = new Map<string, { id: string; name: string; stock: number }>();

  for (const p of (allProducts ?? []) as any[]) {
    if (p.shopify_variant_id) byVariantId.set(String(p.shopify_variant_id), p);
    if (p.shopify_product_id) byProductId.set(String(p.shopify_product_id), p);
    if (p.ref) bySku.set(p.ref.toLowerCase().trim(), p);
    if (p.barcode) bySku.set(p.barcode.toLowerCase().trim(), p);
  }

  // 4. Process each order
  const results: OrderResult[] = [];
  let totalDeducted = 0;
  let totalSkipped = 0;

  for (const order of allOrders) {
    const orderRef = String(order.order_number);
    const orderResult: OrderResult = {
      order_number: orderRef,
      order_name: order.name,
      created_at: order.created_at,
      already_processed: false, // determined after scanning all lines
      lines: [],
      deducted_count: 0,
      skipped_count: 0,
    };

    for (const item of order.line_items) {
      if (!item.quantity) continue;

      const lineResult: LineResult = {
        title: item.name || item.title || '',
        sku: item.sku || null,
        variant_id: item.variant_id || null,
        qty: item.quantity,
        matched_by: null,
        product_id: null,
        product_name: null,
        stock_before: null,
        stock_after: null,
        deducted: false,
        reason: '',
      };

      // Match product — 3 levels of fallback
      let product: { id: string; name: string; stock: number } | null = null;
      if (item.variant_id) {
        const found = byVariantId.get(String(item.variant_id));
        if (found) { product = found; lineResult.matched_by = 'variant_id'; }
      }
      if (!product && item.sku) {
        const found = bySku.get(item.sku.toLowerCase().trim());
        if (found) { product = found; lineResult.matched_by = 'sku'; }
      }
      // Fallback: match by Shopify product_id — handles multi-variant products where
      // the sold variant_id differs from the one stored in the POS link
      if (!product && item.product_id) {
        const found = byProductId.get(String(item.product_id));
        if (found) { product = found; lineResult.matched_by = 'variant_id'; }
      }

      if (!product) {
        lineResult.reason = `Produit introuvable (variant_id=${item.variant_id ?? '—'}, sku=${item.sku ?? '—'}) — lier ce produit dans Sync Shopify`;
        orderResult.lines.push(lineResult);
        orderResult.skipped_count++;
        totalSkipped++;
        continue;
      }

      lineResult.product_id = product.id;
      lineResult.product_name = product.name;
      lineResult.stock_before = Number(product.stock) || 0;
      lineResult.stock_after = Math.max(0, lineResult.stock_before - item.quantity);

      // Per-product idempotency: skip if this exact product was already deducted for this order
      const productKey = `${orderRef}:${product.id}`;
      if (processedKeys.has(productKey)) {
        lineResult.deducted = false;
        lineResult.reason = 'Déjà traité';
        orderResult.lines.push(lineResult);
        continue;
      }

      if (!dryRun) {
        // Fetch fresh stock before deducting (avoid stale cache)
        const { data: fresh } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product.id)
          .maybeSingle();

        const freshStock = Number((fresh as any)?.stock) || 0;
        const newStock = Math.max(0, freshStock - item.quantity);
        lineResult.stock_before = freshStock;
        lineResult.stock_after = newStock;

        await supabase
          .from('products')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', product.id);

        await supabase.from('stock_movements_log').insert({
          product_id: product.id,
          product_name: product.name,
          movement_type: 'sale',
          quantity_before: freshStock,
          quantity_after: newStock,
          quantity_change: -item.quantity,
          reason: `Rattrapage stock — Vente Shopify #${order.order_number} (${order.name})`,
          reference: orderRef,
          performed_by: 'Backfill Shopify',
          source: 'shopify_sale',
        });

        if (newStock === 0) {
          await supabase
            .from('products')
            .update({ status: 'rupture', product_status: 'rupture' })
            .eq('id', product.id)
            .neq('product_status', 'inactive');
        }

        // Update local cache for subsequent orders
        product.stock = newStock;
      }

      lineResult.deducted = true;
      lineResult.reason = dryRun ? 'Sera décompté' : 'Décompté';
      orderResult.lines.push(lineResult);
      orderResult.deducted_count++;
      totalDeducted++;
    }

    results.push(orderResult);
  }

  // Recalculate sales_7d/sales_30d for all deducted products
  if (!dryRun && totalDeducted > 0) {
    const deductedProductIds = [...new Set(
      results.flatMap(r => r.lines.filter(l => l.deducted && l.product_id).map(l => l.product_id!))
    )];
    if (deductedProductIds.length > 0) {
      const nowTs = new Date();
      const since7d = new Date(nowTs.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const since30d = new Date(nowTs.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: mvs } = await supabase
        .from('stock_movements_log')
        .select('product_id, quantity_change, created_at')
        .in('product_id', deductedProductIds)
        .eq('movement_type', 'sale')
        .gte('created_at', since30d);
      const cnt: Record<string, { s7: number; s30: number }> = {};
      for (const id of deductedProductIds) cnt[id] = { s7: 0, s30: 0 };
      for (const m of mvs ?? []) {
        const id = m.product_id as string;
        if (!cnt[id]) continue;
        const qty = Math.abs(Number(m.quantity_change) || 0);
        cnt[id].s30 += qty;
        if ((m.created_at as string) >= since7d) cnt[id].s7 += qty;
      }
      await Promise.all(deductedProductIds.map(id =>
        supabase.from('products').update({ sales_7d: cnt[id].s7, sales_30d: cnt[id].s30 }).eq('id', id)
      ));
    }
  }

  const ordersWithNewDeductions = results.filter((r) => r.deducted_count > 0);
  const ordersFullyAlreadyDone = results.filter((r) =>
    r.lines.length > 0 && r.lines.every((l) => l.reason === 'Déjà traité')
  );
  const ordersWithIntrouvable = results.filter((r) => r.skipped_count > 0);
  const ordersNeedingAttention = results.filter((r) => r.deducted_count > 0 || r.skipped_count > 0);

  return NextResponse.json({
    dry_run: dryRun,
    period_days: days,
    since,
    summary: {
      total_shopify_orders: allOrders.length,
      already_processed: ordersFullyAlreadyDone.length,
      orders_needing_backfill: ordersNeedingAttention.length,
      orders_with_deduction: ordersWithNewDeductions.length,
      orders_unmatched: ordersWithIntrouvable.length,
      total_lines_deducted: totalDeducted,
      total_lines_skipped: totalSkipped,
    },
    orders_needing_backfill: ordersNeedingAttention,
  });
}
