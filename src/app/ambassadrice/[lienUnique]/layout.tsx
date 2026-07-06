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
      statusBarStyle: 'default',
    },
  };
}

export default function AmbassadriceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
