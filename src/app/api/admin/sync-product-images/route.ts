import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';
const BUCKET = 'product-images';

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

function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function extractBase(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/-\d{10,}$/, '');
}

// POST — sync image_url for products with no image, checking Supabase storage first
export async function POST() {
  const supabase = createAdminClient();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

  // 1. Fetch all products with shopify_product_id set but no image_url
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, ref, name, shopify_product_id, image_url')
    .not('shopify_product_id', 'is', null);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!products?.length) return NextResponse.json({ productsUpdated: 0, linesUpdated: 0 });

  // Only consider products with no image_url
  const nullImageProducts = products.filter((p: any) => !p.image_url);
  if (!nullImageProducts.length) return NextResponse.json({ productsUpdated: 0, linesUpdated: 0 });

  // 2. List Supabase storage bucket to find custom images
  const allFiles: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(undefined as any, { limit: 1000, offset });
    if (error || !data?.length) break;
    allFiles.push(...data.map((f: any) => f.name as string).filter(Boolean));
    if (data.length < 1000) break;
    offset += 1000;
  }
  const baseToFile = new Map<string, string>();
  for (const name of allFiles) {
    const base = extractBase(name);
    if (base && !baseToFile.has(base)) baseToFile.set(base, name);
  }

  // 3. Fetch Shopify images as fallback
  const numericIds = nullImageProducts
    .map((p: any) => Number(p.shopify_product_id))
    .filter((n: number) => !isNaN(n) && n > 0);
  const shopifyImages = await shopifyFetchImages(numericIds);

  // 4. Update products — prefer Supabase storage URL, fall back to Shopify CDN
  let productsUpdated = 0;
  const updatedProductIds = new Set<string>();

  for (const prod of nullImageProducts) {
    // Try Supabase storage first
    const normalRef = prod.ref ? normalize(prod.ref) : null;
    const normalName = prod.name ? normalize(prod.name) : null;
    let storageFile: string | undefined;
    if (normalRef) storageFile = baseToFile.get(normalRef);
    if (!storageFile && normalName) storageFile = baseToFile.get(normalName);

    let imgUrl: string | undefined;
    if (storageFile) {
      imgUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${storageFile}`;
    } else {
      // Fallback to Shopify CDN only if no storage file found
      const shopifyImg = shopifyImages.get(Number(prod.shopify_product_id));
      if (shopifyImg) imgUrl = shopifyImg;
    }

    if (!imgUrl) continue;

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

  // 5. Build ref → image_url map for fo_order_lines backfill (null lines only)
  const refToImage = new Map<string, string>();
  const idToImage = new Map<string, string>();
  for (const prod of products) {
    const imgUrl = shopifyImages.get(Number(prod.shopify_product_id));
    if (!imgUrl) continue;
    if (prod.ref) refToImage.set(prod.ref, imgUrl);
    idToImage.set(prod.id, imgUrl);
  }

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
