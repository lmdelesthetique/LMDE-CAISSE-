import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

// GET — dry run: show what would be restored
// POST — apply the restore
export async function GET() {
  return runRestore(true);
}
export async function POST() {
  return runRestore(false);
}

async function runRestore(dryRun: boolean) {
  const supabase = createAdminClient();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // 1. List all files in the product-images bucket (paginated, 1000 per page)
  const allFiles: { name: string }[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', {
      limit: PAGE,
      offset,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (error || !data?.length) break;
    allFiles.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (!allFiles.length) {
    return NextResponse.json({ ok: true, found: 0, restored: 0, dryRun, files: [] });
  }

  // 2. Build map: productRef → most-recent file name
  // Filename format: {ref}-{timestamp}.{ext}  e.g. born-pretty-c001-1728123456789.jpg
  const refToFile = new Map<string, string>();
  for (const file of allFiles) {
    // Strip timestamp suffix: remove last `-{digits}.{ext}`
    const withoutExt = file.name.replace(/\.[^.]+$/, '');
    const ref = withoutExt.replace(/-\d{10,}$/, ''); // remove -timestamp (≥10 digits = ms)
    if (!refToFile.has(ref)) {
      // First = most recent (sorted desc)
      refToFile.set(ref, file.name);
    }
  }

  // 3. Load all products — check which ones have a Shopify CDN URL (overwritten)
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, ref, name, image_url')
    .range(0, 9999);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const toRestore: { id: string; ref: string; name: string; oldUrl: string; newUrl: string }[] = [];

  for (const prod of products ?? []) {
    if (!prod.ref) continue;

    const currentUrl: string | null = prod.image_url;
    // Only restore products whose image_url was replaced by a Shopify CDN URL
    const isShopifyUrl = currentUrl && (
      currentUrl.includes('cdn.shopify.com') ||
      currentUrl.includes('shopify.com')
    );
    if (!isShopifyUrl) continue;

    // Try exact ref match, then normalised ref match
    const normalRef = prod.ref.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const fileName = refToFile.get(normalRef) ?? refToFile.get(prod.ref.toLowerCase());
    if (!fileName) continue;

    const newUrl = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${fileName}`;
    toRestore.push({ id: prod.id, ref: prod.ref, name: prod.name, oldUrl: currentUrl!, newUrl });
  }

  if (dryRun || !toRestore.length) {
    return NextResponse.json({
      ok: true,
      dryRun,
      bucket_files: allFiles.length,
      found: toRestore.length,
      restored: 0,
      preview: toRestore.slice(0, 50),
    });
  }

  // 4. Restore
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
    ok: true,
    dryRun: false,
    bucket_files: allFiles.length,
    found: toRestore.length,
    restored,
    errors,
  });
}
