'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { deliveryService } from '@/lib/services/deliveryService';

const DRIVER_SESSION_KEY = 'beautypos_driver_session';

export default function LivreurLoginPage() {
  const router = useRouter();
  const phoneRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showForgot, setShowForgot] = useState(false);

  useEffect(() => {
    // Redirect if already logged in
    try {
      const session = localStorage.getItem(DRIVER_SESSION_KEY);
      if (session) {
        const parsed = JSON.parse(session);
        if (parsed?.employeeId) { router.replace('/livreur/dashboard'); return; }
      }
    } catch { /* ignore */ }
    phoneRef.current?.focus();
  }, [router]);

  const handlePhoneNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (phone.trim().length < 8) { setError('Numéro de téléphone invalide.'); return; }
    setError('');
    setStep('pin');
    setTimeout(() => pinRef.current?.focus(), 50);
  };

  const handlePinChange = async (val: string) => {
    setPin(val);
    if (error) setError('');
    if (val.length === 4) {
      setSubmitting(true);
      try {
        const result = await deliveryService.driverLogin(phone.trim(), val);
        if (!result) {
          setError('Téléphone ou PIN incorrect.');
          setPin('');
          setTimeout(() => pinRef.current?.focus(), 50);
        } else {
          localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify({
            employeeId: result.id,
            name: result.name,
            role: 'driver',
          }));
          router.replace('/livreur/dashboard');
        }
      } catch {
        setError('Erreur de connexion. Réessayez.');
        setPin('');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50/40 to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500 mb-4 shadow-lg">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Portail Livreur</h1>
          <p className="text-sm text-gray-500 mt-1">BeautyPOS — Espace livraison</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {step === 'phone' ? (
            <form onSubmit={handlePhoneNext} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Numéro de téléphone
                </label>
                <input
                  ref={phoneRef}
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError(''); }}
                  placeholder="+596 696 00 00 00"
                  className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-orange-400 focus:outline-none text-base transition-colors"
                  autoComplete="tel"
                />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
              <button
                type="submit"
                className="w-full py-3.5 bg-orange-500 text-white font-bold rounded-xl text-base hover:bg-orange-600 active:scale-95 transition-all"
              >
                Continuer →
              </button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => { setStep('phone'); setPin(''); setError(''); }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  ← Retour
                </button>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Code PIN à 4 chiffres</p>
                  <p className="text-xs text-gray-400">{phone}</p>
                </div>
              </div>

              {/* PIN boxes */}
              <input
                ref={pinRef}
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={(e) => handlePinChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
                disabled={submitting}
                className="sr-only"
                autoComplete="one-time-code"
              />
              <div
                className="flex gap-3 justify-center cursor-text"
                onClick={() => pinRef.current?.focus()}
              >
                {Array.from({ length: 4 }).map((_, i) => {
                  const active = i === pin.length && !submitting;
                  const filled = !!pin[i];
                  return (
                    <div
                      key={i}
                      className={[
                        'w-14 h-16 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all select-none',
                        active ? 'border-orange-400 shadow-md shadow-orange-100' : filled ? 'border-orange-300 bg-orange-50' : 'border-gray-200 bg-gray-50',
                      ].join(' ')}
                    >
                      {filled && <span className="text-gray-800 text-3xl leading-none">•</span>}
                    </div>
                  );
                })}
              </div>

              {submitting && (
                <div className="flex justify-center py-2">
                  <svg className="w-6 h-6 animate-spin text-orange-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg text-center">{error}</p>}

              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                PIN oublié ?
              </button>
            </div>
          )}
        </div>

        {showForgot && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-center">
            <p className="font-semibold mb-1">PIN oublié ?</p>
            <p>Contactez votre responsable pour réinitialiser votre code PIN.</p>
            <button onClick={() => setShowForgot(false)} className="mt-2 text-xs text-amber-600 underline">Fermer</button>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-5">
          Accès réservé aux livreurs autorisés BeautyPOS
        </p>
      </div>
    </div>
  );
}
