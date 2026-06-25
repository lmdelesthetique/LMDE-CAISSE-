'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

type Grade = 'debutante' | 'confirmee' | 'elite';

const GRADE_LABEL: Record<Grade, string> = {
  debutante: '⭐ Débutante',
  confirmee: '⭐⭐ Confirmée',
  elite: '⭐⭐⭐ Elite',
};

const GRADE_COLOR: Record<Grade, string> = {
  debutante: 'bg-amber-50 text-amber-700',
  confirmee: 'bg-blue-50 text-blue-700',
  elite: 'bg-purple-50 text-purple-700',
};

export default function AmbassadriceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copyDone, setCopyDone] = useState(false);
  const [generatingPin, setGeneratingPin] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinCopied, setPinCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ambassadrices/${id}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const generatePin = async () => {
    setGeneratingPin(true);
    try {
      const res = await fetch(`/api/ambassadrices/${id}/generate-pin`, { method: 'POST' });
      const json = await res.json();
      if (json.pin) {
        setData((prev: any) => ({ ...prev, pin_code: json.pin }));
        setPinVisible(true);
      }
    } finally {
      setGeneratingPin(false);
    }
  };

  const copyPin = () => {
    if (!data?.pin_code) return;
    navigator.clipboard.writeText(data.pin_code).then(() => {
      setPinCopied(true);
      setTimeout(() => setPinCopied(false), 2000);
    });
  };

  const copyPortalLink = () => {
    if (!data) return;
    const url = `${window.location.origin}/ambassadrice/${data.lien_unique}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 2000);
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center items-center py-32">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!data) {
    return (
      <AppLayout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Ambassadrice introuvable.</p>
          <Link href="/ambassadrices" className="text-primary text-sm underline mt-2 block">
            Retour à la liste
          </Link>
        </div>
      </AppLayout>
    );
  }

  const stats = data.stats ?? {};
  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/ambassadrice/${data.lien_unique}`;

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Back */}
        <Link href="/ambassadrices" className="text-sm text-primary hover:underline">
          ← Retour aux ambassadrices
        </Link>

        {/* Profile header */}
        <div className="bg-card border border-border rounded-2xl p-6 flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="flex items-start gap-3 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {data.prenom} {data.nom}
                </h1>
                {data.email && <p className="text-sm text-muted-foreground">{data.email}</p>}
                {data.telephone && <p className="text-sm text-muted-foreground">{data.telephone}</p>}
              </div>
              <div className="flex gap-2 flex-wrap mt-1">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${GRADE_COLOR[data.grade as Grade]}`}>
                  {GRADE_LABEL[data.grade as Grade]}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${data.statut === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {data.statut === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Social */}
            <div className="flex gap-4 mt-3 text-sm">
              {data.instagram_url && (
                <a href={data.instagram_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-pink-600 transition-colors">
                  📷 {data.instagram_followers ? `${data.instagram_followers.toLocaleString('fr-FR')}` : '—'}
                </a>
              )}
              {data.tiktok_url && (
                <a href={data.tiktok_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-black transition-colors">
                  🎵 {data.tiktok_followers ? `${data.tiktok_followers.toLocaleString('fr-FR')}` : '—'}
                </a>
              )}
            </div>

            {data.notes && (
              <p className="text-sm text-muted-foreground mt-3 italic">{data.notes}</p>
            )}
          </div>

          {/* Portal link */}
          <div className="sm:w-64 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lien portail</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={portalUrl}
                className="flex-1 px-3 py-2 text-xs border-2 border-gray-200 rounded-xl bg-gray-50 font-mono text-gray-600 truncate"
              />
              <button
                onClick={copyPortalLink}
                className="px-3 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:opacity-90 transition-opacity shrink-0"
              >
                {copyDone ? '✓' : '🔗'}
              </button>
            </div>
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center py-2 border border-primary text-primary text-xs font-semibold rounded-xl hover:bg-primary/5 transition-colors"
            >
              Ouvrir le portail
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{stats.campaign_count ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Campagnes</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{stats.content_count ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Contenus</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 text-center">
            <p className="text-2xl font-bold text-foreground tabular-nums">{(stats.total_cost ?? 0).toFixed(0)} €</p>
            <p className="text-xs text-muted-foreground mt-0.5">Coût total</p>
          </div>
        </div>

        {/* Date info */}
        <div className="bg-card border border-border rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">
            Membre depuis le {new Date(data.date_entree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
          {data.google_drive_url && (
            <a href={data.google_drive_url} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
              📁 Ouvrir le Drive
            </a>
          )}
        </div>

        {/* PIN Code */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Code PIN ambassadrice</p>
              <p className="text-xs text-muted-foreground mt-0.5">Accès à l'espace personnel via clavier numérique</p>
            </div>
            <button
              onClick={generatePin}
              disabled={generatingPin}
              className="px-3 py-1.5 bg-pink-500 text-white text-xs font-bold rounded-xl hover:bg-pink-600 transition-colors disabled:opacity-50"
            >
              {generatingPin ? '...' : data.pin_code ? '🔄 Regénérer' : '🔑 Générer'}
            </button>
          </div>

          {data.pin_code ? (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <span className="text-2xl font-mono font-bold tracking-[0.3em] text-gray-800">
                  {pinVisible ? data.pin_code : '••••••'}
                </span>
                <button
                  onClick={() => setPinVisible(v => !v)}
                  className="text-gray-400 hover:text-gray-600 text-lg ml-auto"
                >
                  {pinVisible ? '🙈' : '👁️'}
                </button>
              </div>
              <button
                onClick={copyPin}
                className="px-3 py-3 bg-white border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                {pinCopied ? '✓' : '📋'}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">Aucun code généré — cliquez sur "Générer"</p>
          )}

          {data.pin_code && (
            <div className="mt-3 p-3 bg-pink-50 rounded-xl">
              <p className="text-xs text-pink-700 font-medium">
                Lien de connexion à partager avec l'ambassadrice :
              </p>
              <p className="text-xs text-pink-600 font-mono mt-1 break-all">
                {typeof window !== 'undefined' ? window.location.origin : ''}/espace-ambassadrice/login
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Link
            href={`/ambassadrices?edit=${id}`}
            className="flex-1 py-3 text-center border-2 border-primary text-primary font-bold rounded-xl text-sm hover:bg-primary/5 transition-colors"
          >
            ✏️ Modifier la fiche
          </Link>
          <Link
            href="/campagnes-ambassadrices"
            className="flex-1 py-3 text-center border-2 border-border text-muted-foreground font-bold rounded-xl text-sm hover:bg-muted transition-colors"
          >
            📢 Voir les campagnes
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
