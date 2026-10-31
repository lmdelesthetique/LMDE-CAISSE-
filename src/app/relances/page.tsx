'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { normalizePhone } from '@/lib/utils/phoneUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type Canal = 'whatsapp' | 'mail';

interface PendingC {
  type: 'C';
  devis_id: string;
  devis_numero: string;
  client_id: string;
  client_prenom: string;
  client_wa: string | null;
  client_email: string | null;
  etape: string;
  canal: Canal;
  template_id: string;
  step_date: string;
  overdue: boolean;
  corps: string;
  sujet: string | null;
  apercu: string | null;
  lien_fiche: string;
  timeline: Array<{ etape: string; canal: Canal; delai_jours: number; step_date: string; sent_at: string | null; statut: string | null }>;
}

interface PendingSeq {
  type: 'A' | 'B' | 'D' | 'E';
  sequence_id: string;
  client_id: string;
  client_prenom: string;
  client_wa: string | null;
  client_email: string | null;
  devis_id: string | null;
  devis_numero: string | null;
  etape_actuelle: string | null;
  next_etape: string;
  next_canal: Canal;
  next_delai: number;
  days_in_sequence: number;
  is_due: boolean;
  template_id: string;
  corps: string;
  sujet: string | null;
  apercu: string | null;
  started_at: string;
}

