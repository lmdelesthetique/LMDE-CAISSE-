import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ lienUnique: string }> }
) {
  const { lienUnique } = await params;

  const manifest = {
    name: 'Mon Espace Ambassadrice',
    short_name: 'Mon Espace 💅',
    description: 'Espace personnel ambassadrice — Le Monde de l\'Esthétique',
    start_url: `/ambassadrice/${lienUnique}`,
    scope: `/ambassadrice/${lienUnique}`,
    display: 'standalone',
    background_color: '#fdf2f8',
    theme_color: '#ec4899',
    orientation: 'portrait',
    lang: 'fr',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  });
}
