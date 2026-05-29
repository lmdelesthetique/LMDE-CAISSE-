import { NextRequest, NextResponse } from 'next/server';
import { adjustInventoryLevel, setInventoryLevel, updateLastSyncAt } from '@/lib/services/shopifyService';
import { createClient as createSupabase } from '@supabase/supabase-js';

interface SyncItem {
  productId: string;
  delta: number;
  newStock?: number;
}

function getSupabase() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items: SyncItem[] = body.items ?? [];
  if (!items.length) return NextResponse.json({ ok: true });

  const supabase = getSupabase();

  const results = await Promise.all(
    items.map(async (item) => {
      const { data: product } = await supabase
        .from('products')
        .select('shopify, shopify_inventory_item_id')
        .eq('id', item.productId)
        .maybeSingle();

      // Skip products not linked to Shopify
      if (!product?.shopify || !product.shopify_inventory_item_id) {
        return { productId: item.productId, skipped: true };
      }

      const invItemId = product.shopify_inventory_item_id as string;
      let ok: boolean;

      // If new stock is explicitly 0 → set absolute to 0 (marks as out of stock)
      if (item.newStock === 0) {
        ok = await setInventoryLevel(invItemId, 0);
      } else {
        ok = await adjustInventoryLevel(invItemId, item.delta);
      }

      return { productId: item.productId, ok };
    })
  );

  const anySucceeded = results.some((r) => 'ok' in r && r.ok);
  if (anySucceeded) updateLastSyncAt().catch(() => {});

  return NextResponse.json({ ok: true, results });
}