interface Template {
  id: string;
  sequence: string;
  etape: string;
  canal: Canal;
  delai_jours: number;
  sujet: string | null;
  apercu: string | null;
  corps: string;
  actif: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function etapeLabel(etape: string): string {
  const map: Record<string, string> = {
    j1: 'J+1', j2: 'J+2', j3: 'J+3', j5: 'J+5', j7: 'J+7', j10: 'J+10', j14: 'J+14',
    j_moins_7: 'J−7', j_moins_5: 'J−5', j_moins_3: 'J−3', j_0: 'J',
    j_plus_3: 'J+3', j_plus_15: 'J+15', j_plus_25: 'J+25',
    j60: 'J+60', j75: 'J+75', j90: 'J+90',
  };
  return map[etape] ?? etape;
}

function seqLabel(s: string): string {
  return { A: 'Invitation fiche', B: 'Fiche non validée', C: 'Réassort', D: 'Dormante', E: 'Après achat' }[s] ?? s;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ─── Modal édition mail ───────────────────────────────────────────────────────

function MailModal({ item, onSend, onClose }: {
  item: PendingC | PendingSeq;
  onSend: (sujet: string, corps: string) => Promise<void>;
  onClose: () => void;
}) {
  const [sujet, setSujet] = useState(item.sujet ?? '');
  const [corps, setCorps] = useState(item.corps);
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!sujet.trim() || !corps.trim()) { toast.error('Sujet et corps requis'); return; }
    setSending(true);
    try { await onSend(sujet, corps); } finally { setSending(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-sm font-700">Envoyer mail à {item.client_prenom}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Destinataire</label>
            <p className="text-sm text-foreground">{(item as any).client_email ?? '—'}</p>
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Sujet</label>
            <input value={sujet} onChange={(e) => setSujet(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div>
            <label className="text-xs font-600 text-muted-foreground block mb-1">Corps du message</label>
            <textarea rows={12} value={corps} onChange={(e) => setCorps(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none font-mono" />
          </div>
        </div>
        <div className="p-4 border-t flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 hover:bg-muted/40">Annuler</button>
          <button onClick={handleSend} disabled={sending}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-40">
            {sending ? 'Envoi…' : '✉️ Envoyer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Carte relance ────────────────────────────────────────────────────────────

function RelanceCard({ item, onSent, onIgnored }: {
  item: PendingC | PendingSeq;
  onSent: (item: PendingC | PendingSeq) => Promise<void>;
  onIgnored: (item: PendingC | PendingSeq) => Promise<void>;
}) {
  const [showMail, setShowMail] = useState(false);
  const [done, setDone] = useState(false);

  const sendMail = async (sujet: string, corps: string) => {
    const canal = item.type === 'C' ? (item as PendingC).canal : (item as PendingSeq).next_canal;
    const email = canal === 'mail' ? item.client_email : null;
    if (!email) { toast.error('Pas d\'email pour cette cliente'); return; }
    const res = await fetch('/api/relances/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, sujet, corps, prenom: item.client_prenom }),
    });
    if (!res.ok) { toast.error('Erreur envoi mail'); return; }
    toast.success(`Mail envoyé à ${item.client_prenom}`);
    setShowMail(false);
    try { await onSent(item); } catch { toast.error('Relance non enregistrée en base'); }
    setDone(true);
  };

  const openWA = () => {
    const wa = item.client_wa;
    if (!wa) { toast.error('Pas de numéro WhatsApp'); return; }
    const number = normalizePhone(wa);
    const text = encodeURIComponent(item.corps);
    window.open(`https://wa.me/${number}?text=${text}`, '_blank');
  };

  const isC = item.type === 'C';
  const isOverdue = isC && (item as PendingC).overdue;
  const etape = isC ? (item as PendingC).etape : (item as PendingSeq).next_etape;
  const canal = isC ? (item as PendingC).canal : (item as PendingSeq).next_canal;

  if (done) return null;

  return (
    <>
      <div className={`rounded-xl border p-4 space-y-3 ${isOverdue ? 'border-orange-200 bg-orange-50/40' : 'border-border bg-white'}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-700 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Séq. {item.type} — {seqLabel(item.type)}</span>
            <span className={`text-xs font-700 px-2 py-0.5 rounded-full ${canal === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
              {canal === 'whatsapp' ? '📱 WhatsApp' : '✉️ Mail'} · {etapeLabel(etape)}
            </span>
            {isOverdue && <span className="text-xs font-600 text-orange-600">⚠ En retard</span>}
          </div>
          {isC && <span className="text-xs text-muted-foreground shrink-0">{fmtDate((item as PendingC).step_date)}</span>}
        </div>

        {/* Client + devis */}
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-700 text-primary shrink-0">
            {item.client_prenom[0]?.toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-700">{item.client_prenom}</p>
            {(isC ? (item as PendingC).devis_numero : (item as PendingSeq).devis_numero) && (
              <p className="text-xs text-muted-foreground">{isC ? (item as PendingC).devis_numero : (item as PendingSeq).devis_numero}</p>
            )}
          </div>
        </div>

        {/* Message preview */}
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-line">{item.corps}</p>
        </div>

        {/* Timeline (Seq C only) */}
        {isC && (
          <div className="flex gap-1.5 flex-wrap">
            {(item as PendingC).timeline.map((t) => (
              <span key={t.etape}
                className={`text-[10px] px-1.5 py-0.5 rounded font-600 ${
                  t.sent_at ? 'bg-emerald-100 text-emerald-700' :
                  t.etape === etape ? 'bg-indigo-500 text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                {etapeLabel(t.etape)}{t.sent_at ? ' ✓' : ''}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {canal === 'whatsapp' ? (
            <button onClick={openWA}
              className="flex-1 py-2 bg-emerald-500 text-white rounded-lg text-sm font-700 hover:bg-emerald-600 transition-colors">
              📱 Ouvrir WhatsApp
            </button>
          ) : (
            <button onClick={() => setShowMail(true)}
              className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-sm font-700 hover:bg-blue-600 transition-colors">
              ✉️ Voir & envoyer le mail
            </button>
          )}
          <button onClick={async () => {
              try { await onSent(item); setDone(true); }
              catch { toast.error('Erreur enregistrement'); }
            }}
            className="px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-xs font-600 hover:bg-emerald-100 transition-colors whitespace-nowrap">
            ✓ Marquer envoyé
          </button>
          <button onClick={async () => {
              try { await onIgnored(item); setDone(true); }
              catch { toast.error('Erreur enregistrement'); }
            }}
            className="px-3 py-2 border border-border text-muted-foreground rounded-lg text-xs font-600 hover:bg-muted/40 transition-colors">
            Ignorer
          </button>
        </div>
      </div>

      {showMail && <MailModal item={item} onSend={sendMail} onClose={() => setShowMail(false)} />}
    </>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function RelancesPage() {
  const [tab, setTab] = useState<'today' | 'templates'>('today');
  const [loading, setLoading] = useState(true);
  const [pendingC, setPendingC] = useState<PendingC[]>([]);
  const [pendingSeq, setPendingSeq] = useState<PendingSeq[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editTpl, setEditTpl] = useState<Template | null>(null);
  const [savingTpl, setSavingTpl] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/relances/today');
      const data = await res.json();
      setPendingC(data.pending_c ?? []);
      setPendingSeq(data.pending_sequences ?? []);
    } catch { toast.error('Erreur chargement relances'); }
    finally { setLoading(false); }
  }, []);

  const loadTemplates = useCallback(async () => {
    const res = await fetch('/api/relances/templates');
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'templates') loadTemplates(); }, [tab, loadTemplates]);

  const logRelance = async (item: PendingC | PendingSeq, statut: 'envoye' | 'ignore') => {
    const isC = item.type === 'C';
    const res = await fetch('/api/relances/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        devis_id: isC ? (item as PendingC).devis_id : (item as PendingSeq).devis_id,
        client_id: item.client_id,
        sequence: item.type,
        etape: isC ? (item as PendingC).etape : (item as PendingSeq).next_etape,
        canal: isC ? (item as PendingC).canal : (item as PendingSeq).next_canal,
        statut,
        sequence_id: !isC ? (item as PendingSeq).sequence_id : undefined,
      }),
    });
    if (!res.ok) throw new Error(await res.text());
  };

  const onSent = async (item: PendingC | PendingSeq) => {
    await logRelance(item, 'envoye');
    if (item.type === 'C') {
      setPendingC((prev) => prev.filter((x) => !(x.devis_id === (item as PendingC).devis_id && x.etape === (item as PendingC).etape)));
    } else {
      setPendingSeq((prev) => prev.filter((x) => (x as PendingSeq).sequence_id !== (item as PendingSeq).sequence_id));
    }
  };

  const onIgnored = async (item: PendingC | PendingSeq) => {
    await logRelance(item, 'ignore');
    if (item.type === 'C') {
      setPendingC((prev) => prev.filter((x) => !(x.devis_id === (item as PendingC).devis_id && x.etape === (item as PendingC).etape)));
    } else {
      setPendingSeq((prev) => prev.filter((x) => (x as PendingSeq).sequence_id !== (item as PendingSeq).sequence_id));
    }
  };

  const saveTpl = async () => {
    if (!editTpl) return;
    setSavingTpl(true);
    const res = await fetch('/api/relances/templates', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editTpl.id, sujet: editTpl.sujet, apercu: editTpl.apercu, corps: editTpl.corps, actif: editTpl.actif }),
    });
    setSavingTpl(false);
    if (res.ok) { toast.success('Template sauvegardé'); setEditTpl(null); loadTemplates(); }
    else { toast.error('Erreur sauvegarde'); }
  };

  const total = pendingC.length + pendingSeq.filter((s) => s.is_due).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-700">Relances pro</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          <div className="flex items-center gap-2">
            {total > 0 && (
              <span className="bg-primary text-primary-foreground text-xs font-700 px-2 py-1 rounded-full">{total} action{total > 1 ? 's' : ''}</span>
            )}
            <button onClick={load} className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted/40">↻ Actualiser</button>
          </div>
        </div>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 pb-0">
          {(['today', 'templates'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-xs font-600 border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {t === 'today' ? '📋 Relances du jour' : '📝 Templates'}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* ── Onglet Du jour ── */}
        {tab === 'today' && (
          <>
            {loading ? (
              <div className="text-center py-16 text-muted-foreground text-sm">Chargement…</div>
            ) : (
              <>
                {/* Section C — Réassort */}
                {pendingC.length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-xs font-700 uppercase tracking-wide text-muted-foreground">Réassort mensuel — {pendingC.length} action{pendingC.length > 1 ? 's' : ''}</h2>
                    {pendingC.map((item, i) => (
                      <RelanceCard key={`${item.devis_id}-${item.etape}-${i}`} item={item} onSent={onSent} onIgnored={onIgnored} />
                    ))}
                  </section>
                )}

                {/* Section Séquences A/B dues */}
                {pendingSeq.filter((s) => s.is_due).length > 0 && (
                  <section className="space-y-3">
                    <h2 className="text-xs font-700 uppercase tracking-wide text-muted-foreground">Séquences — {pendingSeq.filter(s => s.is_due).length} action{pendingSeq.filter(s => s.is_due).length > 1 ? 's' : ''}</h2>
                    {pendingSeq.filter((s) => s.is_due).map((item) => (
                      <RelanceCard key={item.sequence_id} item={item} onSent={onSent} onIgnored={onIgnored} />
                    ))}
                  </section>
                )}

                {/* Section Séquences pas encore dues */}
                {pendingSeq.filter((s) => !s.is_due).length > 0 && (
                  <section className="space-y-2">
                    <h2 className="text-xs font-700 uppercase tracking-wide text-muted-foreground">En attente (pas encore due)</h2>
                    {pendingSeq.filter((s) => !s.is_due).map((item) => (
                      <div key={item.sequence_id} className="rounded-xl border border-dashed border-border p-3 flex items-center justify-between gap-2">
                        <div>
                          <span className="text-xs font-700">{item.client_prenom}</span>
                          <span className="text-xs text-muted-foreground ml-2">Séq. {item.type} · {etapeLabel(item.next_etape)} dans {item.next_delai - item.days_in_sequence}j</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{item.next_canal === 'whatsapp' ? '📱' : '✉️'}</span>
                      </div>
                    ))}
                  </section>
                )}

                {total === 0 && !loading && (
                  <div className="text-center py-20">
                    <p className="text-3xl mb-3">✅</p>
                    <p className="text-base font-700">Rien à envoyer aujourd'hui</p>
                    <p className="text-sm text-muted-foreground mt-1">Toutes les relances sont à jour.</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Onglet Templates ── */}
        {tab === 'templates' && (
          <section className="space-y-3">
            <p className="text-xs text-muted-foreground">Modifie les templates ici — les changements sont pris en compte immédiatement.</p>
            {['A', 'B', 'C', 'D', 'E'].map((seq) => {
              const seqTpls = templates.filter((t) => t.sequence === seq);
              if (!seqTpls.length) return null;
              return (
                <div key={seq} className="border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/40 px-4 py-2 border-b border-border">
                    <h3 className="text-xs font-700 uppercase tracking-wide">Séquence {seq} — {seqLabel(seq)}</h3>
                  </div>
                  <div className="divide-y divide-border">
                    {seqTpls.map((tpl) => (
                      <div key={tpl.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-700">{etapeLabel(tpl.etape)}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-600 ${tpl.canal === 'whatsapp' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                              {tpl.canal === 'whatsapp' ? '📱' : '✉️'} {tpl.canal}
                            </span>
                            {!tpl.actif && <span className="text-[10px] text-muted-foreground">(inactif)</span>}
                          </div>
                          {tpl.sujet && <p className="text-xs text-muted-foreground truncate">{tpl.sujet}</p>}
                          <p className="text-xs text-muted-foreground truncate">{tpl.corps.slice(0, 80)}…</p>
                        </div>
                        <button onClick={() => setEditTpl({ ...tpl })}
                          className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted/40 shrink-0">
                          Modifier
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        )}
      </div>

      {/* ── Modal édition template ── */}
      {editTpl && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-sm font-700">Template Séq. {editTpl.sequence} · {etapeLabel(editTpl.etape)}</h2>
              <button onClick={() => setEditTpl(null)} className="text-muted-foreground hover:text-foreground text-lg">✕</button>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                <label className="text-xs font-600">Actif</label>
                <input type="checkbox" checked={editTpl.actif}
                  onChange={(e) => setEditTpl((t) => t ? { ...t, actif: e.target.checked } : t)} />
              </div>
              {editTpl.canal === 'mail' && (
                <>
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Sujet</label>
                    <input value={editTpl.sujet ?? ''}
                      onChange={(e) => setEditTpl((t) => t ? { ...t, sujet: e.target.value } : t)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-600 text-muted-foreground block mb-1">Aperçu</label>
                    <input value={editTpl.apercu ?? ''}
                      onChange={(e) => setEditTpl((t) => t ? { ...t, apercu: e.target.value } : t)}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none" />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs font-600 text-muted-foreground block mb-1">Corps du message</label>
                <p className="text-[10px] text-muted-foreground mb-1">Variables : {'{'}prénom{'}'} · {'{'}produits{'}'} · {'{'}montant{'}'} · {'{'}date{'}'} · {'{'}conseil{'}'} · {'{'}lien_fiche{'}'}</p>
                <textarea rows={14} value={editTpl.corps}
                  onChange={(e) => setEditTpl((t) => t ? { ...t, corps: e.target.value } : t)}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none resize-none font-mono" />
              </div>
            </div>
            <div className="p-4 border-t flex gap-3">
              <button onClick={() => setEditTpl(null)} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600">Annuler</button>
              <button onClick={saveTpl} disabled={savingTpl}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 disabled:opacity-40">
                {savingTpl ? 'Sauvegarde…' : '✓ Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
