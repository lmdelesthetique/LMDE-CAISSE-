'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

type StatutReception = 'en_preparation' | 'expedie' | 'recu' | 'confirme';
type CampagneStatut = 'brouillon' | 'active' | 'terminee' | 'annulee';

const RECEPTION_LABEL: Record<StatutReception, string> = {
  en_preparation: 'En préparation',
  expedie: 'Expédié',
  recu: 'Reçu',
  confirme: 'Confirmé',
};

const RECEPTION_COLOR: Record<StatutReception, string> = {
  en_preparation: 'bg-amber-50 text-amber-700',
  expedie: 'bg-blue-50 text-blue-700',
  recu: 'bg-violet-50 text-violet-700',
  confirme: 'bg-emerald-50 text-emerald-700',
};

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} Go`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} Mo`;
  return `${(bytes / 1024).toFixed(0)} Ko`;
}

export default function CampagneDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [updatingReception, setUpdatingReception] = useState<string | null>(null);
  const [updatingStatut, setUpdatingStatut] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState<string | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`);
      if (!res.ok) { setData(null); return; }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const handleUpdateReception = async (assignmentId: string, statut_reception: StatutReception) => {
    setUpdatingReception(assignmentId);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId, statut_reception }),
      });
      if (!res.ok) { showToast(false, 'Erreur mise à jour'); return; }
      showToast(true, 'Statut réception mis à jour');
      load();
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setUpdatingReception(null);
    }
  };

  const handleUpdateCampagneStatut = async (statut: CampagneStatut) => {
    setUpdatingStatut(true);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut }),
      });
      if (!res.ok) { showToast(false, 'Erreur'); return; }
      showToast(true, 'Statut mis à jour');
      load();
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setUpdatingStatut(false);
    }
  };

  const handleUpdateContenu = async (contenuId: string, update: any) => {
    try {
      await fetch(`/api/campagne-contenus/${contenuId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      load();
    } catch {}
  };

  const handleDownloadVideo = async (contenu: any) => {
    if (!contenu.video_path) return;
    setDownloadingVideo(contenu.id);
    try {
      const res = await fetch(`/api/ambassadrice/video-url?path=${encodeURIComponent(contenu.video_path)}`);
      const data = await res.json();
      if (!res.ok || !data.url) { showToast(false, 'Impossible de générer l\'URL de téléchargement'); return; }
      window.open(data.url, '_blank');
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setDownloadingVideo(null);
    }
  };

  const handleDeleteVideo = async (contenu: any) => {
    const ok = window.confirm(
      `Supprimer la vidéo "${contenu.video_filename || 'cette vidéo'}" ?\n\nAssurez-vous de l'avoir téléchargée d'abord — cette action est irréversible.`
    );
    if (!ok) return;

    setDeletingVideo(contenu.id);
    try {
      const res = await fetch(`/api/admin/videos/${contenu.id}/delete`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) { showToast(false, data.error || 'Erreur suppression'); return; }
      showToast(true, 'Vidéo supprimée — espace libéré');
      load();
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setDeletingVideo(null);
    }
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
          <p className="text-muted-foreground">Campagne introuvable.</p>
          <Link href="/campagnes-ambassadrices" className="text-primary text-sm underline mt-2 block">
            Retour aux campagnes
          </Link>
        </div>
      </AppLayout>
    );
  }

  const assignments = data.assignments ?? [];
  const totalContenus = assignments.reduce((sum: number, a: any) => sum + (a.contenus?.length ?? 0), 0);
  const doneContenus = assignments.reduce(
    (sum: number, a: any) => sum + (a.contenus ?? []).filter((c: any) => c.statut === 'poste' || c.statut === 'realise').length,
    0
  );
  const totalCost = assignments.reduce((sum: number, a: any) => sum + (a.cout_total ?? 0), 0);
  const totalVideos = assignments.reduce(
    (sum: number, a: any) => sum + (a.contenus ?? []).filter((c: any) => c.video_path && !c.video_deleted_at).length,
    0
  );

  return (
    <AppLayout>
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.ok ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'}`}>
          {toast.ok ? '✅' : '❌'} {toast.msg}
        </div>
      )}

      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <Link href="/campagnes-ambassadrices" className="text-sm text-primary hover:underline">
          ← Retour aux campagnes
        </Link>

        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">{data.nom}</h1>
              {data.description && <p className="text-sm text-muted-foreground mt-1">{data.description}</p>}
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                {data.date_debut && (
                  <span>
                    {new Date(data.date_debut).toLocaleDateString('fr-FR')}
                    {data.date_fin ? ` → ${new Date(data.date_fin).toLocaleDateString('fr-FR')}` : ''}
                  </span>
                )}
                {data.objectif && <span>Objectif: {data.objectif}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                value={data.statut}
                onChange={(e) => handleUpdateCampagneStatut(e.target.value as CampagneStatut)}
                disabled={updatingStatut}
                className="px-3 py-1.5 border-2 border-gray-200 rounded-lg text-sm font-medium bg-white focus:outline-none focus:border-primary disabled:opacity-50"
              >
                <option value="brouillon">En préparation</option>
                <option value="active">Active</option>
                <option value="terminee">Terminée</option>
                <option value="annulee">Annulée</option>
              </select>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-4 gap-4 mt-4">
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums">{assignments.length}</p>
              <p className="text-xs text-muted-foreground">Ambassadrices</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums">{doneContenus}/{totalContenus}</p>
              <p className="text-xs text-muted-foreground">Contenus</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums text-pink-600">🎬 {totalVideos}</p>
              <p className="text-xs text-muted-foreground">Vidéos reçues</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-bold tabular-nums">{totalCost.toFixed(0)} €</p>
              <p className="text-xs text-muted-foreground">Coût total</p>
            </div>
          </div>
        </div>

        {/* Assignments */}
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 border border-dashed border-border rounded-2xl">
            <p className="text-muted-foreground text-sm">Aucune ambassadrice assignée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment: any) => {
              const amb = assignment.ambassadrice;
              const products = assignment.products ?? [];
              const contenus = assignment.contenus ?? [];
              const doneCount = contenus.filter((c: any) => c.statut === 'poste' || c.statut === 'realise').length;
              const videoCount = contenus.filter((c: any) => c.video_path && !c.video_deleted_at).length;

              return (
                <div key={assignment.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {/* Row header */}
                  <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">
                        {amb?.prenom ?? '—'} {amb?.nom ?? ''}
                      </p>
                      {amb?.email && <p className="text-xs text-muted-foreground">{amb.email}</p>}
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span>📦 {products.length} produit{products.length > 1 ? 's' : ''}</span>
                        <span>📋 {doneCount}/{contenus.length} contenus</span>
                        <span className={videoCount > 0 ? 'text-pink-600 font-semibold' : ''}>
                          🎬 {videoCount} vidéo{videoCount > 1 ? 's' : ''}
                        </span>
                        <span>💰 {(assignment.cout_total ?? 0).toFixed(2)} €</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={assignment.statut_reception}
                        onChange={(e) => handleUpdateReception(assignment.id, e.target.value as StatutReception)}
                        disabled={updatingReception === assignment.id}
                        className="px-2 py-1.5 border-2 border-gray-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="en_preparation">En préparation</option>
                        <option value="expedie">Expédié</option>
                        <option value="recu">Reçu</option>
                        <option value="confirme">Confirmé</option>
                      </select>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${RECEPTION_COLOR[assignment.statut_reception as StatutReception]}`}>
                        {RECEPTION_LABEL[assignment.statut_reception as StatutReception]}
                      </span>
                    </div>
                  </div>

                  {/* Products */}
                  {products.length > 0 && (
                    <div className="px-5 pb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Produits</p>
                      <div className="flex gap-2 flex-wrap">
                        {products.map((p: any) => (
                          <span key={p.id} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg">
                            {p.name} × {p.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contenus + videos */}
                  {contenus.length > 0 && (
                    <div className="px-5 pb-4 border-t border-border pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Contenus & Vidéos</p>
                      <div className="space-y-2">
                        {contenus.map((c: any) => {
                          const hasVideo = !!c.video_path && !c.video_deleted_at;
                          const wasDeleted = !c.video_path && !!c.video_deleted_at;
                          return (
                            <div key={c.id} className="flex items-center gap-2 text-xs flex-wrap">
                              <select
                                value={c.statut}
                                onChange={(e) => handleUpdateContenu(c.id, { statut: e.target.value })}
                                className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none shrink-0"
                              >
                                <option value="a_faire">À faire</option>
                                <option value="en_cours">En cours</option>
                                <option value="tourne">Tourné</option>
                                <option value="realise">Réalisé</option>
                                <option value="poste">Posté</option>
                              </select>
                              <span className="capitalize text-gray-700 shrink-0">{c.type_contenu}</span>
                              {c.product_name && <span className="text-gray-400 shrink-0">— {c.product_name}</span>}

                              <div className="ml-auto flex items-center gap-1.5 shrink-0">
                                {hasVideo && (
                                  <>
                                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                      ✅
                                      {c.video_filename && (
                                        <span className="text-gray-500 font-normal max-w-[120px] truncate hidden sm:inline">
                                          {c.video_filename}
                                        </span>
                                      )}
                                      {c.video_size_bytes && (
                                        <span className="text-gray-400 font-normal">{fmtBytes(c.video_size_bytes)}</span>
                                      )}
                                    </span>
                                    <button
                                      onClick={() => handleDownloadVideo(c)}
                                      disabled={downloadingVideo === c.id}
                                      title="Télécharger la vidéo"
                                      className="px-2 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 font-medium"
                                    >
                                      {downloadingVideo === c.id ? (
                                        <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                                      ) : '⬇️'}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteVideo(c)}
                                      disabled={deletingVideo === c.id}
                                      title="Supprimer la vidéo (libère l'espace)"
                                      className="px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 font-medium"
                                    >
                                      {deletingVideo === c.id ? (
                                        <span className="inline-block w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                                      ) : '🗑️'}
                                    </button>
                                  </>
                                )}
                                {wasDeleted && (
                                  <span className="text-gray-400 italic">🗑️ Supprimée</span>
                                )}
                                {!hasVideo && !wasDeleted && (
                                  <span className="text-gray-300">⏳ En attente</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {assignment.notes && (
                    <div className="px-5 pb-3 text-xs text-muted-foreground italic border-t border-border pt-2">
                      {assignment.notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
