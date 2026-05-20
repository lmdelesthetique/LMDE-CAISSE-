'use client';

import { useEffect } from 'react';

export default function PWARegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker?.register('/sw.js', { scope: '/' })?.then((registration) => {
          console.log('[PWA] Service Worker registered:', registration?.scope);
        })?.catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    }
  }, []);

  return null;
}
