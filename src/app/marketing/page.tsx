'use client';

import { useState, useEffect, useCallback } from 'react';
import { SEGMENTS, type SegmentKey, type SegmentInfo } from '@/lib/segmentationService';

interface Campaign {
  id: string;
  nom: string;
  segment: string;
  message: string;
  statut: 'brouillon' | 'en_cours' | 'terminee' | 'erreur';
  total_clients: number;
  envoyes: number;
  erreurs: number;
  created_at: string;
  sent_at?: string;
}

interface DashboardStats {
  segmentStats: Record<SegmentKey, number>;
  campaigns: Campaign[];
  totalCampaigns: number;
  totalSent: number;
  successRate: number;
}

interface AiStrategy {
  resume: string;
  segments_prioritaires: { segment: string; raison: string; action: string }[];
  messages_suggeres: { segment: string; message: string }[];
  calendrier: { semaine: number; action: string }[];
  kpi_cibles: { taux_ouverture: string; taux_conversion: string; ca_additionnel_estime: string };
  conseil_principal: string;
}

type Tab = 'creer' | 'historique' | 'ia';

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  terminee: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
  erreur: { label: 'Erreur', color: 'bg-red-100 text-red-700' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('creer');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Créer campaign form
  const [nom, setNom] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('tous');
  const [message, setMessage] = useState('');
  const [segmentPreview, setSegmentPreview] = useState<{ count: number; preview: { id: string; name: string; phone: string }[] } | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; envoyes?: number; erreurs?: number; error?: string } | null>(null);

  // AI strategy
  const [aiStrategy, setAiStrategy] = useState<AiStrategy | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMock, setAiMock] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/marketing/dashboard-stats');
      if (res.ok) setStats(await res.json());
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadSegmentPreview = useCallback(async (seg: SegmentKey) => {
    setSegmentLoading(true);
    setSegmentPreview(null);
    try {
      const res = await fetch(`/api/marketing/segment-preview?segment=${encodeURIComponent(seg)}`);
      if (res.ok) setSegmentPreview(await res.json());
    } finally {
      setSegmentLoading(false);
    }
  }, []);

  useEffect(() => { loadSegmentPreview(segment); }, [segment, loadSegmentPreview]);

  const handleCreate = async () => {
    if (!nom.trim() || !message.trim()) return;
    setCreating(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/marketing/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom, segment, message }),
      });
      const data = await res.json();
      if (!res.ok) { setSendResult({ ok: false, error: data.error }); return; }

      // Immediately send
      setSendingId(data.id);
      const sendRes = await fetch(`/api/marketing/campagnes/${data.id}/envoyer`, { method: 'POST' });
      const sendData = await sendRes.json();
      if (sendRes.ok) {
        setSendResult({ ok: true, envoyes: sendData.envoyes, erreurs: sendData.erreurs });
        setNom(''); setMessage('');
        loadStats();
      } else {
        setSendResult({ ok: false, error: sendData.error });
      }
    } finally {
      setCreating(false);
      setSendingId(null);
    }
  };

  const handleResend = async (id: string) => {
    setSendingId(id);
    setSendResult(null);
    try {
      const res = await fetch(`/api/marketing/campagnes/${id}/envoyer`, { method: 'POST' });
      const data = await res.json();
      setSendResult(res.ok ? { ok: true, envoyes: data.envoyes, erreurs: data.erreurs } : { ok: false, error: data.error });
      if (res.ok) loadStats();
    } finally {
      setSendingId(null);
    }
  };

  const handleAiStrategy = async () => {
    setAiLoading(true);
    setAiStrategy(null);
    try {
      const res = await fetch('/api/ai/marketing-strategy', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setAiStrategy(data.strategy);
        setAiMock(data.usedMock ?? false);
      }
    } finally {
      setAiLoading(false);
    }
  };

  const segInfo = SEGMENTS.find(s => s.key === segment);
  const charCount = message.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Portail Marketing</h1>
        <p className="text-muted-foreground text-sm mt-1">Campagnes WhatsApp — segmentation clientes — stratégie IA</p>
      </div>

      {/* KPI row */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Clientes totales', value: stats.segmentStats['tous'] ?? 0, color: 'text-blue-600' },
            { label: 'Campagnes envoyées', value: stats.totalCampaigns, color: 'text-pink-600' },
            { label: 'Messages envoyés', value: stats.totalSent, color: 'text-green-600' },
            { label: 'Taux de succès', value: `${stats.successRate}%`, color: 'text-purple-600' },
          ].map(k => (
            <div key={k.label} className="bg-white border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
        {([
          { id: 'creer', label: '📣 Créer une campagne' },
          { id: 'historique', label: '📋 Historique' },
          { id: 'ia', label: '🤖 Analyse IA' },
        ] as { id: Tab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === t.id ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: Créer ── */}
      {activeTab === 'creer' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form */}
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-border rounded-xl p-5 space-y-4">
              <h2 className="font-semibold text-foreground">Nouvelle campagne WhatsApp</h2>

              {/* Nom */}
              <div>
                <label className="text-sm font-medium text-foreground">Nom de la campagne</label>
                <input
                  type="text"
                  value={nom}
                  onChange={e => setNom(e.target.value)}
                  placeholder="ex: Promo Été Juin 2026"
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>

              {/* Segment */}
              <div>
                <label className="text-sm font-medium text-foreground">Segment cible</label>
                <select
                  value={segment}
                  onChange={e => setSegment(e.target.value as SegmentKey)}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  {SEGMENTS.map(s => (
                    <option key={s.key} value={s.key}>
                      {s.icon} {s.label} {stats?.segmentStats[s.key] !== undefined ? `(${stats.segmentStats[s.key]})` : ''}
                    </option>
                  ))}
                </select>
                {segInfo && <p className="text-xs text-muted-foreground mt-1">{segInfo.description}</p>}
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Message WhatsApp</label>
                  <span className={`text-xs font-mono ${charCount > 160 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                    {charCount}/160
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={5}
                  placeholder={`Bonjour {prénom} 👋\n\nVotre message ici...\n\nLe Monde de l'Esthétique 💅`}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Utilisez <code className="bg-muted px-1 rounded">{'{prénom}'}</code> pour personnaliser chaque message.
                </p>
              </div>

              {/* Result feedback */}
              {sendResult && (
                <div className={`rounded-lg p-3 text-sm ${sendResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {sendResult.ok
                    ? `✅ Campagne envoyée — ${sendResult.envoyes} messages envoyés${sendResult.erreurs ? `, ${sendResult.erreurs} erreurs` : ''}`
                    : `❌ Erreur : ${sendResult.error}`}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || !nom.trim() || !message.trim()}
                className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {creating ? (sendingId ? '📤 Envoi en cours...' : '⏳ Création...') : '📤 Créer et envoyer'}
              </button>
            </div>
          </div>

          {/* Segment preview */}
          <div className="space-y-4">
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3">Aperçu du segment</h3>
              {segmentLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">Chargement...</div>
              ) : segmentPreview ? (
                <>
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center mb-4">
                    <p className="text-3xl font-bold text-pink-600">{segmentPreview.count}</p>
                    <p className="text-xs text-pink-700">clientes dans ce segment</p>
                  </div>
                  {segmentPreview.preview.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exemples</p>
                      {segmentPreview.preview.map(c => (
                        <div key={c.id} className="flex items-center gap-2 text-sm">
                          <div className="w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold shrink-0">
                            {(c.name[0] || '?').toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.name || 'Cliente'}</p>
                            <p className="text-xs text-muted-foreground">{c.phone}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            {/* All segments quick view */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3">Tous les segments</h3>
              <div className="space-y-1.5">
                {SEGMENTS.map(s => (
                  <button
                    key={s.key}
                    onClick={() => setSegment(s.key)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition-colors ${segment === s.key ? 'bg-pink-50 text-pink-700' : 'hover:bg-muted text-foreground'}`}
                  >
                    <span>{s.icon} {s.label}</span>
                    <span className="font-mono text-xs font-bold">
                      {stats?.segmentStats[s.key] ?? '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: Historique ── */}
      {activeTab === 'historique' && (
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Historique des campagnes</h2>
            <button onClick={loadStats} className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5">
              Actualiser
            </button>
          </div>

          {statsLoading ? (
            <div className="text-center py-12 text-muted-foreground">Chargement...</div>
          ) : !stats?.campaigns?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-4xl mb-3">📭</p>
              <p>Aucune campagne envoyée</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {['Campagne', 'Segment', 'Statut', 'Clientes', 'Envoyés', 'Erreurs', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.campaigns.map(c => {
                    const seg = SEGMENTS.find(s => s.key === c.segment);
                    const st = STATUT_LABELS[c.statut] ?? STATUT_LABELS['brouillon'];
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.nom}</td>
                        <td className="px-4 py-3 text-muted-foreground">{seg ? `${seg.icon} ${seg.label}` : c.segment}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">{c.total_clients}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-green-600 font-medium">{c.envoyes}</td>
                        <td className="px-4 py-3 text-center tabular-nums text-red-500">{c.erreurs}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{c.sent_at ? fmtDate(c.sent_at) : fmtDate(c.created_at)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleResend(c.id)}
                            disabled={!!sendingId || c.statut === 'en_cours'}
                            className="text-xs border border-border rounded-lg px-2.5 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {sendingId === c.id ? '⏳' : '🔄 Renvoyer'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sendResult && (
            <div className={`m-4 rounded-lg p-3 text-sm ${sendResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
              {sendResult.ok
                ? `✅ ${sendResult.envoyes} messages envoyés${sendResult.erreurs ? `, ${sendResult.erreurs} erreurs` : ''}`
                : `❌ ${sendResult.error}`}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Analyse IA ── */}
      {activeTab === 'ia' && (
        <div className="space-y-5">
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-foreground">Stratégie Marketing IA</h2>
                <p className="text-sm text-muted-foreground mt-1">Analyse de vos segments et recommandations personnalisées</p>
              </div>
              <button
                onClick={handleAiStrategy}
                disabled={aiLoading}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {aiLoading ? '⏳ Analyse...' : '🤖 Générer la stratégie'}
              </button>
            </div>

            {!aiStrategy && !aiLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-5xl mb-4">🤖</p>
                <p className="font-medium">Cliquez sur "Générer la stratégie" pour obtenir une analyse IA de votre base clientes</p>
                <p className="text-xs mt-2">Basée sur vos {stats?.segmentStats['tous'] ?? 0} clientes et leurs comportements d'achat</p>
              </div>
            )}

            {aiLoading && (
              <div className="text-center py-12 text-muted-foreground">
                <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>Analyse de vos données en cours...</p>
              </div>
            )}

            {aiStrategy && (
              <div className="space-y-5">
                {aiMock && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                    ⚠️ Stratégie de démonstration — Configurez <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> pour des analyses IA personnalisées
                  </div>
                )}

                {/* Résumé */}
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-800 mb-1">📊 Résumé</h3>
                  <p className="text-sm text-purple-700">{aiStrategy.resume}</p>
                </div>

                {/* Conseil principal */}
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <h3 className="font-semibold text-pink-800 mb-1">💡 Conseil principal</h3>
                  <p className="text-sm text-pink-700">{aiStrategy.conseil_principal}</p>
                </div>

                {/* KPI */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Taux d\'ouverture', value: aiStrategy.kpi_cibles?.taux_ouverture },
                    { label: 'Taux de conversion', value: aiStrategy.kpi_cibles?.taux_conversion },
                    { label: 'CA additionnel estimé', value: aiStrategy.kpi_cibles?.ca_additionnel_estime },
                  ].map(k => (
                    <div key={k.label} className="bg-white border border-border rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-foreground">{k.value ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  ))}
                </div>

                {/* Segments prioritaires */}
                {aiStrategy.segments_prioritaires?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">🎯 Segments prioritaires</h3>
                    <div className="space-y-3">
                      {aiStrategy.segments_prioritaires.map((sp, i) => {
                        const seg = SEGMENTS.find(s => s.key === sp.segment);
                        return (
                          <div key={i} className="bg-white border border-border rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">{seg?.icon ?? '📌'}</span>
                              <div className="flex-1">
                                <p className="font-medium text-foreground">{seg?.label ?? sp.segment}</p>
                                <p className="text-sm text-muted-foreground mt-0.5">{sp.raison}</p>
                                <div className="mt-2 bg-green-50 border border-green-200 rounded-md px-3 py-1.5">
                                  <p className="text-sm text-green-700">✅ {sp.action}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Messages suggérés */}
                {aiStrategy.messages_suggeres?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">💬 Messages suggérés</h3>
                    <div className="space-y-3">
                      {aiStrategy.messages_suggeres.map((ms, i) => {
                        const seg = SEGMENTS.find(s => s.key === ms.segment);
                        return (
                          <div key={i} className="bg-white border border-border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-foreground">
                                {seg ? `${seg.icon} ${seg.label}` : ms.segment}
                              </span>
                              <button
                                onClick={() => { setSegment((ms.segment as SegmentKey) || 'tous'); setMessage(ms.message); setActiveTab('creer'); }}
                                className="text-xs bg-pink-500 text-white px-3 py-1 rounded-lg hover:bg-pink-600 transition-colors"
                              >
                                Utiliser ce message
                              </button>
                            </div>
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted rounded-md p-3">
                              {ms.message}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Calendrier */}
                {aiStrategy.calendrier?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">📅 Calendrier recommandé</h3>
                    <div className="space-y-2">
                      {aiStrategy.calendrier.map((cal, i) => (
                        <div key={i} className="flex items-start gap-3 bg-white border border-border rounded-lg p-3">
                          <span className="w-16 shrink-0 text-xs font-bold text-purple-600 bg-purple-50 rounded-md px-2 py-1 text-center">S{cal.semaine}</span>
                          <p className="text-sm text-foreground">{cal.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
