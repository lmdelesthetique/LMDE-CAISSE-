'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if dismissed recently
    const dismissedAt = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissedAt) {
      const daysSince = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) {
        setDismissed(true);
        return;
      }
    }

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // Show iOS instructions after a short delay
      setTimeout(() => setShowPrompt(true), 3000);
      return;
    }

    // Listen for beforeinstallprompt (Chrome/Edge/Android)
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setShowPrompt(false);
    });

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowPrompt(false);
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  if (!showPrompt || isInstalled || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-6 md:max-w-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#1a0a2e] border border-purple-500/30 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <Image
            src="/assets/images/lmde-caisse-icon-512.png"
            alt="LMDE Caisse"
            width={48}
            height={48}
            className="rounded-xl flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-sm text-white">Installer LMDE Caisse</h3>
              <button
                onClick={handleDismiss}
                className="text-white/40 hover:text-white/80 transition-colors ml-2 flex-shrink-0"
                aria-label="Fermer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-white/60 text-xs mb-3 leading-relaxed">
              {isIOS
                ? 'Installez l\'app : appuyez sur' :'Accès rapide depuis votre écran d\'accueil, fonctionne hors ligne.'}
            </p>

            {isIOS ? (
              <div className="bg-white/10 rounded-xl p-3 text-xs text-white/80 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">1.</span>
                  <span>Appuyez sur <strong>Partager</strong> <span className="text-base">⬆️</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base">2.</span>
                  <span>Puis <strong>«&nbsp;Sur l'écran d'accueil&nbsp;»</strong></span>
                </div>
              </div>
            ) : (
              <button
                onClick={handleInstall}
                className="w-full bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold py-2 px-4 rounded-xl transition-colors"
              >
                📲 Installer l'application
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
