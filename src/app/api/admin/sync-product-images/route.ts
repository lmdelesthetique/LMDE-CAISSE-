import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

async function shopifyFetchImages(shopifyIds: number[]): Promise<Map<number, string>> {
  const imageMap = new Map<number, string>();
  if (!shopifyIds.length) return imageMap;

  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) return imageMap;

  const CHUNK = 50;
  for (let i = 0; i < shopifyIds.length; i += CHUNK) {
    const chunk = shopifyIds.slice(i, i + CHUNK);
    try {
      const res = await fetch(
        `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/products.json?ids=${chunk.join(',')}&fields=id,image`,
        { headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token } }
      );
      if (!res.ok) continue;
      const json = await res.json();
      for (const p of json.products ?? []) {
        if (p.image?.src) imageMap.set(Number(p.id), p.image.src);
      }
    } catch { /* skip on error */ }
  }
  return imageMap;
}

// POST — sync image_url for ALL products linked to Shopify, then backfill fo_order_lines
export async function POST() {
  const supabase = createAdminClient();

  // 1. Fetch all products with shopify_product_id set
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, ref, shopify_product_id, image_url')
    .not('shopify_product_id', 'is', null);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!products?.length) return NextResponse.json({ productsUpdated: 0, linesUpdated: 0 });

  // 2. Fetch Shopify images
  const numericIds = products
    .map(p => Number(p.shopify_product_id))
    .filter(n => !isNaN(n) && n > 0);

  const shopifyImages = await shopifyFetchImages(numericIds);

  // 3. Update products.image_url for all that have a Shopify image
  let productsUpdated = 0;
  const updatedProductIds = new Set<string>();

  for (const prod of products) {
    const imgUrl = shopifyImages.get(Number(prod.shopify_product_id));
    if (!imgUrl || imgUrl === prod.image_url) continue;

    const { error } = await supabase
      .from('products')
      .update({ image_url: imgUrl })
      .eq('id', prod.id);

    if (!error) {
      productsUpdated++;
      updatedProductIds.add(prod.id);
    }
  }

  if (updatedProductIds.size === 0) {
    return NextResponse.json({ productsUpdated: 0, linesUpdated: 0 });
  }

  // 4. Build ref → image_url map for fo_order_lines backfill
  const refToImage = new Map<string, string>();
  const idToImage = new Map<string, string>();
  for (const prod of products) {
    const imgUrl = shopifyImages.get(Number(prod.shopify_product_id));
    if (!imgUrl) continue;
    if (prod.ref) refToImage.set(prod.ref, imgUrl);
    idToImage.set(prod.id, imgUrl);
  }

  // 5. Find all fo_order_lines where product_image_url is null and product matches
  const updatedRefs = [...refToImage.keys()];
  const updatedIds = [...idToImage.keys()];

  const orFilters: string[] = [];
  if (updatedIds.length) orFilters.push(`product_id.in.(${updatedIds.join(',')})`);
  if (updatedRefs.length) orFilters.push(`product_ref.in.(${updatedRefs.join(',')})`);

  let linesUpdated = 0;
  if (orFilters.length) {
    const { data: lines } = await supabase
      .from('fo_order_lines')
      .select('id, product_id, product_ref, product_image_url')
      .is('product_image_url', null)
      .or(orFilters.join(','));

    for (const line of lines ?? []) {
      const imgUrl = (line.product_id ? idToImage.get(line.product_id) : null)
        ?? (line.product_ref ? refToImage.get(line.product_ref) : null);
      if (!imgUrl) continue;

      const { error } = await supabase
        .from('fo_order_lines')
        .update({ product_image_url: imgUrl })
        .eq('id', line.id);
      if (!error) linesUpdated++;
    }
  }

  return NextResponse.json({ productsUpdated, linesUpdated });
}
