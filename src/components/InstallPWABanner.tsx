'use client';
import { useState, useEffect } from 'react';

export function InstallPWABanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!show) return null;

  async function install() {
    if (!prompt) return;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') setShow(false);
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-pink-600 text-white rounded-xl p-4 shadow-xl z-50 flex items-center justify-between">
      <div>
        <p className="font-bold">📲 Installer BeautyPOS</p>
        <p className="text-sm opacity-90">Accès direct depuis votre écran de caisse</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setShow(false)} className="px-3 py-1 rounded-lg bg-pink-700 text-sm">
          Plus tard
        </button>
        <button onClick={install} className="px-3 py-1 rounded-lg bg-white text-pink-600 font-bold text-sm">
          Installer
        </button>
      </div>
    </div>
  );
}
