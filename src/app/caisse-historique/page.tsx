'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { fetchReceiptById, modifyTicket, fetchTicketModifications, type ReceiptRecord, type TicketModification } from '@/lib/services/posService';
import { sendReceiptEmail, type ReceiptEmailData } from '@/lib/services/emailService';
import { toast } from 'sonner';
import { generateTicketHTML, loadSettingsFromCache, openAndPrint } from '@/lib/utils/ticketPrinter';

interface TicketRow {
  id: string;
  ticket_number: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  client_name: string | null;
  items_count: number;
  status: string;
  cashier_name: string | null;
  discount_amount: number | null;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'SumUp (CB)',
  CB: 'SumUp (CB)',
  'SumUp (CB)': 'SumUp (CB)',
  Espèces: 'Espèces',
  Virement: 'Virement',
  Mixte: 'Mixte',
  mixed: 'Mixte',
  'Alma (3x/4x)': 'Alma',
  alma: 'Alma',
  check: 'Chèque',
  transfer: 'Virement',
  store_credit: 'Avoir',
  acompte: 'Acompte',
};

const METHOD_COLORS: Record<string, string> = {
  'SumUp (CB)': 'text-blue-700 bg-blue-50 border-blue-200',
  'Espèces': 'text-emerald-700 bg-emerald-50 border-emerald-200',
  'Virement': 'text-cyan-700 bg-cyan-50 border-cyan-200',
  'Mixte': 'text-purple-700 bg-purple-50 border-purple-200',
  'Alma': 'text-pink-700 bg-pink-50 border-pink-200',
  'Chèque': 'text-amber-700 bg-amber-50 border-amber-200',
  'Avoir': 'text-rose-700 bg-rose-50 border-rose-200',
  'Acompte': 'text-orange-700 bg-orange-50 border-orange-200',
};

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

type PeriodFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

function getPeriodDates(period: PeriodFilter, customFrom: string, customTo: string): { from: string; to: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString();

  if (period === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'week') {
    const start = new Date(now);
    start.setDate(now.getDate() - 7);
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: toISO(start), to: toISO(now) };
  }
  if (period === 'year') {
    const start = new Date(now.getFullYear(), 0, 1);
    return { from: toISO(start), to: toISO(now) };
  }
  return {
    from: customFrom ? new Date(customFrom).toISOString() : toISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: customTo ? new Date(customTo + 'T23:59:59').toISOString() : toISO(now),
  };
}

// ─── Ticket Detail Modal ──────────────────────────────────────────────────────
interface TicketDetailModalProps {
  ticketId: string;
  onClose: () => void;
  onModified: () => void;
}

