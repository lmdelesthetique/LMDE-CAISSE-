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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Redirect already-logged-in suppliers
  useEffect(() => {
    if (!authLoading && supplierUser) {
      router.replace('/supplier-portal/dashboard');
    }
  }, [authLoading, supplierUser, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/30 to-teal-50/20 flex items-center justify-center">
        <Spinner className="w-7 h-7 text-emerald-700" />
      </div>
    );
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
      router.replace('/supplier-portal/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccessMsg('Un email de réinitialisation vous a été envoyé. Vérifiez votre boîte de réception.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 via-emerald-50/30 to-teal-50/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-100 mb-4">
            <TruckIcon className="w-7 h-7 text-emerald-700" />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Portail Fournisseur</h1>
          <p className="text-sm text-gray-500 mt-1">BeautyPOS — Espace partenaire</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {mode === 'login' ? (
            <>
              <h2 className="text-base font-semibold text-gray-900 mb-6">Connexion</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <Field
                  label="Adresse email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="fournisseur@exemple.com"
                />
                <Field
                  label="Mot de passe"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                />

                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setError(''); }}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                  >
                    Mot de passe oublié ?
                  </button>
                </div>

                {error && <Alert message={error} />}

                <SubmitButton loading={loading} label="Se connecter" />
              </form>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 mb-5"
              >
                <ChevronLeftIcon className="w-3.5 h-3.5" />
                Retour à la connexion
              </button>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Réinitialiser le mot de passe</h2>
              <p className="text-xs text-gray-500 mb-5">
                Saisissez votre email, nous vous enverrons un lien de réinitialisation.
              </p>
              <form onSubmit={handleForgot} className="space-y-4">
                <Field
                  label="Adresse email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="fournisseur@exemple.com"
                />
                {error && <Alert message={error} />}
                {successMsg && <Success message={successMsg} />}
                <SubmitButton loading={loading} label="Envoyer le lien" />
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Accès réservé aux fournisseurs partenaires BeautyPOS
        </p>
      </div>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function Field({
  label, type, value, onChange, placeholder,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500 transition-colors"
      />
    </div>
  );
}

function Alert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-50 border border-red-100">
      <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
      <p className="text-xs text-red-600">{message}</p>
    </div>
  );
}

function Success({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-50 border border-emerald-100">
      <svg className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p className="text-xs text-emerald-700">{message}</p>
    </div>
  );
}

function SubmitButton({ loading, label }: { loading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full py-2.5 px-4 rounded-lg bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors mt-1"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <Spinner className="w-4 h-4" />
          Chargement…
        </span>
      ) : label}
    </button>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
    </svg>
  );
}
