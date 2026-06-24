'use client';

import { useState, useEffect, useCallback } from 'react';
import { SEGMENTS, type SegmentKey } from '@/lib/segmentationService';
import Icon from '@/components/ui/AppIcon';

interface SendResult {
  ok: boolean;
  envoyes?: number;
  erreurs?: number;
  channel?: string;
  error?: string;
}

interface POSMarketingPanelProps {
  onClose: () => void;
}

export default function POSMarketingPanel({ onClose }: POSMarketingPanelProps) {
  const [segment, setSegment] = useState<SegmentKey>('tous');
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);

  const loadCount = useCallback(async (seg: SegmentKey) => {
    setClientCount(null);
    try {
      const res = await fetch(`/api/marketing/segment-preview?segment=${encodeURIComponent(seg)}`);
      if (res.ok) {
        const data = await res.json();
        setClientCount(data.count ?? 0);
      }
    } catch {}
  }, []);

  useEffect(() => { loadCount(segment); }, [segment, loadCount]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/generate-campaign-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessage(data.message);
        if (!campaignName) {
          const segInfo = SEGMENTS.find(s => s.key === segment);
          const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
          setCampaignName(`${segInfo?.label ?? segment} — ${today}`);
        }
      }
    } catch {}
    setGenerating(false);
  };

  const handleSend = async () => {
    if (!message.trim() || !campaignName.trim()) return;
    setSending(true);
    setResult(null);
    try {
      const createRes = await fetch('/api/marketing/campagnes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: campaignName, segment, message }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) { setResult({ ok: false, error: createData.error }); setSending(false); return; }

      const sendRes = await fetch(`/api/marketing/campagnes/${createData.id}/envoyer`, { method: 'POST' });
      const sendData = await sendRes.json();
      setResult(sendRes.ok
        ? { ok: true, envoyes: sendData.envoyes, erreurs: sendData.erreurs }
        : { ok: false, error: sendData.error }
      );
    } catch (e: any) {
      setResult({ ok: false, error: e.message });
    }
    setSending(false);
  };

  const segInfo = SEGMENTS.find(s => s.key === segment);
  const charCount = message.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="h-full w-full max-w-sm bg-white shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' }}>
          <div>
            <h2 className="text-white font-bold text-base">Marketing IA</h2>
            <p className="text-white/75 text-xs mt-0.5">Campagnes — segmentation clientes</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/35 text-white transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Segment grid */}
          <div>
            <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Segment cible</p>
            <div className="grid grid-cols-2 gap-1.5">
              {SEGMENTS.map(s => (
                <button
                  key={s.key}
                  onClick={() => { setSegment(s.key); setResult(null); }}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs font-500 text-left transition-colors ${segment === s.key ? 'border-pink-400 bg-pink-50 text-pink-700' : 'border-border hover:bg-muted/60 text-foreground'}`}
                >
                  <span className="text-sm">{s.icon}</span>
                  <span className="truncate">{s.label}</span>
                </button>
              ))}
            </div>

            {/* Client count badge */}
            <div className="mt-3 rounded-xl border border-pink-100 bg-pink-50 px-4 py-3 text-center">
              {clientCount === null ? (
                <div className="flex items-center justify-center gap-2 text-pink-400">
                  <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                  <span className="text-sm">Chargement...</span>
                </div>
              ) : (
                <>
                  <p className="text-2xl font-900 text-pink-600">{clientCount}</p>
                  <p className="text-xs text-pink-500 mt-0.5">
                    {segInfo?.label ?? segment} · {clientCount === 1 ? '1 cliente' : `${clientCount} clientes`}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Message */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide">Message</p>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
              >
                <Icon name="SparklesIcon" size={12} />
                {generating ? 'Génération IA...' : '✨ Générer avec IA'}
              </button>
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder={`Bonjour {prénom} 👋\n\nVotre message ici...\n\nLe Monde de l'Esthétique 💅`}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">
                Utilisez <code className="bg-muted px-1 rounded text-[10px]">{'{prénom}'}</code> pour personnaliser
              </p>
              <span className={`text-xs font-mono ${charCount > 160 ? 'text-orange-500 font-600' : 'text-muted-foreground'}`}>
                {charCount}/160
              </span>
            </div>
          </div>

          {/* Campaign name */}
          <div>
            <p className="text-xs font-700 text-muted-foreground uppercase tracking-wide mb-2">Nom de la campagne</p>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="ex: Promo Été Juin 2026"
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          {/* Result */}
          {result && (
            <div className={`rounded-xl p-3.5 text-sm border ${result.ok ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
              {result.ok
                ? `✅ ${result.envoyes} message${(result.envoyes ?? 0) > 1 ? 's' : ''} envoyé${(result.envoyes ?? 0) > 1 ? 's' : ''}${(result.erreurs ?? 0) > 0 ? ` · ${result.erreurs} erreur(s)` : ''}`
                : `❌ ${result.error}`}
            </div>
          )}

          {/* Link to full marketing page */}
          <a
            href="/marketing"
            target="_blank"
            className="flex items-center justify-center gap-2 w-full py-2 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <Icon name="ArrowTopRightOnSquareIcon" size={13} />
            Ouvrir le portail marketing complet
          </a>
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border bg-muted/20">
          <button
            onClick={handleSend}
            disabled={sending || !message.trim() || !campaignName.trim() || clientCount === 0 || clientCount === null}
            className="w-full bg-pink-500 hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-700 py-3 rounded-xl text-sm transition-colors"
          >
            {sending
              ? '📤 Envoi en cours...'
              : clientCount !== null
                ? `📤 Envoyer à ${clientCount} cliente${clientCount > 1 ? 's' : ''}`
                : '📤 Envoyer la campagne'}
          </button>
        </div>
      </div>
    </div>
  );
}
