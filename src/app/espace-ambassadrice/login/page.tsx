'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['⌫', '0', '✓'],
];

export default function EspaceAmbassadriceLoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKey = (k: string) => {
    if (loading) return;
    setError('');
    if (k === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (k === '✓') {
      handleSubmit();
    } else if (pin.length < 6) {
      const next = pin + k;
      setPin(next);
      if (next.length === 6) handleSubmitPin(next);
    }
  };

  const handleSubmitPin = async (code: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ambassadrice-portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: code }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'Code incorrect');
        setPin('');
        setLoading(false);
        return;
      }
      // Store session in localStorage
      localStorage.setItem('ambassadrice_session', JSON.stringify({
        lienUnique: data.lienUnique,
        prenom: data.prenom,
        nom: data.nom,
        grade: data.grade,
      }));
      router.push(`/ambassadrice/${data.lienUnique}`);
    } catch {
      setError('Erreur de connexion. Réessayez.');
      setPin('');
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (pin.length === 6) handleSubmitPin(pin);
  };

  const dots = Array.from({ length: 6 }).map((_, i) => (
    <div
      key={i}
      className={`w-4 h-4 rounded-full transition-all duration-150 ${
        i < pin.length
          ? 'bg-pink-500 scale-110'
          : 'bg-gray-200'
      }`}
    />
  ));

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white flex flex-col items-center justify-center px-4">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-5xl mb-3">💅</div>
        <h1 className="text-2xl font-bold text-gray-900">Espace Ambassadrice</h1>
        <p className="text-sm text-gray-500 mt-1">Le Monde de l'Esthétique</p>
      </div>

      {/* PIN display */}
      <div className="bg-white rounded-3xl shadow-md p-8 w-full max-w-xs">
        <p className="text-center text-sm font-semibold text-gray-600 mb-6">
          Entrez votre code secret
        </p>

        <div className="flex justify-center gap-3 mb-8">
          {dots}
        </div>

        {error && (
          <p className="text-center text-sm text-red-500 mb-4 font-medium">{error}</p>
        )}

        {/* Numeric keypad */}
        <div className="space-y-3">
          {KEYS.map((row, ri) => (
            <div key={ri} className="flex gap-3 justify-center">
              {row.map((k) => (
                <button
                  key={k}
                  onClick={() => handleKey(k)}
                  disabled={loading}
                  className={`
                    w-20 h-14 rounded-2xl text-xl font-bold transition-all duration-100 active:scale-95
                    ${k === '✓'
                      ? 'bg-pink-500 text-white shadow-md shadow-pink-200 hover:bg-pink-600'
                      : k === '⌫'
                      ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      : 'bg-gray-50 text-gray-800 border border-gray-100 hover:bg-pink-50 hover:border-pink-200 shadow-sm'
                    }
                    ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  {loading && k === '✓' ? (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : k}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400 mt-8 text-center">
        Votre code vous a été communiqué par Le Monde de l'Esthétique
      </p>
    </div>
  );
}
