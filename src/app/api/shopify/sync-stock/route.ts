import { NextRequest, NextResponse } from 'next/server';
import { adjustInventoryLevel, setInventoryLevel, updateLastSyncAt } from '@/lib/services/shopifyService';
import { createAdminClient } from '@/lib/supabase/admin';

interface SyncItem {
  productId: string;
  delta: number;
  newStock?: number;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const items: SyncItem[] = body.items ?? [];
  if (!items.length) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

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

      // Prefer absolute setInventoryLevel when newStock is known — avoids Shopify drift.
      // Fall back to delta-based adjust only when absolute value is not provided.
      if (item.newStock !== undefined) {
        ok = await setInventoryLevel(invItemId, item.newStock);
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
