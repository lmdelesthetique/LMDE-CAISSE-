'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

type Grade = 'debutante' | 'confirmee' | 'elite';
type ContenuStatut = 'a_faire' | 'en_cours' | 'tourne' | 'poste' | 'realise';
type ContenuType = 'reel' | 'story' | 'demo' | 'temoignage' | 'guide';

const GRADE_STARS: Record<Grade, string> = {
  debutante: '⭐',
  confirmee: '⭐⭐',
  elite: '⭐⭐⭐',
};

const STATUT_LABEL: Record<ContenuStatut, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  tourne: 'Tourné',
  poste: 'Posté',
  realise: 'Réalisé',
};

const STATUT_COLOR: Record<ContenuStatut, string> = {
  a_faire: 'bg-gray-100 text-gray-500',
  en_cours: 'bg-amber-100 text-amber-700',
  tourne: 'bg-blue-100 text-blue-700',
  poste: 'bg-emerald-100 text-emerald-700',
  realise: 'bg-violet-100 text-violet-700',
};

const TYPE_LABEL: Record<ContenuType, string> = {
  reel: 'Reel',
  story: 'Story',
  demo: 'Démo',
  temoignage: 'Témoignage',
  guide: 'Guide',
};

// ─── Script Modal ─────────────────────────────────────────────────────────────

type ScriptTab = 'hooks' | 'reel' | 'story' | 'temoignage' | 'guide';

const SCRIPT_TABS: { key: ScriptTab; label: string }[] = [
  { key: 'hooks', label: '🎣 Hooks' },
  { key: 'reel', label: '🎬 Reel' },
  { key: 'story', label: '📱 Story' },
  { key: 'temoignage', label: '💬 Témoignage' },
  { key: 'guide', label: '🎥 Guide' },
];

