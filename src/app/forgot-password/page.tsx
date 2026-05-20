'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: fnError } = await supabase.functions.invoke('reset-password', {
        body: { action: 'request', email: email.trim().toLowerCase() },
      });

      if (fnError) {
        setError('Une erreur est survenue. Veuillez réessayer.');
        setLoading(false);
        return;
      }

      // Always show success to prevent email enumeration
      setSubmitted(true);
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <AppLogo className="h-12 w-auto" />
            </div>
            <h1 className="text-2xl font-700 text-foreground">BeautyPOS</h1>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="EnvelopeIcon" className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-600 text-foreground mb-2">Email envoyé !</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Si un compte existe pour <strong className="text-foreground">{email}</strong>, vous recevrez un email avec un lien de réinitialisation dans quelques minutes.
            </p>
            <p className="text-xs text-muted-foreground mb-6">
              Vérifiez également votre dossier spam si vous ne voyez pas l'email.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-primary font-500 hover:underline"
            >
              <Icon name="ArrowLeftIcon" className="w-4 h-4" />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AppLogo className="h-12 w-auto" />
          </div>
          <h1 className="text-2xl font-700 text-foreground">BeautyPOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Réinitialisation du mot de passe</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Icon name="KeyIcon" className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">Mot de passe oublié ?</h2>
              <p className="text-xs text-muted-foreground">Entrez votre email pour recevoir un lien</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon name="EnvelopeIcon" className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@votreboutique.com"
                  required
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <Icon name="ExclamationCircleIcon" className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Envoi en cours…
                </>
              ) : (
                <>
                  <Icon name="PaperAirplaneIcon" className="w-4 h-4" />
                  Envoyer le lien de réinitialisation
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="ArrowLeftIcon" className="w-3.5 h-3.5" />
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ForgotPasswordForm />
    </Suspense>
  );
}
