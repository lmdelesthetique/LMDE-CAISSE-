import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function isShopifyUrl(url: string): boolean {
  return url.includes('cdn.shopify.com') || url.includes('shopifycdn.com') || url.includes('shopify.com/s/files');
}

function isValidStorageUrl(url: string): boolean {
  return !isShopifyUrl(url) && (url.startsWith('http') || url.startsWith('https'));
}

// GET — dry run: show how many products would be recovered
export async function GET() {
  return runRecovery(true);
}

// POST — apply the recovery
export async function POST() {
  return runRecovery(false);
}

async function runRecovery(dryRun: boolean) {
  const supabase = createAdminClient();

  // 1. Load all products that currently have no image_url
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, ref, image_url')
    .range(0, 9999);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const missingImageIds = new Set<string>(
    (products ?? []).filter((p: any) => !p.image_url).map((p: any) => p.id)
  );

  if (missingImageIds.size === 0) {
    return NextResponse.json({ ok: true, dryRun, recovered: 0, message: 'Tous les produits ont déjà une image.' });
  }

  // 2. Scan receipts.items JSON for non-Shopify image URLs
  // Fetch in batches to avoid memory issues
  const productBestUrl = new Map<string, string>(); // product_id → best URL found
  let receiptOffset = 0;
  const BATCH = 1000;

  while (true) {
    const { data: receipts, error: rErr } = await supabase
      .from('receipts')
      .select('items, created_at')
      .not('items', 'is', null)
      .order('created_at', { ascending: false })
      .range(receiptOffset, receiptOffset + BATCH - 1);

    if (rErr || !receipts?.length) break;

    for (const receipt of receipts) {
      const items = receipt.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const pid = item.product_id;
        const url = item.image_url;
        if (!pid || !url || typeof url !== 'string') continue;
        if (!missingImageIds.has(pid)) continue; // skip products that already have an image
        if (!isValidStorageUrl(url)) continue;   // skip Shopify URLs and invalid
        if (!productBestUrl.has(pid)) {
          productBestUrl.set(pid, url); // most recent receipt wins (we ordered DESC)
        }
      }
    }

    if (receipts.length < BATCH) break;
    receiptOffset += BATCH;
  }

  const toRestore = [...productBestUrl.entries()].map(([id, url]) => ({ id, url }));

  if (dryRun || !toRestore.length) {
    const productNames = new Map((products ?? []).map((p: any) => [p.id, p.name]));
    return NextResponse.json({
      ok: true,
      dryRun,
      products_without_image: missingImageIds.size,
      recoverable: toRestore.length,
      not_recoverable: missingImageIds.size - toRestore.length,
      preview: toRestore.slice(0, 10).map(({ id, url }) => ({
        name: productNames.get(id) ?? id,
        url: url.slice(0, 80),
      })),
    });
  }

  // 3. Apply in batches
  let recovered = 0;
  const errors: string[] = [];

  for (const { id, url } of toRestore) {
    const { error } = await supabase.from('products').update({ image_url: url }).eq('id', id);
    if (error) errors.push(`${id}: ${error.message}`);
    else recovered++;
  }

  return NextResponse.json({
    ok: true,
    dryRun: false,
    recovered,
    errors: errors.slice(0, 10),
    products_without_image: missingImageIds.size,
  });
}
