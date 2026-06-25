'use client';

import { useState } from 'react';

interface SpiraleStrategy {
  diagnostic: {
    ca_evolution: string;
    segment_plus_actif: string;
    segment_a_risque: string;
    produit_star: string;
    produit_dormant_prioritaire: string;
    alerte?: string | null;
  };
  offres_groupees: {
    nom: string;
    produits: string[];
    prix_normal: number;
    prix_offre: number;
    economie: number;
    cible: string;
    argument: string;
    canal: string;
    urgence: string;
  }[];
  spirale_semaine: {
    produit_vedette: string;
    j1_lundi: { type: string; angle: string; hook: string; canal: string; mot_cle_manychat: string };
    j2_mardi: { type: string; angle: string; hook: string; canal: string };
    j3_mercredi: { type: string; message_whatsapp: string; segment_cible: string };
    j4_jeudi: { type: string; contenu: string; hashtags: string };
    j5_vendredi: { type: string; produits_live: string[]; mots_cles_manychat: string[]; phrase_ouverture: string; offre_exclusive_live: string };
  };
  kit_ambassadrices: {
    produit: string;
    hooks: string[];
    script_reel: string;
    script_story: string;
    temoignage: string;
    legende: string;
    mot_cle_manychat: string;
  };
  reactivation: {
    segment: string;
    nb_clientes: number;
    ca_potentiel: string;
    message_whatsapp: string;
    offre: string;
    duree_offre: string;
    suivi_j3: string;
  };
  alertes_stock: {
    ruptures: { produit: string; action: string }[];
    dormants: { produit: string; stock: number; action: string }[];
    stars_a_pousser: { produit: string; action: string }[];
  };
  cycle_modele: {
    phase_actuelle: string;
    phase_suivante: string;
    raison: string;
    action_concrete: string;
  };
  tendances_mois?: {
    analyse: string;
    periode_creuse: string;
    periode_forte: string;
    facteur_risque: string;
    evolution_vs_mois_precedent: string;
    ca_par_semaine: { semaine: number; jours: string; ca: number; nb_tickets: number }[];
  };
  plan_preventif?: {
    declencheur: string;
    semaine_cible: string;
    action: string;
    canal: string;
    message_ou_contenu: string;
    objectif: string;
  }[];
  recommandations: string[];
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="shrink-0 text-[10px] font-600 px-2 py-1 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      {copied ? '✓ Copié' : 'Copier'}
    </button>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-border rounded-xl p-4 ${className}`}>{children}</div>;
}

function SectionTitle({ emoji, title, color = 'text-foreground' }: { emoji: string; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-lg">{emoji}</span>
      <h3 className={`font-700 text-sm ${color}`}>{title}</h3>
    </div>
  );
}

const PHASE_COLORS: Record<string, string> = {
  attirer: 'bg-blue-100 text-blue-700 border-blue-200',
  convertir: 'bg-amber-100 text-amber-700 border-amber-200',
  fideliser: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ambassadrice: 'bg-pink-100 text-pink-700 border-pink-200',
};

const PHASES = ['attirer', 'convertir', 'fideliser', 'ambassadrice'];
const PHASE_EMOJIS: Record<string, string> = { attirer: '📣', convertir: '💰', fideliser: '💎', ambassadrice: '⭐' };

export default function MDLEStrategiePanel() {
  const [strategy, setStrategy] = useState<SpiraleStrategy | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setStrategy(null);
    setSendResult(null);
    try {
      const res = await fetch('/api/ai/spirale-mdle', { method: 'POST' });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setStrategy(data.strategy);
      setUsedMock(data.usedMock ?? false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendReactivation = async () => {
    if (!strategy?.reactivation?.message_whatsapp) return;
    setSending(true);
    setSendResult(null);
    try {
      const createRes = await fetch('/api/marketing/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: `Réactivation MDLE — ${new Date().toLocaleDateString('fr-FR')}`,
          segment: 'inactifs_90j',
          message: strategy.reactivation.message_whatsapp.replace(/\{\{prenom\}\}/g, '{prénom}'),
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setSendResult(`❌ ${createData.error}`); return; }
      const sendRes = await fetch(`/api/marketing/campagnes/${createData.id}/envoyer`, { method: 'POST' });
      const sendData = await sendRes.json();
      setSendResult(sendRes.ok ? `✅ ${sendData.envoyes} messages envoyés` : `❌ ${sendData.error}`);
    } catch (e: any) {
      setSendResult(`❌ ${e.message}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #ec4899 100%)' }}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🌀</span>
          <div>
            <h3 className="text-[14px] font-700 text-white">Stratégie MDLE</h3>
            <p className="text-white/60 text-[10px]">Spirale Marketing — Plan complet semaine</p>
          </div>
          {usedMock && strategy && (
            <span className="text-[10px] bg-white/20 text-white border border-white/30 font-500 px-1.5 py-0.5 rounded-full">démo</span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-600 disabled:opacity-60 transition-colors border border-white/30"
        >
          {loading ? (
            <><div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />Analyse...</>
          ) : (
            <><span>🤖</span>{strategy ? 'Régénérer' : 'Générer la stratégie'}</>
          )}
        </button>
      </div>

      {error && <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>}

      {!strategy && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
          <p className="text-5xl mb-3">🌀</p>
          <p className="text-sm font-600 text-foreground mb-1">Stratégie Spirale MDLE</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Analyse IA complète : diagnostic, plan J1→J5, kit ambassadrices, réactivation clients, alertes stock, cycle modèle
          </p>
          <button
            onClick={generate}
            className="mt-4 px-5 py-2.5 rounded-xl text-white text-sm font-600 transition-colors"
            style={{ background: 'linear-gradient(135deg, #4f46e5, #ec4899)' }}
          >
            🤖 Générer la stratégie
          </button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <div className="w-10 h-10 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Claude analyse vos données...</p>
          <p className="text-xs text-muted-foreground">CA, stocks, segments, top produits...</p>
        </div>
      )}

      {strategy && !loading && (
        <div className="p-4 space-y-5">

          {/* ── DIAGNOSTIC ─────────────────────────────────────────────────────── */}
          {strategy.diagnostic?.alerte && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <span className="text-red-500 text-sm shrink-0">🚨</span>
              <p className="text-sm text-red-700 font-500">{strategy.diagnostic.alerte}</p>
            </div>
          )}

          <Card>
            <SectionTitle emoji="📊" title="Diagnostic" color="text-violet-700" />
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Évolution CA', value: strategy.diagnostic.ca_evolution, color: 'bg-blue-50 border-blue-100 text-blue-700' },
                { label: 'Segment actif', value: strategy.diagnostic.segment_plus_actif, color: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
                { label: 'Segment à risque', value: strategy.diagnostic.segment_a_risque, color: 'bg-red-50 border-red-100 text-red-700' },
                { label: 'Produit star ⭐', value: strategy.diagnostic.produit_star, color: 'bg-amber-50 border-amber-100 text-amber-700' },
                { label: 'Produit dormant 😴', value: strategy.diagnostic.produit_dormant_prioritaire, color: 'bg-orange-50 border-orange-100 text-orange-700' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl border p-3 ${item.color}`}>
                  <p className="text-[10px] font-600 opacity-70 mb-1">{item.label}</p>
                  <p className="text-xs font-700 leading-tight">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ── PLAN J1→J5 ─────────────────────────────────────────────────────── */}
          <Card>
            <SectionTitle emoji="📅" title={`Plan de la semaine — Produit vedette : ${strategy.spirale_semaine?.produit_vedette}`} color="text-indigo-700" />
            <div className="space-y-2">
              {[
                {
                  day: 'J1 Lundi', emoji: '🎬', color: 'border-l-blue-400 bg-blue-50',
                  content: strategy.spirale_semaine?.j1_lundi,
                  render: (j: any) => (
                    <>
                      <p className="font-600 text-xs text-blue-800">{j.type} — {j.canal}</p>
                      <p className="text-xs text-blue-700 mt-0.5">Hook : <span className="font-700">"{j.hook}"</span></p>
                      <p className="text-[10px] text-blue-600 mt-0.5">Mot-clé ManyChat : <code className="bg-blue-100 px-1 rounded font-mono">{j.mot_cle_manychat}</code></p>
                    </>
                  ),
                },
                {
                  day: 'J2 Mardi', emoji: '📱', color: 'border-l-purple-400 bg-purple-50',
                  content: strategy.spirale_semaine?.j2_mardi,
                  render: (j: any) => (
                    <>
                      <p className="font-600 text-xs text-purple-800">{j.type} — {j.canal}</p>
                      <p className="text-xs text-purple-700 mt-0.5">Hook : <span className="font-700">"{j.hook}"</span></p>
                    </>
                  ),
                },
                {
                  day: 'J3 Mercredi', emoji: '💬', color: 'border-l-green-400 bg-green-50',
                  content: strategy.spirale_semaine?.j3_mercredi,
                  render: (j: any) => (
                    <>
                      <p className="font-600 text-xs text-green-800">{j.type} → {j.segment_cible}</p>
                      <div className="flex items-start gap-2 mt-1">
                        <p className="text-xs text-green-700 flex-1">"{j.message_whatsapp}"</p>
                        <CopyButton text={j.message_whatsapp} />
                      </div>
                    </>
                  ),
                },
                {
                  day: 'J4 Jeudi', emoji: '🖼️', color: 'border-l-amber-400 bg-amber-50',
                  content: strategy.spirale_semaine?.j4_jeudi,
                  render: (j: any) => (
                    <>
                      <p className="font-600 text-xs text-amber-800">{j.type}</p>
                      <p className="text-xs text-amber-700 mt-0.5">{j.contenu}</p>
                      <p className="text-[10px] text-amber-600 mt-0.5">{j.hashtags}</p>
                    </>
                  ),
                },
                {
                  day: 'J5 Vendredi', emoji: '🔴', color: 'border-l-red-400 bg-red-50',
                  content: strategy.spirale_semaine?.j5_vendredi,
                  render: (j: any) => (
                    <>
                      <p className="font-600 text-xs text-red-800">{j.type}</p>
                      <p className="text-xs text-red-700 mt-0.5 italic">"{j.phrase_ouverture}"</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(j.mots_cles_manychat ?? []).map((m: string, i: number) => (
                          <code key={i} className="bg-red-100 text-red-700 text-[10px] px-1.5 py-0.5 rounded font-mono">{m}</code>
                        ))}
                      </div>
                      <p className="text-[10px] text-red-600 mt-1">🎁 Offre live : {j.offre_exclusive_live}</p>
                    </>
                  ),
                },
              ].map(({ day, emoji, color, content, render }) => content ? (
                <div key={day} className={`border-l-4 rounded-r-xl px-3 py-2.5 ${color}`}>
                  <p className="text-[10px] font-700 text-muted-foreground mb-1">{emoji} {day}</p>
                  {render(content)}
                </div>
              ) : null)}
            </div>
          </Card>

          {/* ── OFFRES GROUPÉES ─────────────────────────────────────────────────── */}
          {strategy.offres_groupees?.length > 0 && (
            <Card>
              <SectionTitle emoji="🎁" title="Offres Groupées Recommandées" color="text-pink-700" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {strategy.offres_groupees.map((offre, i) => (
                  <div key={i} className="border border-pink-100 rounded-xl p-3 bg-pink-50">
                    <div className="flex items-start justify-between mb-2">
                      <p className="font-700 text-sm text-pink-800">{offre.nom}</p>
                      {offre.economie > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-700 px-2 py-0.5 rounded-full shrink-0 ml-2">-{offre.economie}€</span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                      {offre.prix_normal > 0 && <span className="text-xs text-muted-foreground line-through">{offre.prix_normal}€</span>}
                      {offre.prix_offre > 0 && <span className="text-base font-900 text-pink-700">{offre.prix_offre}€</span>}
                    </div>
                    <p className="text-[10px] text-pink-700 mb-1">🎯 {offre.cible}</p>
                    <p className="text-[10px] text-pink-600 mb-1">📢 {offre.canal} · ⏱ {offre.urgence}</p>
                    <p className="text-[10px] text-pink-600 italic">{offre.argument}</p>
                    {offre.produits?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {offre.produits.map((p, j) => (
                          <span key={j} className="bg-pink-100 text-pink-700 text-[10px] px-1.5 py-0.5 rounded-lg font-500">{p}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── KIT AMBASSADRICES ────────────────────────────────────────────────── */}
          {strategy.kit_ambassadrices && (
            <Card>
              <SectionTitle emoji="⭐" title={`Kit Ambassadrices — ${strategy.kit_ambassadrices.produit}`} color="text-amber-700" />
              <div className="space-y-3">
                {/* Hooks */}
                <div>
                  <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide mb-2">Hooks (accroches)</p>
                  <div className="space-y-1.5">
                    {strategy.kit_ambassadrices.hooks?.map((hook, i) => (
                      <div key={i} className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                        <span className="text-amber-500 font-700 text-sm shrink-0">{i + 1}.</span>
                        <p className="text-xs text-amber-800 flex-1 font-500">"{hook}"</p>
                        <CopyButton text={hook} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Scripts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide">Script Reel 60s</p>
                      <CopyButton text={strategy.kit_ambassadrices.script_reel} />
                    </div>
                    <div className="bg-muted/30 rounded-xl p-3 text-xs text-foreground leading-relaxed">
                      {strategy.kit_ambassadrices.script_reel}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide">Script Story 15s</p>
                      <CopyButton text={strategy.kit_ambassadrices.script_story} />
                    </div>
                    <div className="bg-muted/30 rounded-xl p-3 text-xs text-foreground leading-relaxed">
                      {strategy.kit_ambassadrices.script_story}
                    </div>
                  </div>
                </div>

                {/* Légende + Témoignage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide">Légende prête à copier</p>
                      <CopyButton text={strategy.kit_ambassadrices.legende} />
                    </div>
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800 whitespace-pre-wrap leading-relaxed">
                      {strategy.kit_ambassadrices.legende}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-700 text-muted-foreground uppercase tracking-wide">Témoignage type</p>
                      <CopyButton text={strategy.kit_ambassadrices.temoignage} />
                    </div>
                    <div className="bg-muted/30 rounded-xl p-3 text-xs text-foreground italic leading-relaxed">
                      "{strategy.kit_ambassadrices.temoignage}"
                    </div>
                  </div>
                </div>

                <div className="bg-amber-100 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  <p className="text-[10px] text-amber-700">Mot-clé ManyChat :</p>
                  <code className="text-sm font-900 text-amber-800">{strategy.kit_ambassadrices.mot_cle_manychat}</code>
                </div>
              </div>
            </Card>
          )}

          {/* ── RÉACTIVATION ─────────────────────────────────────────────────────── */}
          {strategy.reactivation && (
            <Card>
              <SectionTitle emoji="💤" title={`Réactivation — ${strategy.reactivation.segment}`} color="text-blue-700" />
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                  <p className="text-xl font-900 text-blue-600">{strategy.reactivation.nb_clientes}</p>
                  <p className="text-[10px] text-blue-500">clientes à relancer</p>
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center">
                  <p className="text-sm font-700 text-emerald-600">{strategy.reactivation.ca_potentiel}</p>
                  <p className="text-[10px] text-emerald-500">CA potentiel</p>
                </div>
                <div className="bg-pink-50 border border-pink-100 rounded-xl p-3 text-center">
                  <p className="text-sm font-700 text-pink-600">{strategy.reactivation.offre}</p>
                  <p className="text-[10px] text-pink-500">offre · {strategy.reactivation.duree_offre}</p>
                </div>
              </div>

              <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-3">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 text-sm">💬</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-700 text-green-700 mb-1">Message WhatsApp prêt à envoyer</p>
                    <p className="text-xs text-green-800 leading-relaxed">"{strategy.reactivation.message_whatsapp}"</p>
                  </div>
                  <CopyButton text={strategy.reactivation.message_whatsapp} />
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground mb-3">
                📌 Suivi J+3 : {strategy.reactivation.suivi_j3}
              </p>

              {sendResult ? (
                <div className={`rounded-xl p-3 text-sm text-center ${sendResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {sendResult}
                </div>
              ) : (
                <button
                  onClick={handleSendReactivation}
                  disabled={sending}
                  className="w-full py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-600 transition-colors"
                >
                  {sending ? '📤 Envoi en cours...' : `📤 Envoyer à ${strategy.reactivation.nb_clientes} inactives via WhatsApp`}
                </button>
              )}
            </Card>
          )}

          {/* ── ALERTES STOCK ────────────────────────────────────────────────────── */}
          {strategy.alertes_stock && (
            <Card>
              <SectionTitle emoji="📦" title="Alertes Stock" color="text-orange-700" />
              <div className="space-y-4">
                {strategy.alertes_stock.ruptures?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-700 text-red-600 uppercase tracking-wide mb-2">🔴 Ruptures — Commander en urgence</p>
                    <div className="space-y-1.5">
                      {strategy.alertes_stock.ruptures.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                          <span className="text-red-500 text-xs font-700 shrink-0">!</span>
                          <div className="min-w-0">
                            <p className="text-xs font-700 text-red-800">{item.produit}</p>
                            <p className="text-[10px] text-red-600">{item.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {strategy.alertes_stock.dormants?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-700 text-orange-600 uppercase tracking-wide mb-2">🟠 Dormants — Écouler le stock</p>
                    <div className="space-y-1.5">
                      {strategy.alertes_stock.dormants.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                          <span className="text-orange-500 text-xs shrink-0">📦</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-700 text-orange-800">{item.produit} <span className="font-400 text-orange-600">({item.stock} en stock)</span></p>
                            <p className="text-[10px] text-orange-600">{item.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {strategy.alertes_stock.stars_a_pousser?.length > 0 && (
                  <div>
                    <p className="text-[10px] font-700 text-emerald-600 uppercase tracking-wide mb-2">🟢 Stars — Doubler les commandes</p>
                    <div className="space-y-1.5">
                      {strategy.alertes_stock.stars_a_pousser.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                          <span className="text-emerald-500 text-xs shrink-0">⭐</span>
                          <div className="min-w-0">
                            <p className="text-xs font-700 text-emerald-800">{item.produit}</p>
                            <p className="text-[10px] text-emerald-600">{item.action}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* ── CYCLE MODÈLE ─────────────────────────────────────────────────────── */}
          {strategy.cycle_modele && (
            <Card>
              <SectionTitle emoji="🔄" title="Cycle Modèle MDLE" color="text-violet-700" />
              <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-1">
                {PHASES.map((phase, i) => {
                  const isActive = phase === strategy.cycle_modele?.phase_actuelle;
                  const isNext = phase === strategy.cycle_modele?.phase_suivante;
                  return (
                    <div key={phase} className="flex items-center shrink-0">
                      <div className={`flex flex-col items-center px-3 py-2 rounded-xl border text-center ${isActive ? PHASE_COLORS[phase] : isNext ? 'bg-muted/50 border-border border-dashed' : 'bg-muted/20 border-border opacity-40'}`}>
                        <span className="text-base">{PHASE_EMOJIS[phase]}</span>
                        <p className="text-[10px] font-700 capitalize mt-0.5">{phase}</p>
                        {isActive && <span className="text-[9px] font-700 bg-current/10 px-1.5 rounded-full mt-0.5">← Vous êtes ici</span>}
                        {isNext && <span className="text-[9px] text-muted-foreground mt-0.5">→ Prochaine</span>}
                      </div>
                      {i < PHASES.length - 1 && <span className="text-muted-foreground text-sm mx-1">→</span>}
                    </div>
                  );
                })}
              </div>
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 space-y-2">
                <p className="text-xs text-violet-800"><span className="font-700">Pourquoi :</span> {strategy.cycle_modele.raison}</p>
                <p className="text-xs text-violet-700"><span className="font-700">Action concrète :</span> {strategy.cycle_modele.action_concrete}</p>
              </div>
            </Card>
          )}

          {/* ── TENDANCES DU MOIS ────────────────────────────────────────────────── */}
          {strategy.tendances_mois && (
            <Card>
              <SectionTitle emoji="📈" title="Tendances CA du Mois" color="text-sky-700" />
              {/* Mini bar chart */}
              {Array.isArray(strategy.tendances_mois?.ca_par_semaine) && strategy.tendances_mois!.ca_par_semaine.length > 0 && (() => {
                const weeks = strategy.tendances_mois!.ca_par_semaine;
                const maxCA = Math.max(...weeks.map(w => w.ca), 1);
                const creuse: string = strategy.tendances_mois!.periode_creuse ?? '';
                const forte: string = strategy.tendances_mois!.periode_forte ?? '';
                return (
                  <div className="mb-4">
                    <div className="flex items-end gap-2 h-20 mb-2">
                      {weeks.map((w) => {
                        const pct = Math.round((w.ca / maxCA) * 100);
                        const isCreuse = creuse.includes(`Semaine ${w.semaine}`);
                        const isForte = forte.includes(`Semaine ${w.semaine}`);
                        return (
                          <div key={w.semaine} className="flex-1 flex flex-col items-center gap-1">
                            <p className="text-[9px] text-muted-foreground font-600">{w.ca > 0 ? `${w.ca.toFixed(0)}€` : '—'}</p>
                            <div className="w-full rounded-t-md transition-all" style={{
                              height: `${Math.max(pct, 4)}%`,
                              background: isCreuse ? '#ef4444' : isForte ? '#10b981' : '#6366f1',
                            }} />
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      {weeks.map(w => (
                        <div key={w.semaine} className="flex-1 text-center">
                          <p className="text-[9px] font-700 text-muted-foreground">S{w.semaine}</p>
                          <p className="text-[8px] text-muted-foreground/70">{w.jours}</p>
                          <p className="text-[8px] text-muted-foreground/60">{w.nb_tickets} ventes</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-2 text-[9px]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />Plus forte</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500 inline-block" />Plus creuse</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-indigo-500 inline-block" />Normale</span>
                    </div>
                  </div>
                );
              })()}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-3">
                  <p className="text-[10px] font-700 text-sky-600 mb-1">Évolution vs mois précédent</p>
                  <p className="text-sm font-700 text-sky-800">{strategy.tendances_mois.evolution_vs_mois_precedent}</p>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-[10px] font-700 text-red-600 mb-1">Facteur de risque identifié</p>
                  <p className="text-xs text-red-800">{strategy.tendances_mois.facteur_risque}</p>
                </div>
              </div>
              <div className="bg-muted/20 rounded-xl p-3">
                <p className="text-xs text-foreground leading-relaxed">{strategy.tendances_mois.analyse}</p>
              </div>
            </Card>
          )}

          {/* ── PLAN PRÉVENTIF ANTI-CHUTE ─────────────────────────────────────────── */}
          {strategy.plan_preventif && strategy.plan_preventif.length > 0 && (
            <Card>
              <SectionTitle emoji="🛡️" title="Plan Préventif — Anticiper les Chutes de CA" color="text-orange-700" />
              <div className="space-y-3">
                {strategy.plan_preventif.map((action, i) => (
                  <div key={i} className="border border-orange-100 rounded-xl p-3 bg-orange-50">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] font-900 flex items-center justify-center shrink-0">{i + 1}</span>
                        <p className="text-xs font-700 text-orange-800">{action.semaine_cible}</p>
                      </div>
                      <span className="text-[10px] bg-orange-200 text-orange-700 font-600 px-2 py-0.5 rounded-full shrink-0">{action.canal}</span>
                    </div>
                    <p className="text-[10px] text-orange-600 mb-2">
                      <span className="font-700">Déclencheur :</span> {action.declencheur}
                    </p>
                    <p className="text-xs text-orange-800 font-600 mb-1">{action.action}</p>
                    <div className="bg-white/70 border border-orange-100 rounded-lg px-3 py-2 mb-2">
                      <div className="flex items-start gap-2">
                        <p className="text-xs text-orange-700 flex-1 italic">"{action.message_ou_contenu}"</p>
                        <CopyButton text={action.message_ou_contenu} />
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 font-600">🎯 Objectif : {action.objectif}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* ── RECOMMANDATIONS ──────────────────────────────────────────────────── */}
          {strategy.recommandations?.length > 0 && (
            <Card>
              <SectionTitle emoji="🎯" title="3 Actions Prioritaires Cette Semaine" color="text-foreground" />
              <div className="space-y-2">
                {strategy.recommandations.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start bg-muted/20 rounded-xl px-3 py-2.5">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-900 text-white shrink-0" style={{ background: ['#4f46e5', '#7c3aed', '#ec4899'][i] ?? '#4f46e5' }}>
                      {i + 1}
                    </span>
                    <p className="text-sm text-foreground leading-relaxed">{r}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
