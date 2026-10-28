import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

// RULE: image_url in products ALWAYS points to Supabase Storage only.
// Shopify CDN URLs (cdn.shopify.com) must never be stored in image_url.
// Shopify keeps its own images independently — the two systems never mix.

function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

function extractBase(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, '');
  return withoutExt.replace(/-\d{10,}$/, '');
}

function isShopifyCdnUrl(url: string | null): boolean {
  if (!url) return false;
  return url.includes('cdn.shopify.com') || url.includes('shopifycdn.com');
}

function isSupabaseStorageUrl(url: string | null, storageBase: string): boolean {
  if (!url) return false;
  return url.startsWith(storageBase);
}

// POST — enforce Supabase Storage as sole image source for the POS.
// Processes ALL products (not just those with null image_url):
//   - NULL image_url       → try to fill from Supabase Storage
//   - Shopify CDN image_url → replace with Supabase Storage if match found;
//                             leave Shopify URL untouched if no Storage match
//   - Already Supabase URL → skip (already correct)
export async function POST() {
  const supabase = createAdminClient();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const storageBase = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/`;

  // 1. Fetch all products (not just Shopify-linked — any product can have a wrong URL)
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, ref, name, image_url')
    .range(0, 9999);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!products?.length) return NextResponse.json({ productsUpdated: 0, shopifyUrlsReplaced: 0, linesUpdated: 0 });

  // Only process products that need fixing
  const toProcess = (products as any[]).filter(p =>
    !p.image_url || isShopifyCdnUrl(p.image_url) || !isSupabaseStorageUrl(p.image_url, storageBase)
  );

  // 2. List Supabase Storage bucket
  const allFiles: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(undefined as any, { limit: 1000, offset });
    if (error || !data?.length) break;
    allFiles.push(...data.map((f: any) => f.name as string).filter(Boolean));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Build lookup: normalized base name → full filename
  const baseToFile = new Map<string, string>();
  for (const name of allFiles) {
    const base = extractBase(name);
    if (base && !baseToFile.has(base)) baseToFile.set(base, name);
  }

  // 3. Update products — Supabase Storage only, never Shopify CDN
  let productsUpdated = 0;
  let shopifyUrlsReplaced = 0;
  const updatedProductIds = new Set<string>();

  for (const prod of toProcess) {
    const normalRef = prod.ref ? normalize(prod.ref) : null;
    const normalName = prod.name ? normalize(prod.name) : null;

    let storageFile: string | undefined;
    if (normalRef) storageFile = baseToFile.get(normalRef);
    if (!storageFile && normalName) storageFile = baseToFile.get(normalName);

    if (!storageFile) continue; // No Supabase Storage match — leave current URL as is

    const imgUrl = `${storageBase}${storageFile}`;
    if (prod.image_url === imgUrl) continue; // Already correct

    const wasShopify = isShopifyCdnUrl(prod.image_url);
    const { error } = await supabase
      .from('products')
      .update({ image_url: imgUrl })
      .eq('id', prod.id);

    if (!error) {
      productsUpdated++;
      updatedProductIds.add(prod.id);
      if (wasShopify) shopifyUrlsReplaced++;
    }
  }

  // 4. fo_order_lines backfill — Supabase Storage only (null lines only)
  // Build id/ref → Supabase Storage URL map from ALL products
  const idToStorageUrl = new Map<string, string>();
  const refToStorageUrl = new Map<string, string>();

  for (const prod of products as any[]) {
    const normalRef = prod.ref ? normalize(prod.ref) : null;
    const normalName = prod.name ? normalize(prod.name) : null;
    let storageFile: string | undefined;
    if (normalRef) storageFile = baseToFile.get(normalRef);
    if (!storageFile && normalName) storageFile = baseToFile.get(normalName);
    if (!storageFile) continue;

    const imgUrl = `${storageBase}${storageFile}`;
    idToStorageUrl.set(prod.id, imgUrl);
    if (prod.ref) refToStorageUrl.set(prod.ref, imgUrl);
  }

  const allIds = [...idToStorageUrl.keys()];
  const allRefs = [...refToStorageUrl.keys()];
  const orFilters: string[] = [];
  if (allIds.length) orFilters.push(`product_id.in.(${allIds.join(',')})`);
  if (allRefs.length) orFilters.push(`product_ref.in.(${allRefs.join(',')})`);

  let linesUpdated = 0;
  if (orFilters.length) {
    const { data: lines } = await supabase
      .from('fo_order_lines')
      .select('id, product_id, product_ref, product_image_url')
      .is('product_image_url', null)
      .or(orFilters.join(','));

    for (const line of lines ?? []) {
      const imgUrl =
        (line.product_id ? idToStorageUrl.get(line.product_id) : null) ??
        (line.product_ref ? refToStorageUrl.get(line.product_ref) : null);
      if (!imgUrl) continue;

      const { error } = await supabase
        .from('fo_order_lines')
        .update({ product_image_url: imgUrl })
        .eq('id', line.id);
      if (!error) linesUpdated++;
    }
  }

  return NextResponse.json({
    productsUpdated,
    shopifyUrlsReplaced,
    linesUpdated,
    storageFilesFound: allFiles.length,
    productsChecked: toProcess.length,
  });
}
