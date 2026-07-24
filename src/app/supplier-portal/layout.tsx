import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  manifest: '/supplier-manifest.json',
  title: 'Portail Fournisseur',
};

export const viewport: Viewport = {
  themeColor: '#22c55e',
};

export default function SupplierPortalLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
