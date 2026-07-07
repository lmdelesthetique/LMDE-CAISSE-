import type { Metadata } from 'next';
import React from 'react';

export async function generateMetadata(
  { params }: { params: Promise<{ lienUnique: string }> }
): Promise<Metadata> {
  const { lienUnique } = await params;
  return {
    title: 'Mon Espace Ambassadrice — Le Monde de l\'Esthétique',
    description: 'Votre espace personnel ambassadrice.',
    manifest: `/ambassadrice/${lienUnique}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: 'Mon Espace 💅',
      statusBarStyle: 'black-translucent',
      startupImage: '/icons/icon-512.png',
    },
    other: {
      // Force iOS to use ambassadrice manifest start_url, not the root admin app
      'apple-mobile-web-app-capable': 'yes',
      'apple-mobile-web-app-title': 'Mon Espace 💅',
    },
  };
}

export default function AmbassadriceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
