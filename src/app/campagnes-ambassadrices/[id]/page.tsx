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
  const [updatingDateColis, setUpdatingDateColis] = useState<string | null>(null);
  const [updatingStatut, setUpdatingStatut] = useState(false);
  const [downloadingVideo, setDownloadingVideo] = useState<string | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  // Product / ambassadrice edit states
  const [removingProduct, setRemovingProduct] = useState<string | null>(null); // `${assignmentId}:${productId}`
  const [removingAmbassadrice, setRemovingAmbassadrice] = useState<string | null>(null); // assignmentId
  const [replaceTarget, setReplaceTarget] = useState<{ assignmentId: string; productId: string; productName: string } | null>(null);
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceResults, setReplaceResults] = useState<any[]>([]);
  const [replaceSearching, setReplaceSearching] = useState(false);

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

  const handleUpdateReception = async (assignmentId: string, statut_reception: StatutReception, currentDateColis?: string | null) => {
    setUpdatingReception(assignmentId);
    try {
      const body: any = { assignment_id: assignmentId, statut_reception };
      // Auto-set reception date when status becomes "recu" or "confirme" and no date yet
      if ((statut_reception === 'recu' || statut_reception === 'confirme') && !currentDateColis) {
        body.date_colis_recu = new Date().toISOString().split('T')[0];
      }
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const handleUpdateDateColis = async (assignmentId: string, date_colis_recu: string) => {
    setUpdatingDateColis(assignmentId);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignment_id: assignmentId, date_colis_recu: date_colis_recu || null }),
      });
      if (!res.ok) { showToast(false, 'Erreur mise à jour date'); return; }
      load();
    } catch {
      showToast(false, 'Erreur réseau');
    } finally {
      setUpdatingDateColis(null);
    }
  };

  const buildRelanceWhatsApp = (assignment: any, campagneNom: string, dateFin?: string) => {
    const amb = assignment.ambassadrice;
    const tel = amb?.telephone ?? '';
    if (!tel) return null;
    const digits = tel.replace(/\D/g, '');
    let phone = digits;
    if (digits.startsWith('0') && digits.length === 10) {
      const local = digits.slice(1);
      if (digits.startsWith('069') || digits.startsWith('0596')) phone = '596' + local;
      else if (digits.startsWith('059') || digits.startsWith('0690') || digits.startsWith('0691')) phone = '590' + local;
      else phone = '33' + local;
    } else if (digits.length === 9 && /^[67]/.test(digits)) {
      phone = '596' + digits;
    }
    const prenom = amb?.prenom ?? 'Ambassadrice';
    const dateColisStr = assignment.date_colis_recu
      ? new Date(assignment.date_colis_recu).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;
    const dateFinStr = dateFin
      ? new Date(dateFin).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
      : null;

    const msg = [
      `Bonjour ${prenom} 👋`,
      ``,
      `On te contacte concernant ta campagne *${campagneNom}*.`,
      dateColisStr ? `Tu as reçu tes produits le ${dateColisStr}.` : `Tu as reçu tes produits pour cette campagne.`,
      dateFinStr ? `Les contenus sont attendus pour le *${dateFinStr}* au plus tard.` : ``,
      ``,
      `⚠️ Si la campagne n'est pas réalisée dans les délais convenus, nous serons dans l'obligation de *mettre fin à la collaboration*.`,
      ``,
      `Nous comptons sur toi et savons que tu peux le faire ! 💪`,
      `N'hésite pas à nous écrire si tu as besoin d'aide ou si tu as un imprévu.`,
      ``,
      `— Le Monde de l'Esthétique 🌸`,
    ].filter(l => l !== undefined).join('\n');

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
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
      const filename = contenu.video_filename || 'video.mp4';
      const res = await fetch(
        `/api/ambassadrice/video-url?path=${encodeURIComponent(contenu.video_path)}&filename=${encodeURIComponent(filename)}`
      );
      const data = await res.json();
      if (!res.ok || !data.url) { showToast(false, 'Impossible de générer l\'URL de téléchargement'); return; }

      // Force download on all platforms including iOS Safari
      const a = document.createElement('a');
      a.href = data.url;
      a.download = filename;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
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

  const handleRemoveProduct = async (assignmentId: string, productId: string, productName: string) => {
    if (!window.confirm(`Retirer "${productName}" de la campagne ?\n\nLe stock sera restauré automatiquement.`)) return;
    const key = `${assignmentId}:${productId}`;
    setRemovingProduct(key);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove_product', productId }),
      });
      if (!res.ok) { showToast(false, 'Erreur suppression produit'); return; }
      showToast(true, `"${productName}" retiré — stock restauré`);
      load();
    } catch { showToast(false, 'Erreur réseau'); }
    finally { setRemovingProduct(null); }
  };

  const handleRemoveAmbassadrice = async (assignmentId: string, ambName: string) => {
    if (!window.confirm(`Retirer ${ambName} de la campagne ?\n\nTous ses produits seront retirés et le stock restauré.`)) return;
    setRemovingAmbassadrice(assignmentId);
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}/assignments/${assignmentId}`, { method: 'DELETE' });
      if (!res.ok) { showToast(false, 'Erreur suppression ambassadrice'); return; }
      showToast(true, `${ambName} retirée — stock restauré`);
      load();
    } catch { showToast(false, 'Erreur réseau'); }
    finally { setRemovingAmbassadrice(null); }
  };

  const handleReplaceSearch = async (q: string) => {
    setReplaceSearch(q);
    if (q.length < 2) { setReplaceResults([]); return; }
    setReplaceSearching(true);
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=6`);
      const data = await res.json();
      setReplaceResults(data.products ?? []);
    } catch { setReplaceResults([]); }
    finally { setReplaceSearching(false); }
  };

  const handleConfirmReplace = async (newProd: any) => {
    if (!replaceTarget) return;
    const { assignmentId, productId, productName } = replaceTarget;
    const assignment = (data?.assignments ?? []).find((a: any) => a.id === assignmentId);
    const oldProduct = (assignment?.products ?? []).find((p: any) => p.id === productId);
    const qty = oldProduct?.quantity ?? 1;
    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${id}/assignments/${assignmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'replace_product',
          oldProductId: productId,
          newProduct: {
            id: newProd.id,
            name: newProd.name,
            price: newProd.sell_price_ttc ?? 0,
            cout_achat: newProd.cost_price ?? 0,
            quantity: qty,
            image_url: newProd.image_url ?? null,
          },
        }),
      });
      if (!res.ok) { showToast(false, 'Erreur remplacement produit'); return; }
      showToast(true, `"${productName}" remplacé par "${newProd.name}" — stock mis à jour`);
      setReplaceTarget(null);
      setReplaceSearch('');
      setReplaceResults([]);
      load();
    } catch { showToast(false, 'Erreur réseau'); }
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">
                          {amb?.prenom ?? '—'} {amb?.nom ?? ''}
                        </p>
                        {amb?.lien_unique && (
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/ambassadrice/${amb.lien_unique}`;
                              navigator.clipboard?.writeText(url).catch(() => {});
                              setCopiedLink(assignment.id);
                              setTimeout(() => setCopiedLink(null), 2000);
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-pink-50 text-pink-600 border border-pink-200 rounded-full hover:bg-pink-100 transition-colors shrink-0"
                            title={`Copier le lien portail de ${amb.prenom}`}
                          >
                            {copiedLink === assignment.id ? '✅ Copié' : '🔗 Lien portail'}
                          </button>
                        )}
                      </div>
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
                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                      {/* Date réception colis */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400 shrink-0">📦 Reçu le</span>
                        <input
                          type="date"
                          value={assignment.date_colis_recu ?? ''}
                          onChange={(e) => handleUpdateDateColis(assignment.id, e.target.value)}
                          disabled={updatingDateColis === assignment.id}
                          title="Date de réception du colis"
                          className="px-2 py-1 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:border-primary disabled:opacity-50 w-[130px]"
                        />
                      </div>
                      {/* Statut réception */}
                      <select
                        value={assignment.statut_reception}
                        onChange={(e) => handleUpdateReception(assignment.id, e.target.value as StatutReception, assignment.date_colis_recu)}
                        disabled={updatingReception === assignment.id}
                        className="px-2 py-1.5 border-2 border-gray-200 rounded-lg text-xs font-medium bg-white focus:outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="en_preparation">En préparation</option>
                        <option value="expedie">Expédié</option>
                        <option value="recu">Reçu</option>
                        <option value="confirme">Confirmé</option>
                      </select>
                      {/* WhatsApp relance */}
                      {(() => {
                        const waLink = buildRelanceWhatsApp(assignment, data.nom, data.date_fin);
                        return waLink ? (
                          <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Envoyer une relance WhatsApp — si la campagne n'est pas réalisée, arrêt de la collaboration"
                            className="flex items-center gap-1 px-2 py-1.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors shrink-0"
                          >
                            ⚠️ Relance WA
                          </a>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Products */}
                  {products.length > 0 && (
                    <div className="px-5 pb-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Produits</p>
                      <div className="flex gap-2 flex-wrap">
                        {products.map((p: any) => {
                          const rmKey = `${assignment.id}:${p.id}`;
                          const isRemoving = removingProduct === rmKey;
                          const isReplaceTarget = replaceTarget?.assignmentId === assignment.id && replaceTarget?.productId === p.id;
                          return (
                            <div key={p.id} className="flex flex-col gap-1">
                              <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border ${isReplaceTarget ? 'bg-blue-50 border-blue-300' : 'bg-gray-100 border-gray-200'}`}>
                                <span className="text-gray-700">{p.name} × {p.quantity}</span>
                                <button
                                  onClick={() => {
                                    if (isReplaceTarget) { setReplaceTarget(null); setReplaceSearch(''); setReplaceResults([]); }
                                    else { setReplaceTarget({ assignmentId: assignment.id, productId: p.id, productName: p.name }); setReplaceSearch(''); setReplaceResults([]); }
                                  }}
                                  title="Remplacer ce produit"
                                  className="text-blue-400 hover:text-blue-600 ml-1 shrink-0"
                                >↔</button>
                                <button
                                  onClick={() => handleRemoveProduct(assignment.id, p.id, p.name)}
                                  disabled={isRemoving}
                                  title="Retirer ce produit (stock restauré)"
                                  className="text-red-400 hover:text-red-600 shrink-0 disabled:opacity-40"
                                >
                                  {isRemoving ? '…' : '×'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Replace product search panel */}
                      {replaceTarget?.assignmentId === assignment.id && (
                        <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                          <p className="text-xs font-medium text-blue-700">Remplacer "{replaceTarget?.productName}" par :</p>
                          <input
                            type="text"
                            value={replaceSearch}
                            onChange={(e) => handleReplaceSearch(e.target.value)}
                            placeholder="Rechercher un produit…"
                            className="w-full px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-400"
                            autoFocus
                          />
                          {replaceSearching && <p className="text-xs text-blue-400">Recherche…</p>}
                          {replaceResults.length > 0 && (
                            <div className="space-y-1">
                              {replaceResults.map((r: any) => (
                                <button
                                  key={r.id}
                                  onClick={() => handleConfirmReplace(r)}
                                  className="w-full text-left px-3 py-1.5 text-xs bg-white border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-between gap-2"
                                >
                                  <span className="font-medium text-gray-800 truncate">{r.name}</span>
                                  <span className="text-gray-400 shrink-0">Stock: {r.stock ?? 0}</span>
                                </button>
                              ))}
                            </div>
                          )}
                          <button onClick={() => { setReplaceTarget(null); setReplaceSearch(''); setReplaceResults([]); }} className="text-xs text-blue-500 underline">Annuler</button>
                        </div>
                      )}
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

                  {/* Remove ambassadrice */}
                  <div className="px-5 pb-4 border-t border-border pt-3 flex justify-end">
                    <button
                      onClick={() => handleRemoveAmbassadrice(assignment.id, `${amb?.prenom ?? ''} ${amb?.nom ?? ''}`.trim())}
                      disabled={removingAmbassadrice === assignment.id}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {removingAmbassadrice === assignment.id
                        ? <span className="inline-block w-3 h-3 border border-red-400 border-t-transparent rounded-full animate-spin" />
                        : '🗑️'}
                      Retirer {amb?.prenom ?? 'cette ambassadrice'} de la campagne
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
