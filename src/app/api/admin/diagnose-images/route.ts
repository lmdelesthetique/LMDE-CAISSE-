import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  // 1. All products image_url status
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name, ref, image_url')
    .range(0, 9999);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const stats = { total: 0, null: 0, shopify: 0, supabase: 0, other: 0 };
  const nullIds = new Set<string>();
  const byId = new Map<string, string>();

  for (const p of products ?? []) {
    stats.total++;
    const type = classifyUrl(p.image_url);
    stats[type]++;
    if (type === 'null') nullIds.add(p.id);
    byId.set(p.id, p.name);
  }

  // 2. Scan receipts for recoverable URLs
  const recoverable = new Map<string, string>(); // product_id → best non-shopify URL
  let offset = 0;
  const BATCH = 1000;
  let receiptsScanned = 0;

  while (true) {
    const { data: receipts, error: rErr } = await supabase
      .from('receipts')
      .select('items, created_at')
      .not('items', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (rErr || !receipts?.length) break;
    receiptsScanned += receipts.length;

    for (const receipt of receipts) {
      const items = receipt.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const pid = item.product_id;
        const url = item.image_url;
        if (!pid || !url || typeof url !== 'string') continue;
        if (!nullIds.has(pid)) continue;
        const type = classifyUrl(url);
        if (type !== 'supabase' && type !== 'other') continue;
        if (!recoverable.has(pid)) recoverable.set(pid, url); // most recent first
      }
    }

    if (receipts.length < BATCH) break;
    offset += BATCH;
  }

  const recoverableCount = recoverable.size;
  const notRecoverable = nullIds.size - recoverableCount;

  // Sample of recoverable products
  const recoverableSample = [...recoverable.entries()].slice(0, 15).map(([id, url]) => ({
    name: byId.get(id) ?? id,
    url_type: classifyUrl(url),
    url_preview: url.slice(0, 80),
  }));

  return NextResponse.json({
    products: {
      total: stats.total,
      avec_image_supabase: stats.supabase,
      avec_image_shopify: stats.shopify,
      avec_image_autre: stats.other,
      sans_image: stats.null,
    },
    receipts_scanned: receiptsScanned,
    recovery: {
      recuperables: recoverableCount,
      non_recuperables: notRecoverable,
      sample: recoverableSample,
    },
  });
}