function TicketDetailModal({ ticketId, onClose, onModified }: TicketDetailModalProps) {
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [modifications, setModifications] = useState<TicketModification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'detail' | 'edit' | 'history'>('detail');
  const [editForm, setEditForm] = useState({ clientName: '', paymentMethod: '', notes: '', reason: '' });
  const [emailAddr, setEmailAddr] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [rec, mods] = await Promise.all([
        fetchReceiptById(ticketId),
        fetchTicketModifications(ticketId),
      ]);
      setReceipt(rec);
      setModifications(mods);
      if (rec) {
        setEditForm({
          clientName: rec.clientName || '',
          paymentMethod: rec.paymentMethod || '',
          notes: rec.notes || '',
          reason: '',
        });
      }
      setLoading(false);
    };
    load();
  }, [ticketId]);

  const handlePrint = () => {
    if (!receipt) return;
    const now = new Date(receipt.createdAt);
    const dateStr = now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const s = loadSettingsFromCache();
    const subtotalHT = receipt.subtotalHT || receipt.totalAmount / (1 + s.tvaRate / 100);
    const totalTVA = receipt.totalTVA || receipt.totalAmount - subtotalHT;
    openAndPrint(generateTicketHTML({
      ...s,
      ticketNumber: receipt.ticketNumber,
      dateStr,
      timeStr,
      cashierLabel: receipt.cashierName || s.cashierLabel,
      clientName: receipt.clientName ?? undefined,
      items: receipt.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, discount: i.discount, discountType: i.discountType })),
      subtotalHT,
      totalTVA,
      totalTTC: receipt.totalAmount,
      paymentMethod: METHOD_LABELS[receipt.paymentMethod] || receipt.paymentMethod,
    }));
  };

  const handleSendEmail = async () => {
    if (!receipt || !emailAddr.includes('@')) return;
    setSendingEmail(true);
    const receiptData: ReceiptEmailData = {
      ticketNumber: receipt.ticketNumber,
      date: new Date(receipt.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }),
      clientName: receipt.clientName || undefined,
      items: receipt.items.map((i) => ({
        name: i.name,
        qty: i.qty,
        price: i.price,
        discount: i.discount > 0 ? i.discount : undefined,
      })),
      subtotalHT: receipt.subtotalHT || receipt.totalAmount / 1.085,
      totalTVA: receipt.totalTVA || receipt.totalAmount * 0.085 / 1.085,
      totalTTC: receipt.totalAmount,
      paymentMethod: METHOD_LABELS[receipt.paymentMethod] || receipt.paymentMethod,
      cashierName: receipt.cashierName || undefined,
    };
    const result = await sendReceiptEmail(emailAddr, receiptData);
    setSendingEmail(false);
    if (result.success) {
      setEmailSent(true);
      toast.success(`Ticket envoyé à ${emailAddr}`);
    } else {
      toast.error(`Erreur d'envoi : ${(result as any).error}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!receipt || !editForm.reason.trim()) {
      toast.error('Veuillez indiquer une raison de modification');
      return;
    }
    setSaving(true);
    const ok = await modifyTicket(
      receipt.id,
      {
        clientName: editForm.clientName || null,
        paymentMethod: editForm.paymentMethod,
        notes: editForm.notes,
      },
      'Caissier',
      editForm.reason
    );
    setSaving(false);
    if (ok) {
      toast.success('Ticket modifié avec succès');
      setReceipt(prev => prev ? {
        ...prev,
        clientName: editForm.clientName || null,
        paymentMethod: editForm.paymentMethod,
        notes: editForm.notes,
      } : prev);
      const mods = await fetchTicketModifications(receipt.id);
      setModifications(mods);
      setTab('detail');
      onModified();
    } else {
      toast.error('Erreur lors de la modification');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="ReceiptRefundIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="font-700 text-foreground">{loading ? 'Chargement...' : receipt?.ticketNumber || 'Ticket'}</h2>
              {receipt && <p className="text-xs text-muted-foreground">{formatDateTime(receipt.createdAt)}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 shrink-0">
          {[
            { id: 'detail', label: 'Détail', icon: 'DocumentTextIcon' },
            { id: 'edit', label: 'Modifier', icon: 'PencilSquareIcon' },
            { id: 'history', label: `Historique (${modifications.length})`, icon: 'ClockIcon' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-500 transition-colors ${
                tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon name={t.icon as any} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
            </div>
          ) : !receipt ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>Détails du ticket non disponibles</p>
              <p className="text-xs mt-1">Les tickets créés avant la mise à jour n'ont pas de détails enregistrés</p>
            </div>
          ) : tab === 'detail' ? (
            <>
              {/* Info row */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Client', value: receipt.clientName || 'Anonyme', icon: 'UserIcon' },
                  { label: 'Caissier', value: receipt.cashierName || '—', icon: 'UserCircleIcon' },
                  { label: 'Mode paiement', value: METHOD_LABELS[receipt.paymentMethod] || receipt.paymentMethod, icon: 'CreditCardIcon' },
                  { label: 'Statut', value: receipt.status === 'completed' ? 'Validé' : receipt.status, icon: 'CheckCircleIcon' },
                ].map((info) => (
                  <div key={info.label} className="bg-muted/30 rounded-xl px-4 py-3">
                    <p className="text-xs text-muted-foreground mb-0.5">{info.label}</p>
                    <p className="text-sm font-600 text-foreground">{info.value}</p>
                  </div>
                ))}
              </div>

              {/* Items */}
              {receipt.items.length > 0 ? (
                <div>
                  <h3 className="text-sm font-700 text-foreground mb-2">Articles ({receipt.items.length})</h3>
                  <div className="border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50 border-b border-border">
                          <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Article</th>
                          <th className="text-center px-3 py-2 text-xs font-600 text-muted-foreground">Qté</th>
                          <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground">PU</th>
                          <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.items.map((item, i) => {
                          const lineTotal = Math.max(0, item.price * item.qty - (item.discountType === 'percent' ? item.price * item.qty * (item.discount / 100) : item.discount));
                          return (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="px-3 py-2.5 text-foreground">{item.name}</td>
                              <td className="px-3 py-2.5 text-center text-muted-foreground">{item.qty}</td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums">{fmt(item.price)} €</td>
                              <td className="px-3 py-2.5 text-right font-600 tabular-nums">{fmt(lineTotal)} €</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="bg-muted/20 rounded-xl p-4 text-center text-sm text-muted-foreground">
                  Détails des articles non disponibles pour ce ticket
                </div>
              )}

              {/* Totals */}
              <div className="bg-muted/20 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Total HT</span>
                  <span className="tabular-nums">{fmt(receipt.subtotalHT || receipt.totalAmount / 1.085)} €</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>TVA 8,5 %</span>
                  <span className="tabular-nums">{fmt(receipt.totalTVA || receipt.totalAmount * 0.085 / 1.085)} €</span>
                </div>
                {receipt.discountAmount > 0 && (
                  <div className="flex items-center justify-between text-sm text-amber-600">
                    <span>Remise</span>
                    <span className="tabular-nums">-{fmt(receipt.discountAmount)} €</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-base font-700 text-foreground border-t border-border pt-1.5">
                  <span>Total TTC</span>
                  <span className="tabular-nums">{fmt(receipt.totalAmount)} €</span>
                </div>
              </div>

              {receipt.notes && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-600 text-amber-700 mb-1">Note interne</p>
                  <p className="text-sm text-amber-800">{receipt.notes}</p>
                </div>
              )}

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center justify-center gap-2 py-2.5 border border-border rounded-xl text-sm font-500 text-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="PrinterIcon" size={15} />
                  Réimprimer
                </button>
                <button
                  onClick={() => { window.open('/b2b-invoicing', '_blank'); }}
                  className="flex items-center justify-center gap-2 py-2.5 border border-emerald-200 bg-emerald-50 rounded-xl text-sm font-500 text-emerald-700 hover:bg-emerald-100 transition-colors"
                >
                  <Icon name="DocumentCheckIcon" size={15} />
                  Créer facture
                </button>
              </div>

              {/* Email send */}
              <div className="border border-border rounded-xl p-4">
                <p className="text-sm font-600 text-foreground mb-2 flex items-center gap-2">
                  <Icon name="EnvelopeIcon" size={15} className="text-purple-600" />
                  Envoyer par email
                </p>
                {emailSent ? (
                  <p className="text-sm text-emerald-600 font-500">✓ Ticket envoyé !</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={emailAddr}
                      onChange={(e) => setEmailAddr(e.target.value)}
                      placeholder="email@client.fr"
                      className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={handleSendEmail}
                      disabled={!emailAddr.includes('@') || sendingEmail}
                      className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm font-500 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                    >
                      {sendingEmail ? <Icon name="ArrowPathIcon" size={13} className="animate-spin" /> : <Icon name="PaperAirplaneIcon" size={13} />}
                      Envoyer
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : tab === 'edit' ? (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <Icon name="InformationCircleIcon" size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">
                  Seules les modifications limitées sont autorisées après encaissement : client, méthode de paiement et note interne. Toutes les modifications sont tracées.
                </p>
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Nom du client</label>
                <input
                  type="text"
                  value={editForm.clientName}
                  onChange={(e) => setEditForm(f => ({ ...f, clientName: e.target.value }))}
                  placeholder="Nom du client (laisser vide pour anonyme)"
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Méthode de paiement</label>
                <select
                  value={editForm.paymentMethod}
                  onChange={(e) => setEditForm(f => ({ ...f, paymentMethod: e.target.value }))}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  <option value="SumUp (CB)">SumUp (CB)</option>
                  <option value="Espèces">Espèces</option>
                  <option value="Virement">Virement</option>
                  <option value="Mixte">Mixte</option>
                  <option value="Alma (3x/4x)">Alma (3x/4x)</option>
                  <option value="acompte">Acompte</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Note interne</label>
                <textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Note interne visible uniquement par l'équipe..."
                  rows={3}
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">
                  Raison de la modification <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.reason}
                  onChange={(e) => setEditForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex: Erreur de saisie client, correction méthode de paiement..."
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>

              <button
                onClick={handleSaveEdit}
                disabled={saving || !editForm.reason.trim()}
                className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
              >
                {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
                Enregistrer les modifications
              </button>
            </div>
          ) : (
            /* History tab */
            <div>
              {modifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Icon name="ClockIcon" size={32} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Aucune modification enregistrée</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {modifications.map((mod) => (
                    <div key={mod.id} className="border border-border rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-600 text-primary bg-primary/10 px-2 py-0.5 rounded-full">{mod.fieldChanged}</span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(mod.modifiedAt)}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div className="bg-red-50 rounded-lg px-3 py-2">
                          <p className="text-red-500 font-600 mb-0.5">Ancienne valeur</p>
                          <p className="text-red-700">{mod.oldValue || '—'}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-lg px-3 py-2">
                          <p className="text-emerald-600 font-600 mb-0.5">Nouvelle valeur</p>
                          <p className="text-emerald-700">{mod.newValue || '—'}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Par : <span className="font-500 text-foreground">{mod.modifiedBy}</span></span>
                        {mod.reason && <span className="italic">"{mod.reason}"</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function CaisseHistoriquePage() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [page, setPage] = useState(0);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const PAGE_SIZE = 50;

  const loadTickets = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodDates(period, customFrom, customTo);

    try {
      const params = new URLSearchParams({
        from, to,
        method: filterMethod,
        status: filterStatus,
        page: String(page),
      });
      const res = await fetch(`/api/receipts?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rawTickets: any[] = await res.json();

      const mapped: TicketRow[] = rawTickets.map((t) => ({
        id: t.id,
        ticket_number: t.ticket_number ?? t.id.substring(0, 8).toUpperCase(),
        created_at: t.created_at,
        total_amount: t.total_amount ?? 0,
        payment_method: t.payment_method ?? 'other',
        client_name: t.client_name ?? null,
        items_count: t.items_count ?? 0,
        status: t.status ?? 'completed',
        cashier_name: t.cashier_name ?? null,
        discount_amount: t.discount_amount ?? null,
      }));

      setTickets(mapped);
    } catch (e) {
      console.error('Load tickets error:', e);
      toast.error('Impossible de charger les transactions');
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [period, customFrom, customTo, filterMethod, filterStatus, page]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const filtered = tickets.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (t.ticket_number ?? '').toLowerCase().includes(q) ||
      (t.client_name ?? '').toLowerCase().includes(q) ||
      (t.cashier_name ?? '').toLowerCase().includes(q)
    );
  });

  const totalCA = filtered.reduce((sum, t) => sum + (t.status !== 'cancelled' ? (t.total_amount ?? 0) : 0), 0);
  const totalTickets = filtered.filter(t => t.status !== 'cancelled').length;
  const avgBasket = totalTickets > 0 ? totalCA / totalTickets : 0;
  const cancelledCount = filtered.filter(t => t.status === 'cancelled').length;

  const PERIOD_OPTS: { id: PeriodFilter; label: string }[] = [
    { id: 'today', label: "Aujourd'hui" },
    { id: 'week', label: '7 jours' },
    { id: 'month', label: 'Ce mois' },
    { id: 'year', label: 'Cette année' },
    { id: 'custom', label: 'Personnalisé' },
  ];

  const uniqueMethods = [...new Set(tickets.map(t => t.payment_method).filter(Boolean))];

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Historique de caisse</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Journal complet de toutes les transactions</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/cloture-caisse"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-600 hover:opacity-90 transition-opacity"
            >
              <Icon name="DocumentChartBarIcon" size={16} />
              Synthèse journée
            </a>
            <button
              onClick={loadTickets}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={16} />
              Actualiser
            </button>
          </div>
        </div>

        {/* Period filter */}
        <div className="bg-white border border-border rounded-xl p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
              {PERIOD_OPTS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPeriod(p.id); setPage(0); }}
                  className={`px-3 py-1.5 rounded-md text-sm font-500 transition-all ${
                    period === p.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <input
                  type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'CA encaissé', value: `${fmt(totalCA)} €`, icon: 'BanknotesIcon', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Tickets validés', value: String(totalTickets), icon: 'ReceiptRefundIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'Panier moyen', value: `${fmt(avgBasket)} €`, icon: 'CalculatorIcon', color: 'text-indigo-600 bg-indigo-50' },
            { label: 'Annulés', value: String(cancelledCount), icon: 'XCircleIcon', color: 'text-red-600 bg-red-50' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white border border-border rounded-xl p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                <Icon name={kpi.icon as any} size={20} />
              </div>
              <div>
                <p className="text-lg font-700 text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters row */}
        <div className="bg-white border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher ticket, client, caissier..."
              className="w-full pl-9 pr-4 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <select
            value={filterMethod}
            onChange={e => { setFilterMethod(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="all">Tous les modes</option>
            {uniqueMethods.map(m => (
              <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
            className="border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          >
            <option value="all">Tous les statuts</option>
            <option value="completed">Validés</option>
            <option value="cancelled">Annulés</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Icon name="ArrowPathIcon" size={28} className="animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Icon name="ReceiptRefundIcon" size={48} className="mx-auto mb-4 opacity-20" />
              <p className="text-base font-500">Aucune transaction trouvée</p>
              <p className="text-sm mt-1">Modifiez vos filtres ou la période</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">N° Ticket</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Date & Heure</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Caissier</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Articles</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Mode paiement</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Remise</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Total TTC</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Statut</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(ticket => {
                    const methodLabel = METHOD_LABELS[ticket.payment_method] ?? ticket.payment_method;
                    const methodColor = METHOD_COLORS[methodLabel] ?? 'text-slate-700 bg-slate-50 border-slate-200';
                    const isCancelled = ticket.status === 'cancelled';
                    return (
                      <tr
                        key={ticket.id}
                        className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors cursor-pointer ${isCancelled ? 'opacity-60' : ''}`}
                        onClick={() => setSelectedTicketId(ticket.id)}
                      >
                        <td className="px-4 py-3 font-mono text-xs text-primary font-600">{ticket.ticket_number}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(ticket.created_at)}</td>
                        <td className="px-4 py-3 text-sm text-foreground">{ticket.client_name ?? <span className="text-muted-foreground italic">Anonyme</span>}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{ticket.cashier_name ?? '—'}</td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">{ticket.items_count ?? 0}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center text-xs font-500 px-2 py-0.5 rounded-full border ${methodColor}`}>
                            {methodLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-amber-600">
                          {ticket.discount_amount && ticket.discount_amount > 0 ? `-${fmt(ticket.discount_amount)} €` : '—'}
                        </td>
                        <td className={`px-4 py-3 text-right font-700 tabular-nums ${isCancelled ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {fmt(ticket.total_amount ?? 0)} €
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 text-xs font-500 text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                              <Icon name="XCircleIcon" size={11} />Annulé
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-500 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <Icon name="CheckCircleIcon" size={11} />Validé
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedTicketId(ticket.id)}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Voir le détail"
                          >
                            <Icon name="EyeIcon" size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
              <span className="text-xs text-muted-foreground">
                {filtered.length} résultat{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="ChevronLeftIcon" size={14} />
                </button>
                <span className="text-xs text-muted-foreground px-2">Page {page + 1}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={tickets.length < PAGE_SIZE}
                  className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Icon name="ChevronRightIcon" size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicketId && (
        <TicketDetailModal
          ticketId={selectedTicketId}
          onClose={() => setSelectedTicketId(null)}
          onModified={loadTickets}
        />
      )}
    </AppLayout>
  );
}
