import { NextRequest, NextResponse } from 'next/server';
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

// POST — force-refresh product_image_url on all lines (products table + Shopify fallback)
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = createAdminClient();

  const { data: lines, error: lErr } = await supabase
    .from('fo_order_lines')
    .select('id, product_ref, product_id, product_image_url')
    .eq('order_id', id);

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  if (!lines?.length) return NextResponse.json({ updated: 0 });

  // Collect all product refs and ids to batch-fetch
  const allRefs = [...new Set(lines.map((l) => l.product_ref).filter(Boolean))] as string[];
  const allIds = [...new Set(lines.map((l) => l.product_id).filter(Boolean))] as string[];

  // Batch-fetch products by ref
  const byRef = new Map<string, { id: string; image_url: string | null; shopify_product_id: string | null }>();
  if (allRefs.length) {
    const { data: refProds } = await supabase
      .from('products')
      .select('id, ref, image_url, shopify_product_id')
      .in('ref', allRefs);
    for (const p of refProds ?? []) {
      if (p.ref) byRef.set(p.ref, p);
    }
  }

  // Batch-fetch products by id (for any not covered by ref)
  const byId = new Map<string, { id: string; ref: string | null; image_url: string | null; shopify_product_id: string | null }>();
  if (allIds.length) {
    const { data: idProds } = await supabase
      .from('products')
      .select('id, ref, image_url, shopify_product_id')
      .in('id', allIds);
    for (const p of idProds ?? []) byId.set(p.id, p);
  }

  // Build image map per line id, and collect products missing images
  const imageByLineId = new Map<string, string>();
  const missingProductIds = new Set<string>();

  for (const line of lines) {
    const prodByRef = line.product_ref ? byRef.get(line.product_ref) : null;
    const prodById = line.product_id ? byId.get(line.product_id) : null;
    const prod = prodByRef ?? prodById;

    if (prod?.image_url) {
      imageByLineId.set(line.id, prod.image_url);
    } else if (prod?.id) {
      missingProductIds.add(prod.id);
    }
  }

  // Shopify fallback for products that have shopify_product_id but no image_url
  if (missingProductIds.size > 0) {
    const { data: shopifyProds } = await supabase
      .from('products')
      .select('id, ref, shopify_product_id')
      .in('id', [...missingProductIds])
      .not('shopify_product_id', 'is', null);

    if (shopifyProds?.length) {
      const numericIds = shopifyProds
        .map((p) => Number(p.shopify_product_id))
        .filter((n) => !isNaN(n) && n > 0);

      const shopifyImages = await shopifyFetchImages(numericIds);

      for (const prod of shopifyProds) {
        const imgUrl = shopifyImages.get(Number(prod.shopify_product_id));
        if (!imgUrl) continue;

        // Persist image back to products table so future loads are instant
        await supabase.from('products').update({ image_url: imgUrl }).eq('id', prod.id);
        // Update local maps
        const p = byId.get(prod.id);
        if (p) p.image_url = imgUrl;
        if (prod.ref) {
          const pr = byRef.get(prod.ref);
          if (pr) pr.image_url = imgUrl;
        }

        // Assign to lines
        for (const line of lines) {
          if (line.product_id === prod.id || line.product_ref === prod.ref) {
            imageByLineId.set(line.id, imgUrl);
          }
        }
      }
    }
  }

  // Update fo_order_lines — only where the image has changed
  let updated = 0;
  for (const line of lines) {
    const newUrl = imageByLineId.get(line.id) ?? null;
    if (!newUrl) continue;
    if (newUrl === line.product_image_url) continue;

    const { error } = await supabase
      .from('fo_order_lines').update({ product_image_url: newUrl }).eq('id', line.id);
    if (!error) updated++;
  }

  return NextResponse.json({ updated });
}
