import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

function classifyUrl(url: string | null): 'null' | 'shopify' | 'supabase' | 'other' {
  if (!url) return 'null';
  if (url.includes('cdn.shopify.com') || url.includes('shopifycdn.com') || url.includes('shopify.com/s/files')) return 'shopify';
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (supabaseUrl && url.includes(supabaseUrl)) return 'supabase';
  if (url.includes('supabase.co/storage')) return 'supabase';
  return 'other';
}

export async function GET() {
  const supabase = createAdminClient();

  // 1. All products image_url status — paginate by 1000 to bypass Supabase default limit
  const stats = { total: 0, null: 0, shopify: 0, supabase: 0, other: 0 };
  const nullIds = new Set<string>();
  const shopifyIds = new Set<string>();
  const byId = new Map<string, { name: string; ref: string }>();
  let prodOffset = 0;
  while (true) {
    const { data: batch, error: pErr } = await supabase
      .from('products')
      .select('id, name, ref, image_url')
      .range(prodOffset, prodOffset + 999);
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    if (!batch?.length) break;
    for (const p of batch) {
      stats.total++;
      const type = classifyUrl(p.image_url);
      stats[type]++;
      if (type === 'null') nullIds.add(p.id);
      if (type === 'shopify') shopifyIds.add(p.id);
      byId.set(p.id, { name: p.name, ref: p.ref ?? '' });
    }
    if (batch.length < 1000) break;
    prodOffset += 1000;
  }

  // 1b. List files in Storage bucket (fix: use '' not undefined)
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
  const bucketFiles: string[] = [];
  let bucketOffset = 0;
  while (true) {
    const { data: files } = await supabase.storage.from(BUCKET).list('', {
      limit: 1000,
      offset: bucketOffset,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (!files?.length) break;
    bucketFiles.push(...files.map((f: any) => f.name as string).filter(Boolean));
    if (files.length < 1000) break;
    bucketOffset += 1000;
  }

  // Build ref → filename map from bucket (pattern: {ref}-{timestamp}.ext)
  const refToFile = new Map<string, string>();
  for (const name of bucketFiles) {
    const base = name.replace(/\.[^.]+$/, '').replace(/-\d{10,}$/, '');
    if (!base) continue;
    if (!refToFile.has(base)) refToFile.set(base, name);
  }

  // 2. Scan receipts — find Supabase URLs for null AND shopify products
  const recoverableNull = new Map<string, string>();    // null products → supabase URL from receipt
  const recoverableShopify = new Map<string, string>(); // shopify products → supabase URL from receipt
  let receiptOffset = 0;
  const BATCH = 1000;
  let receiptsScanned = 0;
  const receiptUrlTypes = { null: 0, shopify: 0, supabase: 0, other: 0 };

  while (true) {
    const { data: receipts, error: rErr } = await supabase
      .from('receipts')
      .select('items, created_at')
      .not('items', 'is', null)
      .order('created_at', { ascending: false })
      .range(receiptOffset, receiptOffset + BATCH - 1);

    if (rErr || !receipts?.length) break;
    receiptsScanned += receipts.length;

    for (const receipt of receipts) {
      const items = receipt.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const pid = item.product_id;
        const url = item.image_url;
        const type = classifyUrl(url);
        receiptUrlTypes[type]++;
        if (!pid || !url || typeof url !== 'string') continue;
        if (type !== 'supabase') continue;
        if (nullIds.has(pid) && !recoverableNull.has(pid)) recoverableNull.set(pid, url);
        if (shopifyIds.has(pid) && !recoverableShopify.has(pid)) recoverableShopify.set(pid, url);
      }
    }

    if (receipts.length < BATCH) break;
    receiptOffset += BATCH;
  }

  // 3. Storage bucket matching for null + shopify products without receipt URL
  let storageMatchNull = 0;
  let storageMatchShopify = 0;
  for (const [id] of [...nullIds].map(id => [id, byId.get(id)?.ref ?? ''] as [string, string])) {
    if (recoverableNull.has(id)) continue;
    const ref = byId.get(id)?.ref ?? '';
    if (ref && refToFile.has(ref)) {
      storageMatchNull++;
      recoverableNull.set(id, `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${refToFile.get(ref)}`);
    }
  }
  for (const [id] of [...shopifyIds].map(id => [id, byId.get(id)?.ref ?? ''] as [string, string])) {
    if (recoverableShopify.has(id)) continue;
    const ref = byId.get(id)?.ref ?? '';
    if (ref && refToFile.has(ref)) {
      storageMatchShopify++;
      recoverableShopify.set(id, `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${refToFile.get(ref)}`);
    }
  }

  return NextResponse.json({
    products: {
      total: stats.total,
      avec_image_supabase: stats.supabase,
      avec_image_shopify: stats.shopify,
      sans_image: stats.null,
    },
    bucket: {
      fichiers_total: bucketFiles.length,
      sample: bucketFiles.slice(0, 5),
    },
    receipts_scanned: receiptsScanned,
    reçus_types_image: receiptUrlTypes,
    recovery_null: {
      a_restaurer: recoverableNull.size,
      dont_depuis_reçus: recoverableNull.size - storageMatchNull,
      dont_depuis_bucket: storageMatchNull,
      non_recuperables: nullIds.size - recoverableNull.size,
      sample: [...recoverableNull.entries()].slice(0, 5).map(([id, url]) => ({
        name: byId.get(id)?.name ?? id,
        source: url.includes('supabase.co/storage') ? 'bucket' : 'recu',
        url,
      })),
    },
    recovery_shopify: {
      a_remplacer: recoverableShopify.size,
      dont_depuis_reçus: recoverableShopify.size - storageMatchShopify,
      dont_depuis_bucket: storageMatchShopify,
      garder_shopify: shopifyIds.size - recoverableShopify.size,
      sample: [...recoverableShopify.entries()].slice(0, 5).map(([id, url]) => ({
        name: byId.get(id)?.name ?? id,
        source: url.includes('supabase.co/storage') ? 'bucket' : 'recu',
        url,
      })),
    },
  });
}
