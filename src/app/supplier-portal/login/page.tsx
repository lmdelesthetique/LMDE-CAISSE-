'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';

export default function SupplierLoginPage() {
  const router = useRouter();
  const { signIn, supplierUser, loading: authLoading } = useSupplierAuth();

  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && supplierUser) {
      router.replace('/supplier-portal/dashboard');
    }
  }, [authLoading, supplierUser, router]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (pinValue: string) => {
    if (pinValue.length !== 6) return;
    setError('');
    setSubmitting(true);
    try {
      await signIn(pinValue);
      router.replace('/supplier-portal/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Une erreur est survenue.');
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(val);
    if (error) setError('');
    if (val.length === 6) {
      handleSubmit(val);
    }
  };

  if (authLoading) return <FullscreenSpinner />;
  if (supplierUser) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50/40 to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-600 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Portail Fournisseur</h1>
          <p className="text-sm text-gray-500 mt-1">BeautyPOS — Espace partenaire</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-base font-semibold text-gray-900 mb-2 text-center">Entrez votre code PIN</h2>
          <p className="text-xs text-gray-400 text-center mb-6">
            Saisissez le code à 6 chiffres fourni par votre administrateur
          </p>

          {/* Hidden input captures keyboard on mobile/desktop */}
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={handleChange}
            disabled={submitting}
            autoComplete="one-time-code"
            className="sr-only"
            aria-label="Code PIN à 6 chiffres"
          />

          {/* Visual PIN boxes */}
          <div
            className="flex gap-2 justify-center mb-6 cursor-text"
            onClick={() => inputRef.current?.focus()}
            role="button"
            tabIndex={-1}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const isActive = i === pin.length && !submitting;
              const isFilled = !!pin[i];
              return (
                <div
                  key={i}
                  className={[
                    'w-11 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-bold select-none transition-all',
                    isActive ? 'border-emerald-500 shadow-sm' : isFilled ? 'border-emerald-300' : 'border-gray-200',
                    isActive || isFilled ? 'bg-white' : 'bg-gray-50',
                    submitting ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  {isFilled && <span className="text-gray-800 text-2xl leading-none">•</span>}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 mb-4">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          {submitting && (
            <div className="flex justify-center mt-2">
              <svg className="w-5 h-5 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          )}

          {!submitting && !error && pin.length === 0 && (
            <p className="text-center text-xs text-gray-300 mt-2">Cliquez ici puis saisissez votre code</p>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Accès réservé aux fournisseurs partenaires BeautyPOS
        </p>
      </div>
    </div>
  );
}

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-50">
      <svg className="w-7 h-7 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}
