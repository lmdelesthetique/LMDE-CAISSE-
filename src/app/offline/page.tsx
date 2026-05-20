'use client';

import React from 'react';
import Image from 'next/image';

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#1a0a2e] text-white px-6">
      <div className="text-center max-w-md">
        <div className="mb-8 flex justify-center">
          <Image
            src="/assets/images/lmde-caisse-icon-512.png"
            alt="LMDE Caisse logo"
            width={96}
            height={96}
            className="rounded-2xl opacity-90"
          />
        </div>
        <h1 className="text-3xl font-bold mb-3 text-white">LMDE Caisse</h1>
        <div className="w-12 h-1 bg-purple-400 rounded mx-auto mb-6" />
        <div className="bg-white/10 rounded-2xl p-6 mb-6">
          <div className="text-4xl mb-3">📡</div>
          <h2 className="text-xl font-semibold mb-2">Connexion indisponible</h2>
          <p className="text-white/70 text-sm leading-relaxed">
            Vous êtes actuellement hors ligne. Certaines fonctionnalités peuvent être limitées.
            La synchronisation reprendra automatiquement dès que la connexion sera rétablie.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-6 text-sm">
          {[
            { icon: '🛒', label: 'Caisse', href: '/pos-sales-terminal' },
            { icon: '📦', label: 'Stock', href: '/stock' },
            { icon: '🧾', label: 'Historique', href: '/caisse-historique' },
            { icon: '📊', label: 'Dashboard', href: '/dashboard' },
          ]?.map((item) => (
            <a
              key={item?.href}
              href={item?.href}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 rounded-xl p-3 transition-colors"
            >
              <span className="text-xl">{item?.icon}</span>
              <span className="font-medium">{item?.label}</span>
            </a>
          ))}
        </div>
        <button
          onClick={() => window.location?.reload()}
          className="w-full bg-purple-600 hover:bg-purple-500 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          Réessayer la connexion
        </button>
      </div>
    </div>
  );
}
