import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

function parseNextUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const m = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

interface ShopifyLineItem {
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

  const supabase = getSupabase();

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

  // 2. Get all already-processed order refs from stock_movements_log
  const { data: processedRows } = await supabase
    .from('stock_movements_log')
    .select('reference')
    .eq('source', 'shopify_sale')
    .gte('created_at', since);

  const processedRefs = new Set((processedRows ?? []).map((r: any) => String(r.reference)));

  // 3. Load all products with their shopify_variant_id and ref for matching
  const { data: allProducts } = await supabase
    .from('products')
    .select('id, name, stock, shopify_variant_id, ref, barcode')
    .not('product_status', 'eq', 'inactive');

  const byVariantId = new Map<string, { id: string; name: string; stock: number }>();
  const bySku = new Map<string, { id: string; name: string; stock: number }>();

  for (const p of (allProducts ?? []) as any[]) {
    if (p.shopify_variant_id) byVariantId.set(String(p.shopify_variant_id), p);
    if (p.ref) bySku.set(p.ref.toLowerCase().trim(), p);
    if (p.barcode) bySku.set(p.barcode.toLowerCase().trim(), p);
  }

  // 4. Process each order
  const results: OrderResult[] = [];
  let totalDeducted = 0;
  let totalSkipped = 0;
  let totalAlreadyDone = 0;

  for (const order of allOrders) {
    const orderRef = String(order.order_number);
    const alreadyProcessed = processedRefs.has(orderRef);

    const orderResult: OrderResult = {
      order_number: orderRef,
      order_name: order.name,
      created_at: order.created_at,
      already_processed: alreadyProcessed,
      lines: [],
      deducted_count: 0,
      skipped_count: 0,
    };

    if (alreadyProcessed) {
      totalAlreadyDone++;
      results.push(orderResult);
      continue;
    }

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

      // Match product
      let product: { id: string; name: string; stock: number } | null = null;
      if (item.variant_id) {
        const found = byVariantId.get(String(item.variant_id));
        if (found) { product = found; lineResult.matched_by = 'variant_id'; }
      }
      if (!product && item.sku) {
        const found = bySku.get(item.sku.toLowerCase().trim());
        if (found) { product = found; lineResult.matched_by = 'sku'; }
      }

      if (!product) {
        lineResult.reason = `Produit introuvable (variant_id=${item.variant_id ?? '—'}, sku=${item.sku ?? '—'})`;
        orderResult.lines.push(lineResult);
        orderResult.skipped_count++;
        totalSkipped++;
        continue;
      }

      lineResult.product_id = product.id;
      lineResult.product_name = product.name;
      lineResult.stock_before = Number(product.stock) || 0;
      lineResult.stock_after = Math.max(0, lineResult.stock_before - item.quantity);

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

  const unprocessedOrders = results.filter((r) => !r.already_processed);
  const ordersWithDeduction = unprocessedOrders.filter((r) => r.deducted_count > 0);
  const ordersFullyUnmatched = unprocessedOrders.filter((r) => r.deducted_count === 0 && r.skipped_count > 0);

  return NextResponse.json({
    dry_run: dryRun,
    period_days: days,
    since,
    summary: {
      total_shopify_orders: allOrders.length,
      already_processed: totalAlreadyDone,
      orders_needing_backfill: unprocessedOrders.length,
      orders_with_deduction: ordersWithDeduction.length,
      orders_unmatched: ordersFullyUnmatched.length,
      total_lines_deducted: totalDeducted,
      total_lines_skipped: totalSkipped,
    },
    orders_needing_backfill: unprocessedOrders,
  });
}
