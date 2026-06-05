import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#ec4899',
};

export const metadata: Metadata = {
  title: 'BeautyPOS Livreur',
  description: 'Portail livreur — Le Monde de l\'Esthétique',
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
