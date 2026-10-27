'use client';

import { useState, useEffect, useCallback } from 'react';
import { SEGMENTS, type SegmentKey, type SegmentInfo } from '@/lib/segmentationService';

type Channel = 'sms+email' | 'sms' | 'email';
type SelectionMode = 'segment' | 'manual';

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

interface ClientResult {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
}

type Tab = 'creer' | 'historique' | 'ia';

// ── Template bank ────────────────────────────────────────────────────────────
const TEMPLATE_BANK: {
  category: string;
  icon: string;
  templates: { label: string; segment: SegmentKey; channel: Channel; message: string }[];
}[] = [
  {
    category: 'Relance',
    icon: '🔄',
    templates: [
      {
        label: 'Tu nous manques',
        segment: 'inactifs_90j',
        channel: 'sms+email',
        message: `Coucou {prénom} 👋\n\nOn ne t'a pas vue depuis un moment... Tu nous manques ! 💕\n\nNouveautés en stock, passe nous voir ou réponds à ce message 🌸\n\nLe Monde de l'Esthétique 💅`,
      },
      {
        label: 'Relance 6 mois',
        segment: 'inactifs_6mois',
        channel: 'sms+email',
        message: `Bonjour {prénom} 🌸\n\nCela fait longtemps qu'on ne t'a pas vue... On espère que tu vas bien ! 😊\n\nDe nouvelles arrivées t'attendent chez Le Monde de l'Esthétique ✨\n\nUne surprise t'attend à ta prochaine visite 🎁\n\nÀ très bientôt !`,
      },
    ],
  },
  {
    category: 'Offres & Promos',
    icon: '🎉',
    templates: [
      {
        label: 'Promotion spéciale',
        segment: 'tous',
        channel: 'sms+email',
        message: `Bonjour {prénom} 🎉\n\n✨ OFFRE SPÉCIALE ✨\n\n[Décrivez votre offre ici]\n\nValable jusqu'au [date]. Ne passe pas à côté ! 💅\n\nLe Monde de l'Esthétique`,
      },
      {
        label: 'Vente flash SMS',
        segment: 'tous',
        channel: 'sms',
        message: `🚨 VENTE FLASH {prénom} !\n\n-[X]% sur [produits] aujourd'hui seulement ! ⚡\n\nRéponds OUI pour réserver. Stock limité ! 📦\n\nLMDE 💅`,
      },
      {
        label: 'Soldes / Fin de saison',
        segment: 'actifs_30j',
        channel: 'sms+email',
        message: `Coucou {prénom} 🛍️\n\nLes soldes sont là ! 🎉\n\nJusqu'à -[X]% sur une sélection de produits en magasin.\n\nDépêche-toi, les stocks sont limités !\n\nLe Monde de l'Esthétique 💕`,
      },
    ],
  },
  {
    category: 'Nouveautés',
    icon: '🌟',
    templates: [
      {
        label: 'Nouvelles arrivées',
        segment: 'actifs_30j',
        channel: 'sms+email',
        message: `Coucou {prénom} 🌟\n\nOn a pensé à toi ! De nouvelles arrivées viennent d'entrer en stock 😍\n\n[Description des nouveautés]\n\nDisponibles dès maintenant chez Le Monde de l'Esthétique ✨\n\nBisous 💕`,
      },
      {
        label: 'Nouveau produit exclusif',
        segment: 'vip',
        channel: 'email',
        message: `Bonjour {prénom} 💎\n\nEn avant-première pour nos clientes fidèles, découvrez notre nouvelle exclusivité ✨\n\n[Nom du produit — description]\n\nDisponible en exclusivité en magasin avant tout le monde 🔒\n\nLe Monde de l'Esthétique`,
      },
    ],
  },
  {
    category: 'Fidélité',
    icon: '⭐',
    templates: [
      {
        label: 'Points fidélité accumulés',
        segment: 'points_eleves',
        channel: 'sms+email',
        message: `Bonjour {prénom} ⭐\n\nBonne nouvelle ! Tu as accumulé des points de fidélité chez nous 🎁\n\nPasse en magasin pour en profiter — une remise t'attend sur ta prochaine visite ! 💅\n\nLe Monde de l'Esthétique ✨`,
      },
      {
        label: 'Offre VIP exclusive',
        segment: 'vip',
        channel: 'email',
        message: `Bonjour {prénom} 💎\n\nEn tant que cliente VIP du Monde de l'Esthétique, tu bénéficies d'un avantage exclusif ✨\n\n[Détail de l'offre VIP]\n\nMerci pour ta fidélité précieuse 🌸\n\nL'équipe LMDE 💕`,
      },
    ],
  },
  {
    category: 'Abonnement',
    icon: '📦',
    templates: [
      {
        label: 'Invitation abonnement',
        segment: 'sans_abonnement',
        channel: 'sms+email',
        message: `Bonjour {prénom} 💅\n\nSavais-tu que nos clientes abonnées reçoivent leur Box Beauté chaque mois avec des produits sélectionnés rien que pour elles ? 📦✨\n\nAbonne-toi dès aujourd'hui et profite de [avantage] !\n\nContacte-nous pour en savoir plus 🌸\n\nLe Monde de l'Esthétique`,
      },
      {
        label: 'Bienvenue nouvelle cliente',
        segment: 'nouvelles',
        channel: 'sms+email',
        message: `Bienvenue {prénom} 🌸\n\nToute l'équipe du Monde de l'Esthétique est ravie de t'accueillir parmi nos clientes ! 💕\n\nTu bénéficies d'un avantage de bienvenue lors de ta prochaine visite 🎁\n\nN'hésite pas à nous contacter pour toute question ✨\n\nLe Monde de l'Esthétique`,
      },
    ],
  },
];

