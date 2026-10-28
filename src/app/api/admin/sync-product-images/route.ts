import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// RULE: image_url in products ALWAYS = Supabase Storage URL (set at upload time).
// Shopify CDN URLs (cdn.shopify.com) must never sit in image_url.
// This route finds products with a Shopify CDN URL and clears them to NULL
// so the POS shows no image rather than a wrong Shopify-transformed one.
// Images are set correctly only via the product management upload UI.

function isShopifyCdnUrl(url: string | null): boolean {
  if (!url) return false;
  return url.includes('cdn.shopify.com') || url.includes('shopifycdn.com');
}

export async function POST() {
  const supabase = createAdminClient();

  // Find all products whose image_url is a Shopify CDN URL
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image_url')
    .range(0, 9999);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const shopifyCdnProducts = (products ?? []).filter((p: any) => isShopifyCdnUrl(p.image_url));

  if (!shopifyCdnProducts.length) {
    return NextResponse.json({ cleared: 0, message: 'Aucune URL Shopify CDN trouvée dans image_url — tout est propre.' });
  }

  let cleared = 0;
  const errors: string[] = [];

  for (const prod of shopifyCdnProducts) {
    const { error: upErr } = await supabase
      .from('products')
      .update({ image_url: null })
      .eq('id', prod.id);

    if (upErr) errors.push(`${prod.name}: ${upErr.message}`);
    else cleared++;
  }

  return NextResponse.json({
    cleared,
    errors,
    message: `${cleared} produit(s) nettoyés — URLs Shopify CDN supprimées. Les images seront à re-uploader via Gestion Produits.`,
  });
}
