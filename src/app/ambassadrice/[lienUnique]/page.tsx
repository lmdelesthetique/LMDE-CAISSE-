'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Grade = 'debutante' | 'confirmee' | 'elite';
type ContenuStatut = 'a_faire' | 'en_cours' | 'tourne' | 'poste';
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
};

const STATUT_COLOR: Record<ContenuStatut, string> = {
  a_faire: 'bg-gray-100 text-gray-500',
  en_cours: 'bg-amber-100 text-amber-700',
  tourne: 'bg-blue-100 text-blue-700',
  poste: 'bg-emerald-100 text-emerald-700',
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

  // guide_tournage or fallback to guide
  const guideContent = script.guide_tournage || script.guide || '';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-0">
      <div className="bg-white w-full rounded-t-3xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 to-violet-600 px-5 pt-5 pb-3 rounded-t-3xl">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-white/70 font-medium">Script IA pour</p>
              <h2 className="text-base font-black text-white">{productName}</h2>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 text-white text-lg font-bold">×</button>
          </div>
          {/* Tabs */}
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {activeTab === 'hooks' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Choisis le hook le plus percutant :</p>
              {(script.hooks ?? []).map((h: string, i: number) => (
                <div key={i} className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="font-semibold text-amber-900 text-sm">{i + 1}. {h}</p>
                  <button onClick={() => copyText(h)} className="mt-1.5 text-xs text-amber-600 underline">
                    📋 Copier ce hook
                  </button>
                </div>
              ))}
              {script.hashtags && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 mt-4">
                  <p className="text-xs font-bold text-violet-700 mb-1"># Hashtags suggérés</p>
                  <p className="text-sm text-violet-600">{script.hashtags}</p>
                  <button onClick={() => copyText(script.hashtags)} className="mt-1.5 text-xs text-violet-500 underline">
                    📋 Copier les hashtags
                  </button>
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
                  <button onClick={() => copyText(guideContent)} className="mt-2 text-xs text-yellow-700 underline">
                    📋 Copier le guide
                  </button>
                </div>
              )}
              {script.hashtags && (
                <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-violet-700 mb-1"># Hashtags</p>
                  <p className="text-sm text-violet-600">{script.hashtags}</p>
                  <button onClick={() => copyText(script.hashtags)} className="mt-2 text-xs text-violet-500 underline">
                    📋 Copier
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-6 pt-3 border-t border-gray-100">
          <button onClick={onClose} className="w-full py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-2xl text-sm hover:bg-gray-50 transition-colors">
            Fermer
          </button>
        </div>
      </div>
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
  const [updatingContenu, setUpdatingContenu] = useState<string | null>(null);

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
    try {
      await fetch(`/api/campagne-contenus/${assignmentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_name: productName, type_contenu: type }),
      });
      load();
    } finally {
      setAddingContenu(null);
    }
  };

  const handleUpdateContenu = async (contenuId: string, update: any) => {
    setUpdatingContenu(contenuId);
    try {
      await fetch(`/api/campagne-contenus/${contenuId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      load();
    } finally {
      setUpdatingContenu(null);
    }
  };

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────────
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
  const doneContenus = allContenus.filter((c) => c.statut === 'poste').length;
  const progress = totalContenus > 0 ? Math.round((doneContenus / totalContenus) * 100) : 0;

  const activeScript = scriptModal
    ? (assignment.ai_scripts ?? {})[scriptModal.productId]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-violet-50 pb-20">
      {/* Script Modal */}
      {scriptModal && activeScript && (
        <ScriptModal
          productName={scriptModal.productName}
          script={activeScript}
          onClose={() => setScriptModal(null)}
        />
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
            const doneForProduct = productContenus.filter((c) => c.statut === 'poste').length;

            return (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
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
                  {doneForProduct > 0 && (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                      {doneForProduct} ✓
                    </span>
                  )}
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

                  {/* Contenus list */}
                  {productContenus.length > 0 && (
                    <div className="space-y-2">
                      {productContenus.map((c) => (
                        <div key={c.id} className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUT_COLOR[c.statut as ContenuStatut]}`}>
                            {STATUT_LABEL[c.statut as ContenuStatut]}
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
                            <option value="poste">Posté</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add contenu */}
                  <AddContenuDropdown
                    assignmentId={assignment.id}
                    productId={product.id}
                    productName={product.name}
                    adding={addingContenu}
                    onAdd={handleAddContenu}
                  />

                  {/* Drive actions */}
                  <div className="flex gap-2">
                    {ambassadrice.google_drive_url && (
                      <a
                        href={ambassadrice.google_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 text-center bg-blue-50 text-blue-700 font-bold rounded-xl text-xs border border-blue-200 hover:bg-blue-100 transition-colors"
                      >
                        📁 Ouvrir mon Drive
                      </a>
                    )}
                    {productContenus.some((c) => !c.drive_deposited) && (
                      <button
                        onClick={async () => {
                          for (const c of productContenus.filter((c) => !c.drive_deposited)) {
                            await handleUpdateContenu(c.id, { drive_deposited: true });
                          }
                        }}
                        className="flex-1 py-2.5 bg-emerald-50 text-emerald-700 font-bold rounded-xl text-xs border border-emerald-200 hover:bg-emerald-100 transition-colors"
                      >
                        ✓ Confirmer le dépôt Drive
                      </button>
                    )}
                    {productContenus.length > 0 && productContenus.every((c) => c.drive_deposited) && (
                      <span className="flex-1 py-2.5 text-center text-emerald-600 font-bold text-xs">
                        ✅ Tous déposés sur Drive
                      </span>
                    )}
                  </div>
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
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10">
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