// ── Segment display helper ────────────────────────────────────────────────────
function parseSegmentStr(raw: string): { key: string; channel: Channel; ids: string[] | null } {
  const parts = raw.split('|');
  const key = parts[0];
  const isChannel = (s?: string): s is Channel => s === 'sms' || s === 'email' || s === 'sms+email';
  if (key === 'custom') {
    if (parts.length >= 3 && isChannel(parts[1])) return { key, channel: parts[1], ids: parts[2].split(',').filter(Boolean) };
    if (parts.length >= 2) return { key, channel: 'sms+email', ids: parts[1].split(',').filter(Boolean) };
    return { key, channel: 'sms+email', ids: [] };
  }
  return { key, channel: isChannel(parts[1]) ? parts[1] : 'sms+email', ids: null };
}

function segmentDisplay(raw: string): string {
  const { key, channel, ids } = parseSegmentStr(raw);
  const channelLabel = channel === 'sms' ? ' · SMS' : channel === 'email' ? ' · Email' : '';
  if (key === 'custom') return `🎯 Sélection manuelle (${ids?.length ?? 0} clientes)${channelLabel}`;
  const seg = SEGMENTS.find(s => s.key === key);
  return seg ? `${seg.icon} ${seg.label}${channelLabel}` : raw;
}

const STATUT_LABELS: Record<string, { label: string; color: string }> = {
  brouillon: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  en_cours: { label: 'En cours', color: 'bg-blue-100 text-blue-700' },
  terminee: { label: 'Terminée', color: 'bg-green-100 text-green-700' },
  erreur: { label: 'Erreur', color: 'bg-red-100 text-red-700' },
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function safeJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { error: `Réponse invalide du serveur: ${text.slice(0, 120)}` }; }
}

