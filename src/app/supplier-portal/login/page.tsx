'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SupplierPortalLogin() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/supplier-portal/${token}`);
      if (!res.ok) {
        setError('Code d\'accès invalide. Vérifiez le lien reçu par WhatsApp.');
        setLoading(false);
        return;
      }
      router.push(`/supplier-portal/${token}`);
    } catch {
      setError('Erreur de connexion. Réessayez.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      background: 'linear-gradient(135deg, #075e54 0%, #128c7e 50%, #25d366 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      padding: 16,
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: '50%',
            background: 'rgba(255,255,255,0.2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 36, marginBottom: 16,
          }}>
            🏭
          </div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>
            Portail Fournisseur
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 14, marginTop: 4, margin: '4px 0 0' }}>
            Le Monde de l'Esthétique
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#fff', borderRadius: 20,
          padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111', margin: '0 0 6px' }}>
            Accéder à votre espace
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px', lineHeight: 1.5 }}>
            Saisissez le code d'accès reçu par WhatsApp, ou copiez-collez votre lien unique.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
              Code d'accès unique
            </label>
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value); setError(''); }}
              placeholder="Collez votre code ici…"
              disabled={loading}
              style={{
                width: '100%', padding: '12px 14px', fontSize: 14,
                border: error ? '2px solid #ef4444' : '2px solid #e5e7eb',
                borderRadius: 12, outline: 'none', boxSizing: 'border-box',
                fontFamily: 'monospace', letterSpacing: 1,
                background: loading ? '#f9fafb' : '#fff',
              }}
            />

            {error && (
              <p style={{ fontSize: 12, color: '#dc2626', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                ⚠️ {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!code.trim() || loading}
              style={{
                marginTop: 16, width: '100%', padding: '14px 0',
                background: (!code.trim() || loading) ? '#d1d5db' : '#075e54',
                color: '#fff', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: (!code.trim() || loading) ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'background 0.2s',
              }}
            >
              {loading ? (
                <>
                  <span style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                  Vérification…
                </>
              ) : '🔓 Accéder à mon espace'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20, lineHeight: 1.5 }}>
            Vous n'avez pas de code ? Contactez{' '}
            <a href="https://wa.me/596696000000" style={{ color: '#075e54', textDecoration: 'none', fontWeight: 600 }}>
              Le Monde de l'Esthétique
            </a>
          </p>
        </div>

        <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 20 }}>
          Espace réservé aux fournisseurs partenaires · Accès sécurisé
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
