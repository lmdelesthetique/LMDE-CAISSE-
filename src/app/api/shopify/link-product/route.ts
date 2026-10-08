import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAccessToken } from '@/lib/services/shopifyService';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

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

    if (!shopifyVariantId) {
      return NextResponse.json({ error: 'shopifyVariantId requis' }, { status: 400 });
    }

    // If inventory_item_id not provided, fetch it from Shopify API
    let resolvedInventoryItemId = shopifyInventoryItemId;
    if (!resolvedInventoryItemId) {
      const token = await getAccessToken();
      if (token && STORE_DOMAIN) {
        try {
          const res = await fetch(
            `https://${STORE_DOMAIN}/admin/api/${API_VERSION}/variants/${shopifyVariantId}.json?fields=id,inventory_item_id`,
            { headers: { 'X-Shopify-Access-Token': token } }
          );
          if (res.ok) {
            const data = await res.json();
            if (data.variant?.inventory_item_id) {
              resolvedInventoryItemId = String(data.variant.inventory_item_id);
            }
          }
        } catch { /* proceed without */ }
      }
    }

    const { error } = await supabase
      .from('products')
      .update({
        shopify_variant_id: String(shopifyVariantId),
        shopify_inventory_item_id: resolvedInventoryItemId ? String(resolvedInventoryItemId) : null,
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
