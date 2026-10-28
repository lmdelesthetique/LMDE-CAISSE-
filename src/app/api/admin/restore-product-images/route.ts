import { NextResponse } from 'next/server';

// Route désactivée : les noms de fichiers dans product-images sont aléatoires
// (pas de correspondance possible avec les refs produits).
// La règle : image_url = URL Supabase Storage uniquement, assignée via l'interface
// Gestion Produits. Pour nettoyer les URLs Shopify CDN : POST /api/admin/sync-product-images

export async function GET() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    message: 'Route désactivée. Les images ont des noms aléatoires sans correspondance avec les références produits. Utilisez POST /api/admin/sync-product-images pour nettoyer les URLs Shopify CDN.',
  });
}

export async function POST() {
  return NextResponse.json({
    ok: false,
    disabled: true,
    message: 'Route désactivée. Les images ont des noms aléatoires sans correspondance avec les références produits. Utilisez POST /api/admin/sync-product-images pour nettoyer les URLs Shopify CDN.',
  });
}
