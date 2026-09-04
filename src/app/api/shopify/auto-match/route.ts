import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';
import { createAdminClient } from '@/lib/supabase/admin';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

function parseNextUrl(link: string | null): string | null {
  if (!link) return null;
  const m = link.match(/<([^>]+)>;\s*rel="next"/);
  return m ? m[1] : null;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function jaccard(a: string, b: string): number {
  const wa = new Set(normName(a).split(' ').filter(w => w.length > 1));
  const wb = new Set(normName(b).split(' ').filter(w => w.length > 1));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

interface PosProduct {
  id: string;
  name: string;
  stock: number;
  shopify_variant_id: string | null;
  shopify_product_id: string | null;
  shopify_inventory_item_id: string | null;
}

interface Suggestion {
  shopify_product_id: string;
  shopify_variant_id: string;
  shopify_inventory_item_id: string | null;
  shopify_title: string;
  order_count: number;
  pos_product_id: string;
  pos_name: string;
  pos_had_link: boolean;
  old_shopify_variant_id: string | null;
  score: number;
}

interface NoMatch {
  shopify_product_id: string;
  shopify_variant_id: string;
  shopify_title: string;
  order_count: number;
  best_candidate: string | null;
  best_score: number;
}

async function analyze(days: number): Promise<{ suggestions: Suggestion[]; noMatch: NoMatch[]; error?: string }> {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) return { suggestions: [], noMatch: [], error: 'Shopify non connecté' };

  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  // Load ALL POS products
  const { data: posData } = await supabase
    .from('products')
    .select('id, name, stock, shopify_variant_id, shopify_product_id, shopify_inventory_item_id, ref, barcode');
  const allPos = (posData ?? []) as (PosProduct & { ref?: string; barcode?: string })[];

  // Build lookup maps (same as backfill)
  const byVariantId = new Map<string, PosProduct>();
  const byProductId = new Map<string, PosProduct>();
  const bySku = new Map<string, PosProduct>();
  for (const p of allPos) {
    if (p.shopify_variant_id) byVariantId.set(p.shopify_variant_id, p);
    if (p.shopify_product_id) byProductId.set(p.shopify_product_id, p);
    if ((p as any).ref) bySku.set((p as any).ref.toLowerCase().trim(), p);
    if ((p as any).barcode) bySku.set((p as any).barcode.toLowerCase().trim(), p);
  }

  // Fetch all paid Shopify orders
  const allOrders: any[] = [];
  let url: string | null =
    `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/orders.json` +
    `?status=any&financial_status=paid&created_at_min=${encodeURIComponent(since)}&limit=250` +
    `&fields=id,name,order_number,line_items`;

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': token } });
    if (!res.ok) break;
    const json = await res.json();
    allOrders.push(...(json.orders ?? []));
    url = parseNextUrl(res.headers.get('Link'));
  }

  // Identify unmatched Shopify products (levels 1–3 only, no Shopify API calls here)
  const unmatchedMap = new Map<string, { title: string; variantId: string; count: number }>();
  for (const order of allOrders) {
    for (const item of order.line_items) {
      if (!item.quantity || !item.product_id) continue;
      const vid = item.variant_id ? String(item.variant_id) : '';
      const pid = String(item.product_id);
      const sku = item.sku ? item.sku.toLowerCase().trim() : '';

      const matched =
        (vid && byVariantId.has(vid)) ||
        (sku && bySku.has(sku)) ||
        byProductId.has(pid);

      if (!matched) {
        const existing = unmatchedMap.get(pid);
        if (!existing) {
          unmatchedMap.set(pid, { title: item.name || item.title || '', variantId: vid, count: item.quantity });
        } else {
          existing.count += item.quantity;
        }
      }
    }
  }

  if (unmatchedMap.size === 0) return { suggestions: [], noMatch: [] };

  // Fetch Shopify product details for each unmatched product_id (4 at a time)
  const suggestions: Suggestion[] = [];
  const noMatch: NoMatch[] = [];
  const entries = [...unmatchedMap.entries()];
  const BATCH = 4;

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([pid, info]) => {
      try {
        const res = await fetch(
          `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/products/${pid}.json?fields=id,title,variants`,
          { headers: { 'X-Shopify-Access-Token': token } }
        );
        const productJson = res.ok ? await res.json().catch(() => null) : null;
        const shopifyTitle: string = productJson?.product?.title ?? info.title;

        let inventoryItemId: string | null = null;
        if (productJson?.product?.variants) {
          const variant = productJson.product.variants.find(
            (v: any) => String(v.id) === info.variantId
          );
          if (variant?.inventory_item_id) inventoryItemId = String(variant.inventory_item_id);
        }
        // Fallback: fetch variant directly
        if (!inventoryItemId && info.variantId) {
          const vRes = await fetch(
            `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/variants/${info.variantId}.json?fields=id,inventory_item_id`,
            { headers: { 'X-Shopify-Access-Token': token } }
          ).catch(() => null);
          if (vRes?.ok) {
            const vData = await vRes.json().catch(() => null);
            if (vData?.variant?.inventory_item_id) inventoryItemId = String(vData.variant.inventory_item_id);
          }
        }

        // Match against POS products by name similarity
        let bestPos: PosProduct | null = null;
        let bestScore = 0;
        for (const p of allPos) {
          const score = jaccard(shopifyTitle, p.name);
          if (score > bestScore) { bestScore = score; bestPos = p; }
        }

        if (bestPos && bestScore >= 0.50) {
          suggestions.push({
            shopify_product_id: pid,
            shopify_variant_id: info.variantId,
            shopify_inventory_item_id: inventoryItemId,
            shopify_title: shopifyTitle,
            order_count: info.count,
            pos_product_id: bestPos.id,
            pos_name: bestPos.name,
            pos_had_link: !!bestPos.shopify_variant_id,
            old_shopify_variant_id: bestPos.shopify_variant_id,
            score: bestScore,
          });
        } else {
          noMatch.push({
            shopify_product_id: pid,
            shopify_variant_id: info.variantId,
            shopify_title: shopifyTitle,
            order_count: info.count,
            best_candidate: bestPos?.name ?? null,
            best_score: bestScore,
          });
        }
      } catch {
        noMatch.push({
          shopify_product_id: pid,
          shopify_variant_id: info.variantId,
          shopify_title: info.title,
          order_count: info.count,
          best_candidate: null,
          best_score: 0,
        });
      }
    }));
  }

  suggestions.sort((a, b) => b.score - a.score);
  noMatch.sort((a, b) => b.order_count - a.order_count);
  return { suggestions, noMatch };
}

