'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';
import AppLogo from '@/components/ui/AppLogo';

type PageState = 'verifying' | 'invalid' | 'form' | 'success';

interface PasswordStrength {
  score: number;
  label: string;
  color: string;
}

function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { score, label: 'Très faible', color: 'bg-red-500' };
  if (score === 2) return { score, label: 'Faible', color: 'bg-orange-500' };
  if (score === 3) return { score, label: 'Moyen', color: 'bg-yellow-500' };
  if (score === 4) return { score, label: 'Fort', color: 'bg-blue-500' };
  return { score, label: 'Très fort', color: 'bg-green-500' };
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [pageState, setPageState] = useState<PageState>('verifying');
  const [tokenError, setTokenError] = useState('');
  const [userEmail, setUserEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');

  const supabase = createClient();
  const strength = getPasswordStrength(password);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setTokenError('Lien invalide ou manquant. Veuillez faire une nouvelle demande.');
      setPageState('invalid');
      return;
    }

    supabase.functions
      .invoke('reset-password', { body: { action: 'verify', token } })
      .then(({ data, error }) => {
        if (error || !data?.valid) {
          setTokenError(data?.error ?? 'Lien invalide ou expiré.');
          setPageState('invalid');
        } else {
          setUserEmail(data.email ?? '');
          setPageState('form');
        }
      })
      .catch(() => {
        setTokenError('Erreur de vérification. Veuillez réessayer.');
        setPageState('invalid');
      });
  }, [token]);

  const validateForm = (): string | null => {
    if (password.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
    if (strength.score < 2) return 'Le mot de passe est trop faible. Ajoutez des chiffres ou des majuscules.';
    if (password !== confirmPassword) return 'Les mots de passe ne correspondent pas.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-password', {
        body: { action: 'update', token, newPassword: password },
      });

      if (error || data?.error) {
        setFormError(data?.error ?? 'Une erreur est survenue. Veuillez réessayer.');
        setLoading(false);
        return;
      }

      setPageState('success');
    } catch {
      setFormError('Une erreur est survenue. Veuillez réessayer.');
      setLoading(false);
    }
  };

  // ── Verifying state ──
  if (pageState === 'verifying') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Vérification du lien…</p>
        </div>
      </div>
    );
  }

  // ── Invalid token state ──
  if (pageState === 'invalid') {
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
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Icon name="ExclamationCircleIcon" className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-lg font-600 text-foreground mb-2">Lien invalide</h2>
            <p className="text-sm text-muted-foreground mb-6">{tokenError}</p>
            <Link
              href="/forgot-password"
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 transition-colors"
            >
              <Icon name="ArrowPathIcon" className="w-4 h-4" />
              Nouvelle demande
            </Link>
            <div className="mt-4">
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Retour à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (pageState === 'success') {
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
              <Icon name="CheckCircleIcon" className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-600 text-foreground mb-2">Mot de passe mis à jour !</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="inline-flex items-center gap-2 py-2.5 px-5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 transition-colors"
            >
              <Icon name="ArrowRightOnRectangleIcon" className="w-4 h-4" />
              Se connecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Password form state ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <AppLogo className="h-12 w-auto" />
          </div>
          <h1 className="text-2xl font-700 text-foreground">BeautyPOS</h1>
          <p className="text-sm text-muted-foreground mt-1">Choisissez un nouveau mot de passe</p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
              <Icon name="LockClosedIcon" className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">Nouveau mot de passe</h2>
              {userEmail && (
                <p className="text-xs text-muted-foreground truncate max-w-[220px]">{userEmail}</p>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* New password */}
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon name="LockClosedIcon" className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name={showPassword ? 'EyeSlashIcon' : 'EyeIcon'} className="w-4 h-4" />
                </button>
              </div>

              {/* Password strength indicator */}
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          i <= strength.score ? strength.color : 'bg-border'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Force : <span className="font-500 text-foreground">{strength.label}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm font-500 text-foreground mb-1.5">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Icon name="LockClosedIcon" className="w-4 h-4 text-muted-foreground" />
                </div>
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((p) => !p)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Icon name={showConfirm ? 'EyeSlashIcon' : 'EyeIcon'} className="w-4 h-4" />
                </button>
              </div>

              {/* Match indicator */}
              {confirmPassword.length > 0 && (
                <p className={`text-xs mt-1 ${password === confirmPassword ? 'text-green-600' : 'text-red-500'}`}>
                  {password === confirmPassword ? '✓ Les mots de passe correspondent' : '✗ Les mots de passe ne correspondent pas'}
                </p>
              )}
            </div>

            {/* Requirements hint */}
            <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-500 text-foreground mb-1">Exigences :</p>
              <p className={password.length >= 8 ? 'text-green-600' : ''}>
                {password.length >= 8 ? '✓' : '○'} Au moins 8 caractères
              </p>
              <p className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>
                {/[A-Z]/.test(password) ? '✓' : '○'} Une lettre majuscule
              </p>
              <p className={/[0-9]/.test(password) ? 'text-green-600' : ''}>
                {/[0-9]/.test(password) ? '✓' : '○'} Un chiffre
              </p>
            </div>

            {/* Error */}
            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <Icon name="ExclamationCircleIcon" className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-600">{formError}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  Mise à jour…
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" className="w-4 h-4" />
                  Enregistrer le nouveau mot de passe
                </>
              )}
            </button>
          </form>
        </div>

        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Retour à la connexion
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