function ScriptModal({
  productName,
  script,
  onClose,
}: {
  productName: string;
  script: any;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ScriptTab>('hooks');
  const [copied, setCopied] = useState(false);

  function copyText(text: string) {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const guideContent = script.guide_tournage || script.guide || '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0">
      <div className="bg-white w-full rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="bg-gradient-to-r from-pink-500 to-violet-600 px-5 pt-5 pb-3 rounded-t-3xl">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-white/70 font-medium">Script IA pour</p>
              <h2 className="text-base font-black text-white">{productName}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-lg font-bold">×</button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {SCRIPT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-1 rounded-full text-xs whitespace-nowrap font-semibold transition-colors shrink-0 ${
                  activeTab === tab.key ? 'bg-white text-pink-600' : 'bg-white/20 text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'hooks' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Choisis le hook le plus percutant :</p>
              {(script.hooks ?? []).map((h: string, i: number) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="font-semibold text-amber-900 text-sm">{i + 1}. {h}</p>
                  <button onClick={() => copyText(h)} className="mt-1.5 text-xs text-amber-600 underline">📋 Copier ce hook</button>
                </div>
              ))}
              {script.hashtags && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mt-4">
                  <p className="text-xs font-bold text-violet-700 mb-1"># Hashtags suggérés</p>
                  <p className="text-sm text-violet-600">{script.hashtags}</p>
                  <button onClick={() => copyText(script.hashtags)} className="mt-1.5 text-xs text-violet-500 underline">📋 Copier les hashtags</button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'reel' && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Script Reel (60 secondes) :</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{script.reel}</div>
              <button onClick={() => copyText(script.reel)} className="mt-3 w-full bg-pink-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-pink-700 transition-colors">
                {copied ? '✅ Copié !' : '📋 Copier le script Reel'}
              </button>
            </div>
          )}
          {activeTab === 'story' && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Script Stories :</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{script.story}</div>
              <button onClick={() => copyText(script.story)} className="mt-3 w-full bg-pink-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-pink-700 transition-colors">
                {copied ? '✅ Copié !' : '📋 Copier les Stories'}
              </button>
            </div>
          )}
          {activeTab === 'temoignage' && (
            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">Témoignage authentique :</p>
              <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 italic leading-relaxed">{script.temoignage}</div>
              {script.demonstration && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">Démonstration produit :</p>
                  <div className="bg-blue-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap">{script.demonstration}</div>
                </div>
              )}
              <button onClick={() => copyText(script.temoignage)} className="mt-3 w-full bg-pink-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-pink-700 transition-colors">
                {copied ? '✅ Copié !' : '📋 Copier le témoignage'}
              </button>
            </div>
          )}
          {activeTab === 'guide' && (
            <div className="space-y-3">
              {guideContent && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-yellow-800 mb-2">🎥 Guide de tournage</p>
                  <p className="text-sm text-yellow-800 whitespace-pre-wrap">{guideContent}</p>
                  <button onClick={() => copyText(guideContent)} className="mt-2 text-xs text-yellow-700 underline">📋 Copier le guide</button>
                </div>
              )}
              {script.hashtags && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-violet-700 mb-1"># Hashtags</p>
                  <p className="text-sm text-violet-600">{script.hashtags}</p>
                  <button onClick={() => copyText(script.hashtags)} className="mt-2 text-xs text-violet-500 underline">📋 Copier</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-3 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-2xl text-sm hover:bg-gray-50 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Media Upload Section (video + photo) ────────────────────────────────────

const ACCEPTED_MEDIA = 'video/*,image/*,video/mp4,video/quicktime,video/x-m4v,image/jpeg,image/png,image/heic,image/heif,image/webp';

function isImageType(mimeType: string, filename: string) {
  if (mimeType.startsWith('image/')) return true;
  return /\.(jpe?g|png|heic|heif|webp|gif)$/i.test(filename);
}

function MediaUploadSection({
  contenu,
  assignmentId,
  productId,
  ambassadriceId,
  onUploadComplete,
}: {
  contenu: any;
  assignmentId: string;
  productId: string;
  ambassadriceId: string;
  onUploadComplete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState<'idle' | 'presign' | 'upload' | 'saving'>('idle');
  const [error, setError] = useState<string | null>(null);

  const hasMedia = !!contenu.video_path && !contenu.video_deleted_at;
  const uploadedIsImage = hasMedia && contenu.video_filename
    ? isImageType('', contenu.video_filename)
    : false;

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImg = isImageType(file.type, file.name);
    const isVid = file.type.startsWith('video/') || /\.(mp4|mov|avi|mkv|hevc|m4v|webm)$/i.test(file.name);

    if (!isImg && !isVid) {
      setError('Format non reconnu. Choisis une vidéo (MP4, MOV…) ou une photo (JPG, PNG, HEIC…)');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    setUploadStep('presign');

    try {
      const presignRes = await fetch('/api/ambassadrice/upload-presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contenuId: contenu.id,
          ambassadriceId,
          assignmentId,
          productId,
          filename: file.name,
          contentType: file.type || (isImg ? 'image/jpeg' : 'video/mp4'),
        }),
      });
      const presignData = await presignRes.json().catch(() => ({}));
      if (!presignRes.ok) throw new Error(presignData.error || "Impossible de préparer l'upload");

      const { signedUrl, path } = presignData;
      if (!signedUrl || !path) throw new Error('Réponse presign invalide du serveur');

      setUploadStep('upload');

      const uploadRes = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || (isImg ? 'image/jpeg' : 'video/mp4'),
          'cache-control': 'max-age=3600',
        },
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => `HTTP ${uploadRes.status}`);
        throw new Error(`Upload échoué (${uploadRes.status}) : ${errText}`);
      }

      setUploadStep('saving');

      const completeRes = await fetch('/api/ambassadrice/upload-video-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenuId: contenu.id, path, filename: file.name, sizeBytes: file.size }),
      });
      const completeData = await completeRes.json().catch(() => ({}));
      if (!completeRes.ok) throw new Error(completeData.error || 'Erreur mise à jour base de données');

      setUploadStep('idle');
      onUploadComplete();
    } catch (err: any) {
      setError(err.message || "Erreur lors de l'upload");
      setUploadStep('idle');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const stepLabel: Record<string, string> = {
    presign: '⏳ Préparation…',
    upload: '📤 Envoi en cours… patience 🙏',
    saving: '💾 Enregistrement…',
  };

  if (hasMedia) {
    return (
      <div className="flex items-center gap-2 bg-emerald-50 rounded-xl p-3 border border-emerald-200 mt-2">
        <span className="text-emerald-600 text-base shrink-0">{uploadedIsImage ? '🖼️' : '🎬'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-emerald-700 leading-tight">
            {uploadedIsImage ? 'Photo déposée !' : 'Vidéo déposée !'}
          </p>
          {contenu.video_filename && (
            <p className="text-xs text-emerald-600 truncate">{contenu.video_filename}</p>
          )}
        </div>
        <label className="shrink-0 text-xs text-emerald-600 underline cursor-pointer">
          Remplacer
          <input type="file" accept={ACCEPTED_MEDIA} className="hidden" disabled={uploading} onChange={handleFileSelect} />
        </label>
      </div>
    );
  }

  return (
    <div className="bg-pink-50 rounded-xl p-3 border border-pink-100 mt-2">
      <p className="text-xs font-bold text-pink-800 mb-2">📤 Déposer ma vidéo ou photo</p>

      {uploading && (
        <div className="mb-3">
          <div className="bg-pink-200 rounded-full h-2 overflow-hidden">
            <div className="bg-pink-600 h-2 rounded-full animate-pulse w-full" />
          </div>
          <p className="text-xs text-pink-600 mt-1">{stepLabel[uploadStep] ?? '⏳ En cours…'}</p>
        </div>
      )}

      {error && (
        <div className="mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <p className="text-xs text-red-700 font-semibold">❌ Erreur upload</p>
          <p className="text-xs text-red-600 mt-0.5">{error}</p>
          <button onClick={() => setError(null)} className="text-xs text-red-400 underline mt-1">Fermer</button>
        </div>
      )}

      <label className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl font-bold text-sm transition-colors ${
        uploading ? 'bg-gray-200 text-gray-400 cursor-not-allowed pointer-events-none' : 'bg-pink-600 text-white hover:bg-pink-700 active:scale-[0.98] cursor-pointer'
      }`}>
        {uploading ? (stepLabel[uploadStep] ?? '⏳ En cours…') : '📱 Choisir une vidéo ou photo'}
        <input
          type="file"
          accept={ACCEPTED_MEDIA}
          className="hidden"
          disabled={uploading}
          onChange={handleFileSelect}
        />
      </label>
      <p className="text-xs text-pink-400 text-center mt-1.5">Vidéo : MP4, MOV · Photo : JPG, PNG, HEIC · Toutes tailles</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  );
}

// ─── Main Portal ──────────────────────────────────────────────────────────────

export default function AmbassadricePortalPage() {
  const { lienUnique } = useParams<{ lienUnique: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scriptModal, setScriptModal] = useState<{ productId: string; productName: string } | null>(null);
  const [addingContenu, setAddingContenu] = useState<string | null>(null);
  const [addContenuError, setAddContenuError] = useState<string | null>(null);
  const [updatingContenu, setUpdatingContenu] = useState<string | null>(null);
  const [updateContenuError, setUpdateContenuError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // ─── Push notifications ───────────────────────────────────────────────────────
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported'); return;
    }
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    setPushStatus(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);

  useEffect(() => {
    if (!lienUnique || pushStatus !== 'granted') return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch('/api/ambassadrice/push-subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...sub.toJSON(), lienUnique }),
          });
        }
      } catch {}
    })();
  }, [lienUnique, pushStatus]);

  const subscribeToPush = async () => {
    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission as 'default' | 'granted' | 'denied');
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
      });
      await fetch('/api/ambassadrice/push-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), lienUnique }),
      });
    } catch {}
  };

  // PWA install prompt (Android/Chrome)
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); setShowInstallBanner(true); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Detect iOS for manual install instructions
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    const isStandalone = (navigator as any).standalone === true;
    setIsIOS(isIOSDevice && !isStandalone);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ambassadrice/portal/${lienUnique}`);
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? 'Erreur'); return; }
      setData(json);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, [lienUnique]);

  useEffect(() => { load(); }, [load]);

  const handleAddContenu = async (assignmentId: string, productId: string, productName: string, type: ContenuType) => {
    setAddingContenu(productId + type);
    setAddContenuError(null);
    try {
      const res = await fetch(`/api/campagne-contenus/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_name: productName, type_contenu: type }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAddContenuError(json.error ?? 'Erreur lors de l\'ajout');
        return;
      }
      await load();
    } catch {
      setAddContenuError('Erreur réseau, réessaie.');
    } finally {
      setAddingContenu(null);
    }
  };

  const handleUpdateContenu = async (contenuId: string, update: any) => {
    setUpdatingContenu(contenuId);
    setUpdateContenuError(null);
    try {
      const res = await fetch(`/api/campagne-contenus/${contenuId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUpdateContenuError(json.error ?? 'Erreur lors de la mise à jour');
        return;
      }
      await load();
    } catch {
      setUpdateContenuError('Erreur réseau, réessaie.');
    } finally {
      setUpdatingContenu(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">🔗</p>
          <p className="text-lg font-bold text-gray-800">{error === 'Lien invalide.' ? 'Lien invalide' : 'Erreur'}</p>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const { ambassadrice, campaign, assignment, contenus } = data ?? {};

  if (!assignment || !campaign) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 flex items-center justify-center p-6">
        <div className="text-center">
          <p className="text-4xl mb-4">😴</p>
          <p className="text-lg font-bold text-gray-800">Bonjour {ambassadrice?.prenom} !</p>
          <p className="text-sm text-gray-500 mt-2">Pas de campagne active en ce moment.</p>
          <p className="text-xs text-gray-400 mt-1">On reviendra bientôt avec de nouvelles missions 🌟</p>
        </div>
      </div>
    );
  }

  const products: any[] = assignment.products ?? [];
  const allContenus: any[] = contenus ?? [];
  const totalContenus = allContenus.length;
  const doneContenus = allContenus.filter((c) => c.statut === 'poste' || c.statut === 'realise').length;
  const progress = totalContenus > 0 ? Math.round((doneContenus / totalContenus) * 100) : 0;

  const activeScript = scriptModal
    ? (assignment.ai_scripts ?? {})[scriptModal.productId]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 pb-20">
      {scriptModal && activeScript && (
        <ScriptModal
          productName={scriptModal.productName}
          script={activeScript}
          onClose={() => setScriptModal(null)}
        />
      )}

      {/* PWA Install Banner */}
      {showInstallBanner && installPrompt && (
        <div className="fixed bottom-4 left-4 right-4 z-50 bg-white rounded-2xl shadow-xl border border-pink-200 p-4 flex items-center gap-3">
          <div className="text-2xl shrink-0">📱</div>
          <div className="flex-1">
            <p className="text-sm font-bold text-gray-800">Installer sur mon téléphone</p>
            <p className="text-xs text-gray-500">Accès rapide depuis l'écran d'accueil</p>
          </div>
          <button
            onClick={async () => { installPrompt.prompt(); const { outcome } = await installPrompt.userChoice; if (outcome === 'accepted') setShowInstallBanner(false); }}
            className="shrink-0 px-3 py-2 bg-pink-600 text-white text-xs font-bold rounded-xl"
          >
            Installer
          </button>
          <button onClick={() => setShowInstallBanner(false)} className="shrink-0 text-gray-400 text-lg leading-none">×</button>
        </div>
      )}

      {/* iOS install instructions */}
      {isIOS && (
        <div className="bg-pink-600 text-white px-4 py-2.5 text-center text-xs font-medium flex items-center justify-center gap-2">
          <span>📲</span>
          <span>Pour installer : appuie sur <strong>Partager</strong> puis <strong>Sur l'écran d'accueil</strong></span>
        </div>
      )}

      {/* Push notification banner */}
      {pushStatus === 'default' && (
        <div className="bg-violet-50 border-b border-violet-200 px-4 py-3 flex items-center gap-3">
          <span className="text-xl">🔔</span>
          <p className="flex-1 text-sm text-violet-800 font-medium">Recevez les nouvelles missions même écran verrouillé</p>
          <button
            onClick={subscribeToPush}
            className="bg-violet-600 text-white text-sm font-bold px-4 py-2 rounded-full shrink-0"
          >
            Activer
          </button>
        </div>
      )}
      {pushStatus === 'granted' && (
        <div className="bg-violet-50 border-b border-violet-100 px-4 py-1.5 flex items-center gap-2">
          <span className="text-sm">🔔</span>
          <p className="text-xs text-violet-700">Notifications activées</p>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 to-violet-600 text-white px-5 pt-10 pb-6">
        <p className="text-2xl font-bold">Bonjour {ambassadrice.prenom} ! 🌟</p>
        <p className="text-sm opacity-90 mt-0.5">
          {GRADE_STARS[ambassadrice.grade as Grade]} {ambassadrice.grade === 'elite' ? 'Elite' : ambassadrice.grade === 'confirmee' ? 'Confirmée' : 'Débutante'}
        </p>
        <div className="mt-4 bg-white/20 rounded-2xl p-4">
          <p className="font-semibold text-sm">📢 {campaign.nom}</p>
          {campaign.date_debut && (
            <p className="text-xs opacity-80 mt-0.5">
              {new Date(campaign.date_debut).toLocaleDateString('fr-FR')}
              {campaign.date_fin ? ` → ${new Date(campaign.date_fin).toLocaleDateString('fr-FR')}` : ''}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 py-5 space-y-5 max-w-lg mx-auto">
        {/* Progress */}
        <div className="bg-white rounded-2xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-700">Progression</p>
            <p className="text-sm font-bold text-primary">{doneContenus}/{totalContenus} contenus</p>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-pink-400 to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{progress}% complété</p>
        </div>

        {/* Minimum requirements */}
        <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-violet-700 uppercase tracking-wide mb-2">📋 MINIMUM PAR BOX</p>
          <div className="flex gap-2 flex-wrap text-xs font-semibold text-violet-600">
            <span className="bg-white border border-violet-200 rounded-lg px-2 py-1">3 Reels</span>
            <span className="bg-white border border-violet-200 rounded-lg px-2 py-1">1 Démo</span>
            <span className="bg-white border border-violet-200 rounded-lg px-2 py-1">2 Stories</span>
            <span className="bg-white border border-violet-200 rounded-lg px-2 py-1">1 Témoignage</span>
          </div>
        </div>

        {/* Products */}
        {products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
            <p className="text-gray-400 text-sm">Aucun produit assigné pour le moment.</p>
          </div>
        ) : (
          products.map((product) => {
            const productContenus = allContenus.filter((c) => c.product_id === product.id);
            const hasScript = (assignment.ai_scripts ?? {})[product.id];
            const doneForProduct = productContenus.filter((c) => c.statut === 'poste' || c.statut === 'realise').length;
            const videosUploaded = productContenus.filter((c) => c.video_path && !c.video_deleted_at).length;

            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm">
                {/* Product header */}
                <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="w-12 h-12 object-cover rounded-xl shrink-0" />
                  ) : (
                    <div className="w-12 h-12 bg-pink-50 rounded-xl shrink-0 flex items-center justify-center text-xl">💄</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
                    <p className="text-xs text-gray-400">x{product.quantity} · {(product.price ?? 0).toFixed(2)} €</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {doneForProduct > 0 && (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                        {doneForProduct} ✓
                      </span>
                    )}
                    {videosUploaded > 0 && (
                      <span className="text-xs font-bold text-pink-600 bg-pink-50 border border-pink-200 rounded-full px-2 py-0.5">
                        🎬 {videosUploaded} vidéo{videosUploaded > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-4 py-3 space-y-3">
                  {/* Script button */}
                  {hasScript && (
                    <button
                      onClick={() => setScriptModal({ productId: product.id, productName: product.name })}
                      className="w-full py-2.5 bg-violet-600 text-white font-bold rounded-xl text-sm hover:bg-violet-700 transition-colors"
                    >
                      📝 Voir le script IA
                    </button>
                  )}

                  {/* Status update error */}
                  {updateContenuError && (
                    <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                      <p className="text-xs text-red-600">❌ {updateContenuError}</p>
                      <button onClick={() => setUpdateContenuError(null)} className="text-xs text-red-400 underline ml-2">Fermer</button>
                    </div>
                  )}

                  {/* Contenus list with per-contenu video upload */}
                  {productContenus.length > 0 && (
                    <div className="space-y-4">
                      {productContenus.map((c) => (
                        <div key={c.id}>
                          {/* Contenu row */}
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUT_COLOR[(c.statut as ContenuStatut) ?? 'a_faire']}`}>
                              {STATUT_LABEL[(c.statut as ContenuStatut) ?? 'a_faire']}
                            </span>
                            <span className="text-xs text-gray-600 capitalize">{TYPE_LABEL[c.type_contenu as ContenuType]}</span>
                            <div className="flex-1" />
                            <select
                              value={c.statut}
                              onChange={(e) => handleUpdateContenu(c.id, { statut: e.target.value })}
                              disabled={updatingContenu === c.id}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:outline-none disabled:opacity-50"
                            >
                              <option value="a_faire">À faire</option>
                              <option value="en_cours">En cours</option>
                              <option value="tourne">Tourné</option>
                              <option value="realise">Réalisé</option>
                              <option value="poste">Posté</option>
                            </select>
                          </div>
                          {/* Video upload per contenu */}
                          <MediaUploadSection
                            contenu={c}
                            assignmentId={assignment.id}
                            productId={product.id}
                            ambassadriceId={ambassadrice.id}
                            onUploadComplete={load}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add contenu */}
                  {addContenuError && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1">❌ {addContenuError}</p>
                  )}
                  <AddContenuDropdown
                    assignmentId={assignment.id}
                    productId={product.id}
                    productName={product.name}
                    adding={addingContenu}
                    onAdd={(aId, pId, pName, t) => { setAddContenuError(null); handleAddContenu(aId, pId, pName, t); }}
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Footer */}
        <div className="text-center pt-2">
          <p className="text-xs text-gray-400">Le Monde de l&apos;Esthétique 💅</p>
        </div>
      </div>
    </div>
  );
}

// ─── Add Contenu Dropdown ─────────────────────────────────────────────────────

function AddContenuDropdown({
  assignmentId,
  productId,
  productName,
  adding,
  onAdd,
}: {
  assignmentId: string;
  productId: string;
  productName: string;
  adding: string | null;
  onAdd: (assignmentId: string, productId: string, productName: string, type: ContenuType) => void;
}) {
  const [open, setOpen] = useState(false);
  const types: ContenuType[] = ['reel', 'story', 'demo', 'temoignage', 'guide'];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 font-semibold rounded-xl text-xs hover:border-primary hover:text-primary transition-colors"
      >
        + Ajouter un contenu
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-30">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => { onAdd(assignmentId, productId, productName, t); setOpen(false); }}
              disabled={adding === productId + t}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 flex items-center gap-2 disabled:opacity-50"
            >
              {adding === productId + t ? (
                <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : null}
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
