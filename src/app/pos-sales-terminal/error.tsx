'use client';

import React, { useEffect } from 'react';

export default function POSError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[POS Error]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 px-6 text-center">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl p-8 border border-red-500/30">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h1 className="text-white text-lg font-bold mb-2">Erreur de la caisse</h1>
        <p className="text-red-400 text-sm font-mono bg-slate-900 rounded-lg p-3 mb-4 text-left break-all">
          {error.message || 'Erreur inconnue'}
        </p>
        {error.digest && (
          <p className="text-slate-500 text-xs mb-4">Code: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="w-full py-3 bg-primary text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Réessayer
        </button>
        <button
          onClick={() => window.location.href = '/dashboard'}
          className="w-full py-2 mt-2 text-slate-400 text-sm hover:text-white transition-colors"
        >
          Retour au tableau de bord
        </button>
      </div>
    </div>
  );
}
