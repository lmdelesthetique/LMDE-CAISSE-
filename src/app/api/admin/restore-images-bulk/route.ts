import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'product-images';

function classifyUrl(url: string | null): 'null' | 'shopify' | 'supabase' | 'other' {
  if (!url) return 'null';
  if (url.includes('cdn.shopify.com') || url.includes('shopifycdn.com') || url.includes('shopify.com/s/files')) return 'shopify';
  if (url.includes('supabase.co/storage')) return 'supabase';
  return 'other';
}

// POST — apply bulk restoration
export async function POST() {
  const supabase = createAdminClient();
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');

  // 1. Load all products that need fixing (null or shopify)
  const needsImage = new Map<string, { name: string; ref: string; type: 'null' | 'shopify' }>();
  let prodOffset = 0;
  while (true) {
    const { data: batch, error } = await supabase
      .from('products')
      .select('id, name, ref, image_url')
      .range(prodOffset, prodOffset + 999);
    if (error || !batch?.length) break;
    for (const p of batch) {
      const type = classifyUrl(p.image_url);
      if (type === 'null' || type === 'shopify') {
        needsImage.set(p.id, { name: p.name ?? '', ref: p.ref ?? '', type });
      }
    }
    if (batch.length < 1000) break;
    prodOffset += 1000;
  }

  // 2. List bucket files and build ref → URL map
  const refToUrl = new Map<string, string>();
  let bucketOffset = 0;
  while (true) {
    const { data: files } = await supabase.storage.from(BUCKET).list('', {
      limit: 1000,
      offset: bucketOffset,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    if (!files?.length) break;
    for (const f of files) {
      if (!f.name) continue;
      const base = f.name.replace(/\.[^.]+$/, '').replace(/-\d{10,}$/, '');
      if (base && !refToUrl.has(base)) {
        refToUrl.set(base, `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${f.name}`);
      }
    }
    if (files.length < 1000) break;
    bucketOffset += 1000;
  }

  // 3. Scan receipts for Supabase URLs (most recent first)
  const bestFromReceipts = new Map<string, string>(); // product_id → supabase URL
  let receiptOffset = 0;
  while (true) {
    const { data: receipts } = await supabase
      .from('receipts')
      .select('items')
      .not('items', 'is', null)
      .order('created_at', { ascending: false })
      .range(receiptOffset, receiptOffset + 999);
    if (!receipts?.length) break;
    for (const r of receipts) {
      if (!Array.isArray(r.items)) continue;
      for (const item of r.items) {
        const pid = item.product_id;
        const url = item.image_url;
        if (!pid || !url || typeof url !== 'string') continue;
        if (!needsImage.has(pid)) continue;
        if (classifyUrl(url) !== 'supabase') continue;
        if (!bestFromReceipts.has(pid)) bestFromReceipts.set(pid, url);
      }
    }
    if (receipts.length < 1000) break;
    receiptOffset += 1000;
  }

  // 4. Build final restore map: receipt URL takes priority, then bucket by ref
  const toRestore = new Map<string, string>(); // product_id → supabase URL
  for (const [id, { ref }] of needsImage) {
    const fromReceipt = bestFromReceipts.get(id);
    if (fromReceipt) { toRestore.set(id, fromReceipt); continue; }
    const fromBucket = ref ? refToUrl.get(ref) : undefined;
    if (fromBucket) toRestore.set(id, fromBucket);
  }

  if (!toRestore.size) {
    return NextResponse.json({ ok: true, restored: 0, message: 'Aucune image à restaurer.' });
  }

  // 5. Apply in batches
  let restored = 0;
  const errors: string[] = [];
  for (const [id, url] of toRestore) {
    const { error } = await supabase.from('products').update({ image_url: url }).eq('id', id);
    if (error) errors.push(`${needsImage.get(id)?.name}: ${error.message}`);
    else restored++;
  }

  const shopifyRestored = [...toRestore.keys()].filter(id => needsImage.get(id)?.type === 'shopify').length;
  const nullRestored = restored - shopifyRestored;

  return NextResponse.json({
    ok: true,
    restored,
    shopify_remplacés: shopifyRestored,
    null_restaurés: nullRestored,
    errors: errors.slice(0, 10),
  });
}
