import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken } from '@/lib/services/shopifyService';
import { createAdminClient } from '@/lib/supabase/admin';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

// POST /api/shopify/repair-product-ids
// For every linked POS product that has shopify_variant_id but missing/null
// shopify_product_id, fetch the product_id from Shopify and save it.
// This is a one-time repair for products linked before shopify_product_id was stored.
export async function POST(_req: NextRequest) {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) {
    return NextResponse.json({ error: 'Shopify non connecté' }, { status: 503 });
  }

  const supabase = createAdminClient();

  // 1. Get all POS products that have a variant_id but no product_id
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, shopify_variant_id, shopify_product_id')
    .not('shopify_variant_id', 'is', null)
    .is('shopify_product_id', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!products?.length) {
    return NextResponse.json({ repaired: 0, message: 'Tous les produits liés ont déjà leur shopify_product_id.' });
  }

  let repaired = 0;
  let failed = 0;
  const errors: string[] = [];

  // 2. For each product, fetch variant from Shopify to get product_id
  // Process 4 at a time to stay within rate limits
  const CONCURRENCY = 4;
  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (p) => {
      if (!p.shopify_variant_id) return;
      try {
        const url = `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/variants/${p.shopify_variant_id}.json`;
        const res = await fetch(url, {
          headers: { 'X-Shopify-Access-Token': token },
        });
        if (!res.ok) {
          failed++;
          errors.push(`${p.name}: variant ${p.shopify_variant_id} non trouvé sur Shopify (${res.status})`);
          return;
        }
        const json = await res.json();
        const productId = json.variant?.product_id;
        if (!productId) {
          failed++;
          errors.push(`${p.name}: product_id absent dans la réponse Shopify`);
          return;
        }

        const { error: upErr } = await supabase
          .from('products')
          .update({ shopify_product_id: String(productId) })
          .eq('id', p.id);

        if (upErr) {
          failed++;
          errors.push(`${p.name}: erreur DB: ${upErr.message}`);
        } else {
          repaired++;
        }
      } catch (e: any) {
        failed++;
        errors.push(`${p.name}: ${e.message}`);
      }
    }));
  }

  return NextResponse.json({
    total: products.length,
    repaired,
    failed,
    errors: errors.slice(0, 20),
  });
}

// GET — dry-run: count how many products need repair
export async function GET(_req: NextRequest) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .not('shopify_variant_id', 'is', null)
    .is('shopify_product_id', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ needs_repair: count ?? 0 });
}
