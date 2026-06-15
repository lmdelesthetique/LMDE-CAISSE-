'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';

type Grade = 'debutante' | 'confirmee' | 'elite';
type Statut = 'active' | 'inactive';

interface Ambassadrice {
  id: string;
  prenom: string;
  nom: string;
  email: string | null;
  telephone: string | null;
  instagram_url: string | null;
  instagram_followers: number;
  tiktok_url: string | null;
  tiktok_followers: number;
  grade: Grade;
  statut: Statut;
  notes: string | null;
  lien_unique: string;
  google_drive_url: string | null;
  date_entree: string;
  created_at: string;
}

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

const EMPTY_FORM = {
  prenom: '',
  nom: '',
  email: '',
  telephone: '',
  instagram_url: '',
  instagram_followers: 0,
  tiktok_url: '',
  tiktok_followers: 0,
  grade: 'debutante' as Grade,
  statut: 'active' as Statut,
  notes: '',
  google_drive_url: '',
};

export default function AmbassadricesPage() {
  const [ambassadrices, setAmbassadrices] = useState<Ambassadrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Ambassadrice | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ambassadrices');
      const data = await res.json();
      setAmbassadrices(Array.isArray(data) ? data : []);
    } catch {
      setAmbassadrices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (a: Ambassadrice) => {
    setEditTarget(a);
    setForm({
      prenom: a.prenom,
      nom: a.nom,
      email: a.email ?? '',
      telephone: a.telephone ?? '',
      instagram_url: a.instagram_url ?? '',
      instagram_followers: a.instagram_followers ?? 0,
      tiktok_url: a.tiktok_url ?? '',
      tiktok_followers: a.tiktok_followers ?? 0,
      grade: a.grade,
      statut: a.statut,
      notes: a.notes ?? '',
      google_drive_url: a.google_drive_url ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.prenom.trim() || !form.nom.trim()) {
      showToast(false, 'Prénom et nom requis');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        instagram_followers: Number(form.instagram_followers) || 0,
        tiktok_followers: Number(form.tiktok_followers) || 0,
      };
      const url = editTarget ? `/api/ambassadrices/${editTarget.id}` : '/api/ambassadrices';
      const method = editTarget ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showToast(false, data.error ?? 'Erreur'); return; }
      showToast(true, editTarget ? 'Ambassadrice modifiée' : 'Ambassadrice créée');
      setShowModal(false);
      load();
    } catch (e: any) {
      showToast(false, e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyLink = (a: Ambassadrice) => {
    const url = `${window.location.origin}/ambassadrice/${a.lien_unique}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyToast(url);
      setTimeout(() => setCopyToast(null), 2500);
    });
  };

  const actives = ambassadrices.filter((a) => a.statut === 'active');
  const elites = ambassadrices.filter((a) => a.grade === 'elite');
  const confirmees = ambassadrices.filter((a) => a.grade === 'confirmee');
  const debutantes = ambassadrices.filter((a) => a.grade === 'debutante');

  return (
    <AppLayout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}
      {copyToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-gray-900 text-white rounded-xl shadow-lg text-sm">
          Lien copié !
        </div>
      )}

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Ambassadrices</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gestion du programme ambassadrices</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            + Nouvelle ambassadrice
          </button>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Total" value={ambassadrices.length} color="bg-gray-50 text-gray-700" />
          <StatCard label="Actives" value={actives.length} color="bg-emerald-50 text-emerald-700" />
          <StatCard label="Elite" value={elites.length} color="bg-purple-50 text-purple-700" />
          <StatCard label="Confirmées" value={confirmees.length} color="bg-blue-50 text-blue-700" />
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : ambassadrices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">Aucune ambassadrice</p>
            <button onClick={openCreate} className="mt-3 text-primary text-sm font-medium underline">
              Ajouter la première
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {ambassadrices.map((a) => (
              <div key={a.id} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{a.prenom} {a.nom}</p>
                    {a.email && <p className="text-xs text-muted-foreground">{a.email}</p>}
                    {a.telephone && <p className="text-xs text-muted-foreground">{a.telephone}</p>}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${GRADE_COLOR[a.grade]}`}>
                      {GRADE_LABEL[a.grade]}
                    </span>
                    {a.statut === 'inactive' && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Inactive
                      </span>
                    )}
                  </div>
                </div>

                {/* Social */}
                <div className="flex gap-3 text-xs text-muted-foreground">
                  {a.instagram_url && (
                    <a href={a.instagram_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-pink-600 transition-colors">
                      📷 {a.instagram_followers ? `${a.instagram_followers.toLocaleString('fr-FR')} abonnés` : 'Instagram'}
                    </a>
                  )}
                  {a.tiktok_url && (
                    <a href={a.tiktok_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-black transition-colors">
                      🎵 {a.tiktok_followers ? `${a.tiktok_followers.toLocaleString('fr-FR')} abonnés` : 'TikTok'}
                    </a>
                  )}
                  {!a.instagram_url && !a.tiktok_url && (
                    <span className="italic">Pas de réseau renseigné</span>
                  )}
                </div>

                {/* Date */}
                <p className="text-xs text-muted-foreground">
                  Entrée : {new Date(a.date_entree).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap mt-auto">
                  <button
                    onClick={() => openEdit(a)}
                    className="flex-1 min-w-[80px] py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                  >
                    ✏️ Modifier
                  </button>
                  <button
                    onClick={() => handleCopyLink(a)}
                    className="flex-1 min-w-[80px] py-1.5 text-xs font-semibold border border-primary text-primary rounded-lg hover:bg-primary/5 transition-colors"
                  >
                    🔗 Copier lien
                  </button>
                  <a
                    href={`/ambassadrices/${a.id}`}
                    className="flex-1 min-w-[80px] py-1.5 text-xs font-semibold text-center border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    📋 Campagnes
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">
                {editTarget ? 'Modifier ambassadrice' : 'Nouvelle ambassadrice'}
              </h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 text-lg">×</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Prénom *" value={form.prenom} onChange={(v) => setForm({ ...form, prenom: v })} />
                <FormField label="Nom *" value={form.nom} onChange={(v) => setForm({ ...form, nom: v })} />
              </div>
              <FormField label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <FormField label="Téléphone" value={form.telephone} onChange={(v) => setForm({ ...form, telephone: v })} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Grade</label>
                  <select
                    value={form.grade}
                    onChange={(e) => setForm({ ...form, grade: e.target.value as Grade })}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none bg-white"
                  >
                    <option value="debutante">⭐ Débutante</option>
                    <option value="confirmee">⭐⭐ Confirmée</option>
                    <option value="elite">⭐⭐⭐ Elite</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Statut</label>
                  <select
                    value={form.statut}
                    onChange={(e) => setForm({ ...form, statut: e.target.value as Statut })}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <FormField label="Instagram URL" value={form.instagram_url} onChange={(v) => setForm({ ...form, instagram_url: v })} placeholder="https://instagram.com/..." />
              <FormField label="Abonnés Instagram" type="number" value={String(form.instagram_followers)} onChange={(v) => setForm({ ...form, instagram_followers: Number(v) })} />
              <FormField label="TikTok URL" value={form.tiktok_url} onChange={(v) => setForm({ ...form, tiktok_url: v })} placeholder="https://tiktok.com/@..." />
              <FormField label="Abonnés TikTok" type="number" value={String(form.tiktok_followers)} onChange={(v) => setForm({ ...form, tiktok_followers: Number(v) })} />
              <FormField label="Google Drive URL" value={form.google_drive_url} onChange={(v) => setForm({ ...form, google_drive_url: v })} placeholder="https://drive.google.com/..." />
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none resize-none"
                />
              </div>
            </div>

            <div className="px-5 pb-5 pt-3 flex gap-3 border-t border-gray-100">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? 'Enregistrement…' : editTarget ? 'Enregistrer' : 'Créer'}
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="px-5 py-3 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs opacity-70 mt-0.5">{label}</p>
    </div>
  );
}

function FormField({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none transition-colors"
      />
    </div>
  );
}
