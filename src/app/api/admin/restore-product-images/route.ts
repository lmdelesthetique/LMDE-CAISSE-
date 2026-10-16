import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

function normalize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase().replace(/^-|-$/g, '');
}

// Extracts the product ref/name portion from a storage filename:
// "born-pretty-c001-1728123456789.jpg" → "born-pretty-c001"
// "c001-1728123456789.jpg" → "c001"
function extractBase(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^.]+$/, ''); // remove extension
  return withoutExt.replace(/-\d{10,}$/, '');          // remove trailing -timestamp (≥10 digits)
}

// GET — dry run: show what would be restored + debug info
export async function GET() {
  return runRestore(true);
}
// POST — apply the restore
export async function POST() {
  return runRestore(false);
}

async function runRestore(dryRun: boolean) {
  const supabase = createAdminClient();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

  // 1. List ALL files in the product-images bucket
  const allFiles: string[] = [];
  let offset = 0;
  const PAGE = 1000;
  let listError: string | null = null;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(undefined as any, {
      limit: PAGE,
      offset,
    });
    if (error) { listError = error.message; break; }
    if (!data?.length) break;
    allFiles.push(...data.map((f: any) => f.name as string).filter(Boolean));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  // 2. Build lookup: normalizedBase → most-recent filename
  //    (files are returned newest-first when using default sort)
  const baseToFile = new Map<string, string>();
  for (const name of allFiles) {
    const base = extractBase(name);
    if (base && !baseToFile.has(base)) baseToFile.set(base, name);
  }

  // 3. Load all products
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, ref, name, image_url')
    .range(0, 9999);

  if (pErr) return NextResponse.json({ error: pErr.message, listError }, { status: 500 });

  // 4. Find products whose image_url was replaced by a Shopify CDN URL
  const toRestore: {
    id: string; ref: string; name: string;
    oldUrl: string; newUrl: string; matchedBy: string;
  }[] = [];

  const noMatch: { id: string; ref: string; name: string; shopifyUrl: string; normalRef: string; normalName: string }[] = [];

  for (const prod of products ?? []) {
    const currentUrl: string | null = prod.image_url;
    if (!currentUrl) continue;

    const isShopifyUrl =
      currentUrl.includes('cdn.shopify.com') ||
      currentUrl.includes('shopify.com/s/files');
    if (!isShopifyUrl) continue;

    // Try matching: normalizedRef first, then normalizedName
    const normalRef = prod.ref ? normalize(prod.ref) : null;
    const normalName = prod.name ? normalize(prod.name) : null;

    let fileName: string | undefined;
    let matchedBy = '';

    if (normalRef) {
      fileName = baseToFile.get(normalRef);
      if (fileName) matchedBy = `ref:${normalRef}`;
    }
    if (!fileName && normalName) {
      fileName = baseToFile.get(normalName);
      if (fileName) matchedBy = `name:${normalName}`;
    }

    if (!fileName) {
      noMatch.push({
        id: prod.id,
        ref: prod.ref ?? '',
        name: prod.name ?? '',
        shopifyUrl: currentUrl,
        normalRef: normalRef ?? '',
        normalName: normalName ?? '',
      });
      continue;
    }

    const newUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
    toRestore.push({
      id: prod.id,
      ref: prod.ref ?? '',
      name: prod.name ?? '',
      oldUrl: currentUrl,
      newUrl,
      matchedBy,
    });
  }

  const debugInfo = {
    bucket_files_total: allFiles.length,
    bucket_sample: allFiles.slice(0, 10),
    base_keys_sample: [...baseToFile.keys()].slice(0, 10),
    products_with_shopify_url: toRestore.length + noMatch.length,
    matched: toRestore.length,
    unmatched: noMatch.length,
    listError,
    supabaseUrl: supabaseUrl.slice(0, 40) + '...',
  };

  if (dryRun || !toRestore.length) {
    return NextResponse.json({
      ok: true, dryRun, restored: 0,
      ...debugInfo,
      preview: toRestore.slice(0, 20),
      no_match_sample: noMatch.slice(0, 20),
    });
  }

  // 5. Apply restore
  let restored = 0;
  const errors: string[] = [];
  for (const item of toRestore) {
    const { error } = await supabase
      .from('products')
      .update({ image_url: item.newUrl })
      .eq('id', item.id);
    if (error) errors.push(`${item.name}: ${error.message}`);
    else restored++;
  }

  return NextResponse.json({
    ok: true, dryRun: false, restored,
    errors: errors.slice(0, 10),
    ...debugInfo,
  });
}
