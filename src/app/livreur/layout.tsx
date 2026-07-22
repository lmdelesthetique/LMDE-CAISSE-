import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#f97316',
};

export const metadata: Metadata = {
  title: 'LMDE Livreur',
  description: 'Portail livreur — Le Monde de l\'Esthétique',
  // Override the root layout manifest so installing from /livreur/* installs
  // the livreur PWA (start_url: /livreur/login), not the POS app.
  manifest: '/livreur-manifest.json',
  appleWebApp: {
    capable: true,
    title: 'LMDE Livreur',
    statusBarStyle: 'default',
  },
};

/*
  This layout wraps all /livreur/* routes.
  Completely separate from the admin app —
  no sidebar, no admin navigation, no admin context.
*/
export default function LivreurLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
