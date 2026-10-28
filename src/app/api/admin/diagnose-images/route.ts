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

  // 1. All products image_url status — paginate by 1000 to bypass Supabase default limit
  const stats = { total: 0, null: 0, shopify: 0, supabase: 0, other: 0 };
  const nullIds = new Set<string>();
  const byId = new Map<string, string>();
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
      byId.set(p.id, p.name);
    }
    if (batch.length < 1000) break;
    prodOffset += 1000;
  }

  // 2. Scan receipts — count URL types in items AND find recoverable ones
  const recoverable = new Map<string, string>(); // product_id → best non-shopify URL
  let offset = 0;
  const BATCH = 1000;
  let receiptsScanned = 0;
  const receiptUrlTypes = { null: 0, shopify: 0, supabase: 0, other: 0 };

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
        const type = classifyUrl(url);
        receiptUrlTypes[type]++;
        if (!pid || !url || typeof url !== 'string') continue;
        if (!nullIds.has(pid)) continue;
        if (type !== 'supabase' && type !== 'other') continue;
        if (!recoverable.has(pid)) recoverable.set(pid, url);
      }
    }

    if (receipts.length < BATCH) break;
    offset += BATCH;
  }

  const recoverableCount = recoverable.size;
  const notRecoverable = nullIds.size - recoverableCount;

  const recoverableSample = [...recoverable.entries()].slice(0, 15).map(([id, url]) => ({
    name: byId.get(id) ?? id,
    url_type: classifyUrl(url),
    url: url,
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
    reçus_types_image: receiptUrlTypes,
    recovery: {
      recuperables: recoverableCount,
      non_recuperables: notRecoverable,
      sample: recoverableSample,
    },
  });
}
