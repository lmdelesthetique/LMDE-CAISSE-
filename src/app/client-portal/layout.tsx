import React from 'react';
import type { Metadata, Viewport } from 'next';
import { ClientAuthProvider } from '@/contexts/ClientAuthContext';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ec4899',
};

export const metadata: Metadata = {
  title: 'Mon Portail Beauté — Le Monde de l\'Esthétique',
  description: 'Votre espace abonnement box beauté personnel.',
  manifest: '/client-manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Box Beauté',
    statusBarStyle: 'default',
  },
};

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientAuthProvider>{children}</ClientAuthProvider>;
}
