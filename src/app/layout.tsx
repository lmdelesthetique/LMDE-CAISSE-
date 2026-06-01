import React from 'react';
import type { Metadata, Viewport } from 'next';
import '../styles/tailwind.css';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { InstallPWABanner } from '@/components/InstallPWABanner';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ec4899',
};

export const metadata: Metadata = {
  title: 'LMDE Caisse — Logiciel de Caisse Beauté',
  description: 'Logiciel de caisse professionnel pour boutiques beauté.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.ico' }],
    apple: [{ url: '/icons/icon-192.png' }],
  },
  appleWebApp: {
    capable: true,
    title: 'BeautyPOS',
    statusBarStyle: 'default',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <SettingsProvider>
            {children}
          </SettingsProvider>
        </AuthProvider>
        <Toaster position="bottom-right" toastOptions={{ style: { fontFamily: 'DM Sans, sans-serif', fontSize: '14px' } }} />
        <InstallPWABanner />
      </body>
    </html>
  );
}
