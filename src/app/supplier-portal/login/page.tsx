'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';

type Mode = 'login' | 'forgot';

export default function SupplierLoginPage() {
  const router = useRouter();
  const { signIn, resetPassword, supplierUser, loading: authLoading } = useSupplierAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!authLoading && supplierUser) {
      router.replace('/supplier-portal/dashboard');
    }
  }, [authLoading, supplierUser, router]);

  if (authLoading) return <FullscreenSpinner />;
  if (supplierUser) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace('/supplier-portal/dashboard');
    } catch (err: any) {
      setError(err.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);
    try {
      await resetPassword(email);
      setSuccess('Email envoyé ! Vérifiez votre boîte de réception.');
    } catch (err: any) {
      setError(err.message ?? 'Une erreur est survenue.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50/40 to-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
          {mode === 'login' ? (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-6">Connexion</h2>
              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Adresse email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="fournisseur@exemple.com"
                    autoComplete="email"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Mot de passe</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); }}
                    className="text-xs text-emerald-700 hover:underline font-medium"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>
                {error && (
                  <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                    <span>⚠</span><span>{error}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {submitting && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {submitting ? 'Connexion…' : 'Se connecter'}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccess(''); }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-5"
              >
                ← Retour
              </button>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Mot de passe oublié</h2>
              <p className="text-xs text-gray-500 mb-6">Saisissez votre email pour recevoir un lien.</p>
              <form onSubmit={handleForgot} className="space-y-4" noValidate>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Adresse email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="fournisseur@exemple.com"
                    autoComplete="email"
                    required
                    className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors"
                  />
                </div>
                {error && (
                  <div className="flex gap-2 items-start p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                    <span>⚠</span><span>{error}</span>
                  </div>
                )}
                {success && (
                  <div className="flex gap-2 items-start p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-xs text-emerald-700">
                    <span>✓</span><span>{success}</span>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-medium transition-colors"
                >
                  {submitting ? 'Envoi…' : 'Envoyer le lien'}
                </button>
              </form>
            </>
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
