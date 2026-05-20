'use client';

import React, { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { usePOSAuth } from '@/contexts/POSAuthContext';

export default function EmployeePINModal() {
  const { login } = usePOSAuth();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleDigit = (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d;
    setPin(next);
    setError('');
    if (next.length >= 4) {
      // auto-submit when 4-6 digits entered and user presses enter or we wait
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      setError('Le PIN doit contenir au moins 4 chiffres');
      return;
    }
    setLoading(true);
    const result = await login(pin);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? 'PIN incorrect');
      setPin('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Backspace') handleDelete();
    else if (/^\d$/.test(e.key)) handleDigit(e.key);
  };

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-sm mx-4">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
            <Icon name="LockClosedIcon" size={28} className="text-primary" />
          </div>
          <h1 className="text-2xl font-700 text-white">Caisse verrouillée</h1>
          <p className="text-slate-400 text-sm mt-1">Entrez votre PIN pour démarrer votre session</p>
        </div>

        {/* PIN dots */}
        <div className="flex items-center justify-center gap-3 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-150 ${
                i < pin.length
                  ? 'bg-primary scale-110' :'bg-slate-600 border border-slate-500'
              }`}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 mb-4 animate-slide-up">
            <Icon name="ExclamationCircleIcon" size={16} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {/* Hidden input for keyboard support */}
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, '').slice(0, 6);
            setPin(val);
            setError('');
          }}
          onKeyDown={handleKeyDown}
          className="sr-only"
          aria-label="PIN caisse"
        />

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {DIGITS.map((d, i) => {
            if (d === '') return <div key={i} />;
            if (d === '⌫') {
              return (
                <button
                  key={i}
                  onClick={handleDelete}
                  className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all flex items-center justify-center text-slate-300 hover:text-white"
                >
                  <Icon name="BackspaceIcon" size={20} />
                </button>
              );
            }
            return (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 transition-all text-xl font-600 text-white"
              >
                {d}
              </button>
            );
          })}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleSubmit}
          disabled={pin.length < 4 || loading}
          className="w-full h-14 rounded-xl bg-primary text-primary-foreground text-base font-700 hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Vérification…
            </>
          ) : (
            <>
              <Icon name="ArrowRightCircleIcon" size={20} />
              Ouvrir la caisse
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-500 mt-4">
          Contactez un administrateur si vous avez oublié votre PIN
        </p>
      </div>
    </div>
  );
}