// GET: analyze only (dry run)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '90'), 365);
  const result = await analyze(days);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 503 });
  return NextResponse.json({
    days,
    auto_linkable: result.suggestions.length,
    no_match: result.noMatch.length,
    suggestions: result.suggestions,
    unmatched: result.noMatch,
  });
}

// POST: apply links and then run backfill
export async function POST(req: NextRequest) {
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const days = Math.min(body.days ?? 90, 365);
  const minScore: number = body.minScore ?? 0.50;

  const { suggestions, noMatch, error } = await analyze(days);
  if (error) return NextResponse.json({ error }, { status: 503 });

  const toApply = suggestions.filter(s => s.score >= minScore);

  if (toApply.length === 0) {
    return NextResponse.json({ ok: true, linked: 0, no_match: noMatch.length, log: [], message: 'Aucune correspondance fiable trouvée.' });
  }

  const supabase = createAdminClient();
  const linked: { pos: string; shopify: string; score: number; relinked: boolean }[] = [];
  const errors: string[] = [];

  for (const s of toApply) {
    const update: Record<string, string | boolean> = {
      shopify_variant_id: s.shopify_variant_id,
      shopify_product_id: s.shopify_product_id,
      shopify: true,
    };
    if (s.shopify_inventory_item_id) update.shopify_inventory_item_id = s.shopify_inventory_item_id;

    const { error: upErr } = await supabase
      .from('products')
      .update(update)
      .eq('id', s.pos_product_id);

    if (upErr) {
      errors.push(`${s.pos_name}: ${upErr.message}`);
    } else {
      linked.push({ pos: s.pos_name, shopify: s.shopify_title, score: s.score, relinked: s.pos_had_link });
    }
  }

  return NextResponse.json({
    ok: true,
    linked: linked.length,
    no_match: noMatch.length,
    errors,
    log: linked,
    unmatched: noMatch,
  });
}
