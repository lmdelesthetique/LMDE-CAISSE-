'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

type CampagneStatut = 'en_preparation' | 'active' | 'terminee' | 'annulee';

interface Campagne {
  id: string;
  nom: string;
  description: string | null;
  date_debut: string | null;
  date_fin: string | null;
  objectif: string | null;
  statut: CampagneStatut;
  assignment_count: number;
  total_cost: number;
  created_at: string;
}

const STATUT_LABEL: Record<CampagneStatut, string> = {
  en_preparation: 'En préparation',
  active: 'Active',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

const STATUT_COLOR: Record<CampagneStatut, string> = {
  en_preparation: 'bg-amber-50 text-amber-700',
  active: 'bg-emerald-50 text-emerald-700',
  terminee: 'bg-gray-100 text-gray-500',
  annulee: 'bg-red-50 text-red-600',
};

export default function CampagnesPage() {
  const [campagnes, setCampagnes] = useState<Campagne[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/campagnes-ambassadrices');
      const data = await res.json();
      setCampagnes(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const handleUpdateStatut = async (id: string, statut: CampagneStatut) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      if (!res.ok) { showToast(false, 'Erreur mise à jour'); return; }
      showToast(true, 'Statut mis à jour');
      load();
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setUpdatingId(null);
    }
  };

  const actives = campagnes.filter((c) => c.statut === 'active').length;
  const enPrep = campagnes.filter((c) => c.statut === 'en_preparation').length;

  return (
    <AppLayout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Campagnes Ambassadrices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {actives} active{actives > 1 ? 's' : ''} · {enPrep} en préparation
            </p>
          </div>
          <Link
            href="/campagnes-ambassadrices/nouvelle"
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Nouvelle campagne
          </Link>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : campagnes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">Aucune campagne</p>
            <Link href="/campagnes-ambassadrices/nouvelle" className="mt-3 text-primary text-sm font-medium underline">
              Créer la première campagne
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campagnes.map((c) => (
              <div key={c.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-foreground">{c.nom}</h2>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUT_COLOR[c.statut]}`}>
                      {STATUT_LABEL[c.statut]}
                    </span>
                  </div>
                  {c.description && (
                    <p className="text-sm text-muted-foreground mt-0.5 truncate">{c.description}</p>
                  )}
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                    {c.date_debut && (
                      <span>
                        Du {new Date(c.date_debut).toLocaleDateString('fr-FR')}
                        {c.date_fin ? ` au ${new Date(c.date_fin).toLocaleDateString('fr-FR')}` : ''}
                      </span>
                    )}
                    <span>👤 {c.assignment_count} ambassadrice{c.assignment_count > 1 ? 's' : ''}</span>
                    <span>💰 {c.total_cost.toFixed(0)} € coût total</span>
                  </div>
                </div>

                {/* Status updater */}
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={c.statut}
                    onChange={(e) => handleUpdateStatut(c.id, e.target.value as CampagneStatut)}
                    disabled={updatingId === c.id}
                    className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="en_preparation">En préparation</option>
                    <option value="active">Active</option>
                    <option value="terminee">Terminée</option>
                    <option value="annulee">Annulée</option>
                  </select>
                  <Link
                    href={`/campagnes-ambassadrices/${c.id}`}
                    className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity"
                  >
                    Détail
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