function clientName(c: ClientResult): string {
  const f = c.first_name?.trim() ?? '';
  const l = c.last_name?.trim() ?? '';
  if (f && !/^\d+$/.test(f)) return `${f} ${l}`.trim();
  return l || c.phone || 'Cliente';
}

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>('creer');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Form state
  const [nom, setNom] = useState('');
  const [segment, setSegment] = useState<SegmentKey>('tous');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<Channel>('sms+email');
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('segment');

  // Manual client selection
  const [manualSearch, setManualSearch] = useState('');
  const [manualResults, setManualResults] = useState<ClientResult[]>([]);
  const [manualSearchLoading, setManualSearchLoading] = useState(false);
  const [selectedClients, setSelectedClients] = useState<ClientResult[]>([]);

  // Template bank
  const [showTemplates, setShowTemplates] = useState(false);

  // Send state
  const [segmentPreview, setSegmentPreview] = useState<{ count: number; preview: { id: string; name: string; phone: string }[] } | null>(null);
  const [segmentLoading, setSegmentLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<{ ok: boolean; envoyes?: number; erreurs?: number; smsSent?: number; emailSent?: number; error?: string } | null>(null);

  // AI
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

  useEffect(() => {
    if (selectionMode === 'segment') loadSegmentPreview(segment);
  }, [segment, selectionMode, loadSegmentPreview]);

  // Debounced client search
  useEffect(() => {
    if (manualSearch.length < 2) { setManualResults([]); return; }
    const t = setTimeout(async () => {
      setManualSearchLoading(true);
      try {
        const res = await fetch(`/api/marketing/client-search?q=${encodeURIComponent(manualSearch)}`);
        if (res.ok) {
          const data: ClientResult[] = await res.json();
          setManualResults(data.filter(c => !selectedClients.find(s => s.id === c.id)));
        }
      } finally { setManualSearchLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [manualSearch, selectedClients]);

  const addClient = (c: ClientResult) => {
    if (selectedClients.find(s => s.id === c.id)) return;
    setSelectedClients(prev => [...prev, c]);
    setManualSearch('');
    setManualResults([]);
  };

  const removeClient = (id: string) => setSelectedClients(prev => prev.filter(c => c.id !== id));

  const applyTemplate = (t: typeof TEMPLATE_BANK[0]['templates'][0]) => {
    setMessage(t.message);
    setChannel(t.channel);
    if (selectionMode === 'segment') setSegment(t.segment);
    setShowTemplates(false);
  };

  const handleCreate = async () => {
    if (!nom.trim() || !message.trim()) return;
    if (selectionMode === 'manual' && selectedClients.length === 0) {
      setSendResult({ ok: false, error: 'Sélectionnez au moins une cliente' });
      return;
    }
    setCreating(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/marketing/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom,
          segment,
          message,
          channel,
          client_ids: selectionMode === 'manual' ? selectedClients.map(c => c.id) : undefined,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) { setSendResult({ ok: false, error: data.error }); return; }

      setSendingId(data.id);
      const sendRes = await fetch(`/api/marketing/campagnes/${data.id}/envoyer`, { method: 'POST' });
      const sendData = await safeJson(sendRes);
      if (sendRes.ok) {
        setSendResult({ ok: true, envoyes: sendData.envoyes, erreurs: sendData.erreurs, smsSent: sendData.smsSent, emailSent: sendData.emailSent });
        setNom(''); setMessage(''); setSelectedClients([]); setManualSearch('');
        loadStats();
      } else {
        setSendResult({ ok: false, error: sendData.error });
      }
    } catch (e: any) {
      setSendResult({ ok: false, error: e.message });
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
      const data = await safeJson(res);
      setSendResult(res.ok ? { ok: true, envoyes: data.envoyes, erreurs: data.erreurs, smsSent: data.smsSent, emailSent: data.emailSent } : { ok: false, error: data.error });
      if (res.ok) loadStats();
    } catch (e: any) {
      setSendResult({ ok: false, error: e.message });
    } finally {
      setSendingId(null);
    }
  };

  const handleAiStrategy = async () => {
    setAiLoading(true);
    setAiStrategy(null);
    try {
      const res = await fetch('/api/ai/marketing-strategy', { method: 'POST' });
      const data = await safeJson(res);
      if (res.ok) { setAiStrategy(data.strategy); setAiMock(data.usedMock ?? false); }
    } catch (e: any) {
      console.error('[ai-strategy]', e.message);
    } finally {
      setAiLoading(false);
    }
  };

  const segInfo = SEGMENTS.find(s => s.key === segment);
  const charCount = message.length;
  const canSend = nom.trim() && message.trim() && (selectionMode === 'segment' || selectedClients.length > 0);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Portail Marketing</h1>
        <p className="text-muted-foreground text-sm mt-1">Campagnes multi-canal (SMS + Email) — segmentation clientes — stratégie IA</p>
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
            <div className="bg-white border border-border rounded-xl p-5 space-y-5">
              <h2 className="font-semibold text-foreground">Nouvelle campagne</h2>

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

              {/* Canal d'envoi */}
              <div>
                <label className="text-sm font-medium text-foreground">Canal d'envoi</label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {([
                    { value: 'sms+email', label: '📱+✉️ SMS + Email', desc: 'Recommandé' },
                    { value: 'sms', label: '📱 SMS', desc: 'Numéro requis' },
                    { value: 'email', label: '✉️ Email', desc: 'Adresse requise' },
                  ] as { value: Channel; label: string; desc: string }[]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setChannel(opt.value)}
                      className={`flex flex-col items-center justify-center border rounded-xl px-2 py-2.5 text-sm font-medium transition-all ${
                        channel === opt.value
                          ? 'bg-pink-500 text-white border-pink-500 shadow'
                          : 'border-border text-muted-foreground hover:border-pink-300 hover:text-foreground'
                      }`}
                    >
                      <span className="text-base leading-tight">{opt.label}</span>
                      <span className={`text-[11px] mt-0.5 ${channel === opt.value ? 'text-pink-100' : 'text-muted-foreground'}`}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Clientes ciblées */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-foreground">Clientes ciblées</label>
                  <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => setSelectionMode('segment')}
                      className={`px-3 py-1.5 font-medium transition-colors ${selectionMode === 'segment' ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      📊 Segments
                    </button>
                    <button
                      onClick={() => setSelectionMode('manual')}
                      className={`px-3 py-1.5 font-medium transition-colors border-l border-border ${selectionMode === 'manual' ? 'bg-pink-500 text-white' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      🎯 Sélection manuelle
                    </button>
                  </div>
                </div>

                {selectionMode === 'segment' ? (
                  <>
                    <select
                      value={segment}
                      onChange={e => setSegment(e.target.value as SegmentKey)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                    >
                      {SEGMENTS.map(s => (
                        <option key={s.key} value={s.key}>
                          {s.icon} {s.label} {stats?.segmentStats[s.key] !== undefined ? `(${stats.segmentStats[s.key]})` : ''}
                        </option>
                      ))}
                    </select>
                    {segInfo && <p className="text-xs text-muted-foreground mt-1">{segInfo.description}</p>}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <input
                        type="text"
                        value={manualSearch}
                        onChange={e => setManualSearch(e.target.value)}
                        placeholder="Rechercher une cliente (prénom, nom, téléphone)..."
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 pr-8"
                      />
                      {manualSearchLoading && (
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>

                    {manualResults.length > 0 && (
                      <div className="border border-border rounded-lg overflow-hidden">
                        {manualResults.slice(0, 8).map(c => (
                          <button
                            key={c.id}
                            onClick={() => addClient(c)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-pink-50 transition-colors text-left border-b border-border last:border-b-0"
                          >
                            <div className="w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center text-pink-600 text-xs font-bold shrink-0">
                              {(clientName(c)[0] || '?').toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{clientName(c)}</p>
                              <p className="text-xs text-muted-foreground">{c.phone}{c.email ? ` · ${c.email}` : ''}</p>
                            </div>
                            <span className="text-xs text-pink-500 shrink-0">+ Ajouter</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {selectedClients.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1.5">{selectedClients.length} cliente{selectedClients.length > 1 ? 's' : ''} sélectionnée{selectedClients.length > 1 ? 's' : ''}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedClients.map(c => (
                            <span key={c.id} className="inline-flex items-center gap-1 bg-pink-100 text-pink-700 border border-pink-200 rounded-full px-2.5 py-1 text-xs font-medium">
                              {clientName(c)}
                              <button onClick={() => removeClient(c.id)} className="ml-0.5 hover:text-pink-900 font-bold leading-none">×</button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedClients.length === 0 && manualSearch.length < 2 && (
                      <p className="text-xs text-muted-foreground">Tapez au moins 2 caractères pour rechercher.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Message */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">Message</label>
                  <span className={`text-xs font-mono ${charCount > 160 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                    {charCount} car.{charCount > 160 ? ' (multi-SMS)' : ''}
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  rows={6}
                  placeholder={`Bonjour {prénom} 👋\n\nVotre message ici...\n\nLe Monde de l'Esthétique 💅`}
                  className="mt-1 w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                />
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs text-muted-foreground">
                    Utilisez <code className="bg-muted px-1 rounded">{'{prénom}'}</code> pour personnaliser.
                  </p>
                  <div className="flex items-center gap-1 ml-auto">
                    {(channel === 'sms+email' || channel === 'sms') && (
                      <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5">📱 SMS</span>
                    )}
                    {(channel === 'sms+email' || channel === 'email') && (
                      <span className="text-xs bg-purple-50 text-purple-600 border border-purple-200 rounded px-1.5 py-0.5">✉️ Email</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Template bank toggle */}
              <div>
                <button
                  onClick={() => setShowTemplates(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
                >
                  <span>{showTemplates ? '▲' : '▼'}</span>
                  📚 {showTemplates ? 'Masquer les modèles' : 'Choisir un modèle de message'}
                </button>

                {showTemplates && (
                  <div className="mt-3 border border-pink-200 rounded-xl bg-pink-50 p-4 space-y-4">
                    {TEMPLATE_BANK.map(cat => (
                      <div key={cat.category}>
                        <p className="text-xs font-semibold text-pink-800 uppercase tracking-wide mb-2">{cat.icon} {cat.category}</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {cat.templates.map(t => (
                            <button
                              key={t.label}
                              onClick={() => applyTemplate(t)}
                              className="text-left bg-white border border-pink-200 hover:border-pink-400 rounded-lg p-3 transition-all hover:shadow-sm"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-foreground">{t.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${t.channel === 'sms' ? 'bg-blue-50 text-blue-600 border-blue-200' : t.channel === 'email' ? 'bg-purple-50 text-purple-600 border-purple-200' : 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                                  {t.channel === 'sms' ? '📱' : t.channel === 'email' ? '✉️' : '📱+✉️'}
                                </span>
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">{t.message.split('\n').filter(Boolean)[0]}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Result feedback */}
              {sendResult && (
                <div className={`rounded-lg p-3 text-sm ${sendResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {sendResult.ok ? (
                    <div className="space-y-1">
                      <p className="font-medium">✅ Campagne envoyée — {sendResult.envoyes} clientes atteintes{sendResult.erreurs ? ` (${sendResult.erreurs} erreurs)` : ''}</p>
                      <div className="flex gap-3 text-xs opacity-80">
                        {sendResult.smsSent !== undefined && <span>📱 {sendResult.smsSent} SMS</span>}
                        {sendResult.emailSent !== undefined && <span>✉️ {sendResult.emailSent} emails</span>}
                      </div>
                    </div>
                  ) : `❌ Erreur : ${sendResult.error}`}
                </div>
              )}

              <button
                onClick={handleCreate}
                disabled={creating || !canSend}
                className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {creating ? (sendingId ? '📤 Envoi en cours...' : '⏳ Création...') : '📤 Créer et envoyer'}
              </button>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Aperçu */}
            <div className="bg-white border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground mb-3">
                {selectionMode === 'manual' ? 'Sélection manuelle' : 'Aperçu du segment'}
              </h3>

              {selectionMode === 'manual' ? (
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center">
                  <p className="text-3xl font-bold text-pink-600">{selectedClients.length}</p>
                  <p className="text-xs text-pink-700">cliente{selectedClients.length !== 1 ? 's' : ''} sélectionnée{selectedClients.length !== 1 ? 's' : ''}</p>
                  {selectedClients.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2">Recherchez et ajoutez des clientes ci-contre</p>
                  )}
                </div>
              ) : segmentLoading ? (
                <div className="text-center py-6 text-muted-foreground text-sm">Chargement...</div>
              ) : segmentPreview ? (
                <>
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 text-center mb-4">
                    <p className="text-3xl font-bold text-pink-600">{segmentPreview.count}</p>
                    <p className="text-xs text-pink-700">clientes dans ce segment</p>
                  </div>
                  {(segmentPreview.preview?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Exemples</p>
                      {(segmentPreview.preview ?? []).map(c => (
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

            {/* Segments quick view — only in segment mode */}
            {selectionMode === 'segment' && (
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
                      <span className="font-mono text-xs font-bold">{stats?.segmentStats[s.key] ?? '—'}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
                    {['Campagne', 'Segment / Sélection', 'Statut', 'Clientes', 'Envoyés', 'Erreurs', 'Date', 'Actions'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.campaigns.map(c => {
                    const st = STATUT_LABELS[c.statut] ?? STATUT_LABELS['brouillon'];
                    return (
                      <tr key={c.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{c.nom}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{segmentDisplay(c.segment)}</td>
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
              {sendResult.ok ? (
                <div className="space-y-1">
                  <p className="font-medium">✅ {sendResult.envoyes} clientes atteintes{sendResult.erreurs ? ` (${sendResult.erreurs} erreurs)` : ''}</p>
                  <div className="flex gap-3 text-xs opacity-80">
                    {sendResult.smsSent !== undefined && <span>📱 {sendResult.smsSent} SMS</span>}
                    {sendResult.emailSent !== undefined && <span>✉️ {sendResult.emailSent} emails</span>}
                  </div>
                </div>
              ) : `❌ ${sendResult.error}`}
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
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-800 mb-1">📊 Résumé</h3>
                  <p className="text-sm text-purple-700">{aiStrategy.resume}</p>
                </div>
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <h3 className="font-semibold text-pink-800 mb-1">💡 Conseil principal</h3>
                  <p className="text-sm text-pink-700">{aiStrategy.conseil_principal}</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Taux d'ouverture", value: aiStrategy.kpi_cibles?.taux_ouverture },
                    { label: 'Taux de conversion', value: aiStrategy.kpi_cibles?.taux_conversion },
                    { label: 'CA additionnel estimé', value: aiStrategy.kpi_cibles?.ca_additionnel_estime },
                  ].map(k => (
                    <div key={k.label} className="bg-white border border-border rounded-lg p-3 text-center">
                      <p className="text-xl font-bold text-foreground">{k.value ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  ))}
                </div>
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
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap font-mono bg-muted rounded-md p-3">{ms.message}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
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
