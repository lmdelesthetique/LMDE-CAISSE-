'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useClientAuth } from '@/contexts/ClientAuthContext';

export default function ClientLoginPage() {
  const router = useRouter();
  const { signIn, clientUser, loading: authLoading } = useClientAuth();

  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Reset PIN flow
  const [showReset, setShowReset] = useState(false);
  const [resetPhone, setResetPhone] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const phoneRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && clientUser) {
      router.replace('/client-portal/dashboard');
    }
  }, [authLoading, clientUser, router]);

  useEffect(() => {
    if (step === 'phone') phoneRef.current?.focus();
    if (step === 'pin') setTimeout(() => pinInputRef.current?.focus(), 0);
  }, [step]);

  const handlePhoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setError('');
    setStep('pin');
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(val);
    if (error) setError('');
    if (val.length === 4) {
      handleSubmit(val);
    }
  };

  const handleSubmit = async (pinValue: string) => {
    if (pinValue.length !== 4) return;
    setError('');
    setSubmitting(true);
    try {
      await signIn(phone, pinValue);
      router.replace('/client-portal/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Une erreur est survenue.');
      setPin('');
      setTimeout(() => pinInputRef.current?.focus(), 0);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPhone.trim()) return;
    setResetSubmitting(true);
    try {
      const supabase = createClient();
      await supabase.from('pin_reset_requests').insert({ phone: resetPhone.trim() });
      setResetSent(true);
    } catch {
      // show generic message regardless
      setResetSent(true);
    } finally {
      setResetSubmitting(false);
    }
  };

  if (authLoading) return <FullscreenSpinner />;
  if (clientUser) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50/40 to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-rose-500 mb-4">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Portail Beauté</h1>
          <p className="text-sm text-gray-500 mt-1">Votre espace abonnement personnel</p>
        </div>

        {showReset ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <button
              onClick={() => { setShowReset(false); setResetSent(false); setResetPhone(''); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Retour
            </button>

            {resetSent ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-gray-900 mb-1">Demande envoyée</h2>
                <p className="text-sm text-gray-500">Contactez votre conseillère pour récupérer votre code PIN.</p>
              </div>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-1">Réinitialiser mon PIN</h2>
                  <p className="text-xs text-gray-400 mb-4">Entrez votre numéro de téléphone. Votre conseillère vous contactera.</p>
                  <input
                    type="tel"
                    value={resetPhone}
                    onChange={(e) => setResetPhone(e.target.value)}
                    placeholder="Votre numéro de téléphone"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={resetSubmitting || !resetPhone.trim()}
                  className="w-full py-2.5 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-40"
                >
                  {resetSubmitting ? 'Envoi…' : 'Envoyer la demande'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            {step === 'phone' ? (
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-1 text-center">Votre numéro de téléphone</h2>
                  <p className="text-xs text-gray-400 text-center mb-5">Entrez le numéro lié à votre abonnement</p>
                  <input
                    ref={phoneRef}
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); if (error) setError(''); }}
                    placeholder="Ex : 0692 00 00 00"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 text-center tracking-wide"
                    autoComplete="tel"
                  />
                </div>
                {error && <ErrorBanner message={error} />}
                <button
                  type="submit"
                  disabled={!phone.trim()}
                  className="w-full py-2.5 bg-rose-500 text-white rounded-xl text-sm font-semibold hover:bg-rose-600 transition-colors disabled:opacity-40"
                >
                  Continuer
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={() => { setStep('phone'); setPin(''); setError(''); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  {phone}
                </button>

                <h2 className="text-base font-semibold text-gray-900 mb-1 text-center">Code PIN</h2>
                <p className="text-xs text-gray-400 text-center mb-6">Saisissez votre code à 4 chiffres</p>

                <input
                  ref={pinInputRef}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pin}
                  onChange={handlePinChange}
                  disabled={submitting}
                  autoComplete="one-time-code"
                  className="sr-only"
                  aria-label="Code PIN à 4 chiffres"
                />

                {/* Visual PIN boxes */}
                <div
                  className="flex gap-3 justify-center mb-6 cursor-text"
                  onClick={() => pinInputRef.current?.focus()}
                  role="button"
                  tabIndex={-1}
                >
                  {Array.from({ length: 4 }).map((_, i) => {
                    const isActive = i === pin.length && !submitting;
                    const isFilled = !!pin[i];
                    return (
                      <div
                        key={i}
                        className={[
                          'w-14 h-16 rounded-xl border-2 flex items-center justify-center select-none transition-all',
                          isActive ? 'border-rose-400 shadow-sm shadow-rose-100' : isFilled ? 'border-rose-300' : 'border-gray-200',
                          isActive || isFilled ? 'bg-white' : 'bg-gray-50',
                          submitting ? 'opacity-50' : '',
                        ].join(' ')}
                      >
                        {isFilled && <span className="text-gray-800 text-2xl leading-none">•</span>}
                      </div>
                    );
                  })}
                </div>

                {error && <ErrorBanner message={error} />}

                {submitting && (
                  <div className="flex justify-center mt-2">
                    <svg className="w-5 h-5 animate-spin text-rose-500" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  </div>
                )}

                <button
                  onClick={() => setShowReset(true)}
                  className="w-full text-center text-xs text-gray-400 hover:text-rose-500 transition-colors mt-4"
                >
                  PIN oublié ?
                </button>
              </>
            )}
          </div>
        )}

        {/* PWA install instructions */}
        <details className="mt-5">
          <summary className="text-center text-xs text-gray-400 cursor-pointer select-none hover:text-rose-400 transition-colors">
            📲 Installer l&apos;application
          </summary>
          <div className="mt-3 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3 text-xs text-gray-600">
            <div>
              <p className="font-semibold text-gray-800 mb-1">iPhone (Safari)</p>
              <ol className="space-y-0.5 list-decimal list-inside text-gray-500">
                <li>Ouvrir ce lien dans <strong>Safari</strong></li>
                <li>Appuyer sur <strong>Partager</strong> <span className="font-mono text-gray-400">⎙</span></li>
                <li>Choisir <strong>&ldquo;Sur l&apos;écran d&apos;accueil&rdquo;</strong></li>
              </ol>
            </div>
            <div className="border-t border-gray-100 pt-3">
              <p className="font-semibold text-gray-800 mb-1">Android (Chrome)</p>
              <ol className="space-y-0.5 list-decimal list-inside text-gray-500">
                <li>Appuyer sur le menu <strong>⋮</strong></li>
                <li>Choisir <strong>&ldquo;Ajouter à l&apos;écran d&apos;accueil&rdquo;</strong></li>
              </ol>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
      <span>⚠</span>
      <span>{message}</span>
    </div>
  );
}

function FullscreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-rose-50">
      <svg className="w-7 h-7 animate-spin text-rose-500" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    </div>
  );
}
