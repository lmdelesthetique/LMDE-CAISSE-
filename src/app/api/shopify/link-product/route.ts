import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST: link or unlink a BeautyPOS product to a Shopify variant
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { posProductId, shopifyVariantId, shopifyInventoryItemId, shopifyProductId, unlink } = body;

    if (!posProductId) {
      return NextResponse.json({ error: 'posProductId requis' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (unlink) {
      const { error } = await supabase
        .from('products')
        .update({
          shopify_variant_id: null,
          shopify_inventory_item_id: null,
          shopify_product_id: null,
          shopify: false,
        })
        .eq('id', posProductId);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!shopifyVariantId || !shopifyInventoryItemId) {
      return NextResponse.json({ error: 'shopifyVariantId et shopifyInventoryItemId requis' }, { status: 400 });
    }

    const { error } = await supabase
      .from('products')
      .update({
        shopify_variant_id: String(shopifyVariantId),
        shopify_inventory_item_id: String(shopifyInventoryItemId),
        shopify_product_id: shopifyProductId ? String(shopifyProductId) : null,
        shopify: true,
      })
      .eq('id', posProductId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
