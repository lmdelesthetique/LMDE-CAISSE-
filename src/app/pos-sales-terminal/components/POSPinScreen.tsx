'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePOSAuth } from '@/contexts/POSAuthContext';

const PIN_LENGTH = 6;

export default function POSPinScreen() {
  const { login, pinConfigured } = usePOSAuth();
  const [digits, setDigits] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = useCallback(async (pin: string) => {
    setLoading(true);
    const result = await login('', pin);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'Code incorrect');
      setShake(true);
      setTimeout(() => { setShake(false); setDigits([]); setError(''); }, 900);
    }
  }, [login]);

  const press = useCallback((key: string) => {
    if (loading || shake) return;
    if (key === 'del') {
      setDigits(d => d.slice(0, -1));
      return;
    }
    setDigits(prev => {
      const next = [...prev, key];
      if (next.length === PIN_LENGTH) {
        setTimeout(() => submit(next.join('')), 60);
      }
      return next;
    });
  }, [loading, shake, submit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') press(e.key);
      if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  const keys = ['1','2','3','4','5','6','7','8','9','del','0','ok'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">

        {/* Logo / title */}
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <h1 className="text-xl font-700 text-white">Caisse — Code PIN</h1>
          {!pinConfigured && (
            <p className="text-xs text-amber-400 mt-1">Aucun PIN configuré — accès libre</p>
          )}
        </div>

        {/* 6-dot display */}
        <div className={`flex gap-3 transition-transform ${shake ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
          {Array.from({ length: PIN_LENGTH }).map((_, i) => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < digits.length
                  ? error ? 'bg-red-500 border-red-500' : 'bg-primary border-primary'
                  : 'bg-transparent border-white/30'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-400 font-500 -mt-4">{error}</p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {keys.map((k) => {
            if (k === 'ok') return <div key="ok" />;
            return (
              <button
                key={k}
                onClick={() => press(k)}
                disabled={loading || shake}
                className={`
                  h-14 rounded-2xl text-white font-600 text-lg transition-all active:scale-95
                  ${k === 'del'
                    ? 'bg-white/10 hover:bg-white/20 text-sm'
                    : 'bg-white/15 hover:bg-white/25'
                  }
                  disabled:opacity-40
                `}
              >
                {k === 'del' ? (
                  <svg className="w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75L14.25 12m0 0l2.25 2.25M14.25 12l2.25-2.25M14.25 12L12 14.25m-2.58 4.92l-6.375-6.375a1.125 1.125 0 010-1.59L9.42 4.83c.21-.211.497-.33.795-.33H19.5a2.25 2.25 0 012.25 2.25v10.5a2.25 2.25 0 01-2.25 2.25h-9.284c-.298 0-.585-.119-.795-.33z" />
                  </svg>
                ) : k}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
