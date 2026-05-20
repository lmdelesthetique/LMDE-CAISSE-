'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatCurrency(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f') + '\u202f€';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReceiptRow {
  id: string;
  ticket_number: string;
  created_at: string;
  total_amount: number;
  payment_method: string;
  client_name: string | null;
  items_count: number;
  status: string;
}

interface PaymentMethodSummary {
  method: string;
  label: string;
  count: number;
  total: number;
  color: string;
  icon: string;
}

interface CashDenomination {
  label: string;
  value: number;
  count: number;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  CB: 'Carte bancaire',
  Espèces: 'Espèces',
  Virement: 'Virement',
  Mixte: 'Paiement mixte',
  mixed: 'Paiement mixte',
  check: 'Chèque',
  transfer: 'Virement',
  store_credit: 'Avoir',
  other: 'Autre',
};

const METHOD_COLORS: Record<string, string> = {
  'Espèces': '#16a34a',
  'Carte bancaire': '#2563eb',
  'Paiement mixte': '#7c3aed',
  'Virement': '#0891b2',
  'Chèque': '#d97706',
  'Avoir': '#db2777',
  'Autre': '#6b7280',
};

const METHOD_ICONS: Record<string, string> = {
  'Espèces': 'BanknotesIcon',
  'Carte bancaire': 'CreditCardIcon',
  'Paiement mixte': 'ArrowsRightLeftIcon',
  'Virement': 'BuildingLibraryIcon',
  'Chèque': 'DocumentTextIcon',
  'Avoir': 'GiftIcon',
  'Autre': 'EllipsisHorizontalCircleIcon',
};

const DENOMINATIONS: CashDenomination[] = [
  { label: '500 €', value: 500, count: 0 },
  { label: '200 €', value: 200, count: 0 },
  { label: '100 €', value: 100, count: 0 },
  { label: '50 €', value: 50, count: 0 },
  { label: '20 €', value: 20, count: 0 },
  { label: '10 €', value: 10, count: 0 },
  { label: '5 €', value: 5, count: 0 },
  { label: '2 €', value: 2, count: 0 },
  { label: '1 €', value: 1, count: 0 },
  { label: '0,50 €', value: 0.5, count: 0 },
  { label: '0,20 €', value: 0.2, count: 0 },
  { label: '0,10 €', value: 0.1, count: 0 },
  { label: '0,05 €', value: 0.05, count: 0 },
  { label: '0,02 €', value: 0.02, count: 0 },
  { label: '0,01 €', value: 0.01, count: 0 },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

interface KPICardProps {
  label: string;
  value: string;
  icon: string;
  iconColor: string;
  iconBg: string;
  sub?: string;
  subColor?: string;
}

function KPICard({ label, value, icon, iconColor, iconBg, sub, subColor }: KPICardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon name={icon as any} size={20} className={iconColor} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium mb-0.5">{label}</p>
        <p className="text-xl font-700 text-foreground tabular-nums">{value}</p>
        {sub && <p className={`text-xs mt-0.5 font-medium ${subColor ?? 'text-muted-foreground'}`}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── Cash Count Panel ────────────────────────────────────────────────────────

interface CashCountPanelProps {
  denominations: CashDenomination[];
  onChange: (idx: number, count: number) => void;
  fundFloat: number;
  onFundFloatChange: (v: number) => void;
}

function CashCountPanel({ denominations, onChange, fundFloat, onFundFloatChange }: CashCountPanelProps) {
  const total = denominations.reduce((s, d) => s + d.value * d.count, 0);
  const netCash = Math.max(0, total - fundFloat);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon name="BanknotesIcon" size={18} className="text-green-600" />
          <h3 className="font-600 text-foreground">Comptage des espèces</h3>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Total compté</p>
          <p className="text-lg font-700 text-green-600 tabular-nums">{formatCurrency(total)}</p>
        </div>
      </div>

      <div className="p-4">
        {/* Fund float */}
        <div className="flex items-center justify-between mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div>
            <p className="text-sm font-600 text-amber-800">Fond de caisse</p>
            <p className="text-xs text-amber-600">Montant à déduire (monnaie de départ)</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.01}
              value={fundFloat || ''}
              onChange={(e) => onFundFloatChange(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-24 text-right border border-amber-300 rounded-lg px-2 py-1.5 text-sm font-600 text-amber-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <span className="text-sm text-amber-700 font-medium">€</span>
          </div>
        </div>

        {/* Denominations grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {denominations.map((d, idx) => (
            <div key={d.label} className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
              <span className="text-xs font-600 text-foreground w-14 shrink-0">{d.label}</span>
              <input
                type="number"
                min={0}
                value={d.count || ''}
                onChange={(e) => onChange(idx, parseInt(e.target.value) || 0)}
                placeholder="0"
                className="flex-1 w-0 text-center border border-border rounded-md px-1.5 py-1 text-sm font-500 bg-white focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <span className="text-xs text-muted-foreground w-16 text-right shrink-0 tabular-nums">
                {d.count > 0 ? formatCurrency(d.value * d.count) : '—'}
              </span>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="border-t border-border pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total billets + pièces</span>
            <span className="font-600 tabular-nums">{formatCurrency(total)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Fond de caisse (−)</span>
            <span className="font-600 text-amber-600 tabular-nums">− {formatCurrency(fundFloat)}</span>
          </div>
          <div className="flex justify-between text-sm font-700 border-t border-border pt-1.5 mt-1.5">
            <span className="text-foreground">Espèces nettes</span>
            <span className="text-green-600 tabular-nums">{formatCurrency(netCash)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment Breakdown ───────────────────────────────────────────────────────

interface PaymentBreakdownProps {
  methods: PaymentMethodSummary[];
  grandTotal: number;
}

function PaymentBreakdown({ methods, grandTotal }: PaymentBreakdownProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Icon name="ChartPieIcon" size={18} className="text-primary" />
        <h3 className="font-600 text-foreground">Ventilation par mode de paiement</h3>
      </div>
      <div className="p-4 space-y-3">
        {methods.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">Aucune vente pour cette période</p>
        )}
        {methods.map((m) => {
          const pct = grandTotal > 0 ? (m.total / grandTotal) * 100 : 0;
          return (
            <div key={m.method}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: m.color + '20' }}>
                    <Icon name={m.icon as any} size={14} style={{ color: m.color }} />
                  </div>
                  <span className="text-sm font-500 text-foreground">{m.label}</span>
                  <span className="text-xs text-muted-foreground">({m.count} ticket{m.count > 1 ? 's' : ''})</span>
                </div>
                <span className="text-sm font-700 tabular-nums" style={{ color: m.color }}>{formatCurrency(m.total)}</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: m.color }}
                />
              </div>
              <p className="text-right text-[10px] text-muted-foreground mt-0.5">{pct.toFixed(1)}%</p>
            </div>
          );
        })}
        {methods.length > 0 && (
          <div className="border-t border-border pt-3 flex justify-between">
            <span className="text-sm font-600 text-foreground">Total encaissé</span>
            <span className="text-sm font-700 text-foreground tabular-nums">{formatCurrency(grandTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Discrepancy Alert ───────────────────────────────────────────────────────

interface DiscrepancyAlertProps {
  registerCash: number;
  countedCash: number;
  threshold: number;
}

function DiscrepancyAlert({ registerCash, countedCash, threshold }: DiscrepancyAlertProps) {
  const diff = countedCash - registerCash;
  const absDiff = Math.abs(diff);
  const hasDiscrepancy = absDiff > threshold;
  const isOver = diff > 0;

  if (registerCash === 0 && countedCash === 0) {
    return (
      <div className="bg-muted/50 border border-border rounded-xl p-4 flex items-center gap-3">
        <Icon name="InformationCircleIcon" size={20} className="text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground">Saisissez le comptage des espèces pour voir l'écart de caisse.</p>
      </div>
    );
  }

  if (!hasDiscrepancy) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Icon name="CheckCircleIcon" size={20} className="text-green-600" />
        </div>
        <div>
          <p className="text-sm font-600 text-green-800">Caisse équilibrée</p>
          <p className="text-xs text-green-600">
            Écart de {formatCurrency(absDiff)} — dans la tolérance de ±{formatCurrency(threshold)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-green-600">Espèces comptées</p>
          <p className="text-base font-700 text-green-700 tabular-nums">{formatCurrency(countedCash)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`border rounded-xl p-4 ${isOver ? 'bg-blue-50 border-blue-200' : 'bg-red-50 border-red-200'}`}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isOver ? 'bg-blue-100' : 'bg-red-100'}`}>
          <Icon name="ExclamationTriangleIcon" size={20} className={isOver ? 'text-blue-600' : 'text-red-600'} />
        </div>
        <div className="flex-1">
          <p className={`text-sm font-700 ${isOver ? 'text-blue-800' : 'text-red-800'}`}>
            {isOver ? 'Excédent de caisse' : 'Manque en caisse'}
          </p>
          <p className={`text-xs mt-0.5 ${isOver ? 'text-blue-600' : 'text-red-600'}`}>
            {isOver ? '+' : ''}{formatCurrency(diff)} par rapport au total registre espèces
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">Écart</p>
          <p className={`text-lg font-700 tabular-nums ${isOver ? 'text-blue-700' : 'text-red-700'}`}>
            {isOver ? '+' : ''}{formatCurrency(diff)}
          </p>
        </div>
      </div>
      <div className={`mt-3 grid grid-cols-2 gap-3 pt-3 border-t ${isOver ? 'border-blue-200' : 'border-red-200'}`}>
        <div className={`rounded-lg p-2.5 ${isOver ? 'bg-blue-100/60' : 'bg-red-100/60'}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Registre (espèces)</p>
          <p className={`text-sm font-700 tabular-nums ${isOver ? 'text-blue-800' : 'text-red-800'}`}>{formatCurrency(registerCash)}</p>
        </div>
        <div className={`rounded-lg p-2.5 ${isOver ? 'bg-blue-100/60' : 'bg-red-100/60'}`}>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Compté physiquement</p>
          <p className={`text-sm font-700 tabular-nums ${isOver ? 'text-blue-800' : 'text-red-800'}`}>{formatCurrency(countedCash)}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Receipt Journal ─────────────────────────────────────────────────────────

interface ReceiptJournalProps {
  receipts: ReceiptRow[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  filterMethod: string;
  onFilterMethodChange: (v: string) => void;
  filterStatus: string;
  onFilterStatusChange: (v: string) => void;
}

function ReceiptJournal({
  receipts, loading, search, onSearchChange,
  filterMethod, onFilterMethodChange,
  filterStatus, onFilterStatusChange,
}: ReceiptJournalProps) {
  const STATUS_BADGE: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    pending: 'bg-yellow-100 text-yellow-700',
    cancelled: 'bg-red-100 text-red-700',
    refunded: 'bg-purple-100 text-purple-700',
  };
  const STATUS_LABELS: Record<string, string> = {
    completed: 'Complété',
    pending: 'En attente',
    cancelled: 'Annulé',
    refunded: 'Remboursé',
  };

  const uniqueMethods = Array.from(new Set(receipts.map((r) => r.payment_method)));

  const filtered = receipts.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = !q || r.ticket_number.toLowerCase().includes(q) || (r.client_name ?? '').toLowerCase().includes(q);
    const matchMethod = filterMethod === 'all' || r.payment_method === filterMethod;
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchMethod && matchStatus;
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header + Filters */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon name="ReceiptRefundIcon" size={18} className="text-primary" />
            <h3 className="font-600 text-foreground">Journal des tickets</h3>
            <span className="text-xs bg-muted text-muted-foreground rounded-full px-2 py-0.5 font-medium">{filtered.length}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="N° ticket, client..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {/* Method filter */}
          <select
            value={filterMethod}
            onChange={(e) => onFilterMethodChange(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Tous modes</option>
            {uniqueMethods.map((m) => (
              <option key={m} value={m}>{METHOD_LABELS[m] ?? m}</option>
            ))}
          </select>
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => onFilterStatusChange(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="all">Tous statuts</option>
            <option value="completed">Complété</option>
            <option value="pending">En attente</option>
            <option value="cancelled">Annulé</option>
            <option value="refunded">Remboursé</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin" />
            <span className="text-sm">Chargement...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Icon name="DocumentTextIcon" size={32} className="opacity-30" />
            <p className="text-sm">Aucun ticket trouvé</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Heure</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">N° Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Mode</th>
                <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Articles</th>
                <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Montant</th>
                <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => {
                const methodLabel = METHOD_LABELS[r.payment_method] ?? r.payment_method;
                const methodColor = METHOD_COLORS[methodLabel] ?? '#6b7280';
                const methodIcon = METHOD_ICONS[methodLabel] ?? 'EllipsisHorizontalCircleIcon';
                return (
                  <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground tabular-nums text-xs">{formatTime(r.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-600 text-foreground">{r.ticket_number}</span>
                    </td>
                    <td className="px-4 py-3 text-foreground">{r.client_name ?? <span className="text-muted-foreground italic">Anonyme</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Icon name={methodIcon as any} size={13} style={{ color: methodColor }} />
                        <span className="text-xs" style={{ color: methodColor }}>{methodLabel}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-center">{r.items_count}</td>
                    <td className="px-4 py-3 text-right font-700 tabular-nums text-foreground">{formatCurrency(r.total_amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block text-[10px] font-600 px-2 py-0.5 rounded-full ${STATUS_BADGE[r.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ShiftReconciliationPage() {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().substring(0, 10);
  });

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [denominations, setDenominations] = useState<CashDenomination[]>(DENOMINATIONS.map((d) => ({ ...d })));
  const [fundFloat, setFundFloat] = useState<number>(200);
  const [discrepancyThreshold] = useState<number>(1);

  // Journal filters
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Shift notes
  const [shiftNotes, setShiftNotes] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: tickets } = await supabase
        .from('receipts')
        .select('id, ticket_number, created_at, total_amount, payment_method, client_id, client_name, items_count, status')
        .gte('created_at', selectedDate + 'T00:00:00')
        .lte('created_at', selectedDate + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (tickets) {
        const mapped: ReceiptRow[] = tickets.map((t: any) => ({
          id: t.id,
          ticket_number: t.ticket_number ?? t.id.substring(0, 8).toUpperCase(),
          created_at: t.created_at,
          total_amount: t.total_amount ?? 0,
          payment_method: t.payment_method ?? 'other',
          client_name: t.client_name ?? null,
          items_count: t.items_count ?? 0,
          status: t.status ?? 'completed',
        }));
        setReceipts(mapped);
      } else {
        setReceipts([]);
      }
    } catch {
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  // Computed values
  const completedReceipts = receipts.filter((r) => r.status !== 'cancelled');

  const grandTotal = completedReceipts.reduce((s, r) => s + r.total_amount, 0);
  const totalTickets = completedReceipts.length;
  const avgTicket = totalTickets > 0 ? grandTotal / totalTickets : 0;

  // Payment method breakdown
  const methodMap: Record<string, { count: number; total: number }> = {};
  completedReceipts.forEach((r) => {
    const label = METHOD_LABELS[r.payment_method] ?? r.payment_method;
    if (!methodMap[label]) methodMap[label] = { count: 0, total: 0 };
    methodMap[label].count += 1;
    methodMap[label].total += r.total_amount;
  });
  const paymentMethods: PaymentMethodSummary[] = Object.entries(methodMap).map(([label, v]) => ({
    method: label,
    label,
    count: v.count,
    total: Math.round(v.total * 100) / 100,
    color: METHOD_COLORS[label] ?? '#6b7280',
    icon: METHOD_ICONS[label] ?? 'EllipsisHorizontalCircleIcon',
  })).sort((a, b) => b.total - a.total);

  // Cash from register
  const registerCash = paymentMethods.find((m) => m.label === 'Espèces')?.total ?? 0;

  // Counted cash (net of fund float)
  const countedTotal = denominations.reduce((s, d) => s + d.value * d.count, 0);
  const countedCash = Math.max(0, countedTotal - fundFloat);

  const handleDenominationChange = (idx: number, count: number) => {
    setDenominations((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], count };
      return next;
    });
  };

  const handleSaveNotes = () => {
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 2500);
  };

  const handleCloseShift = () => {
    // In a real app this would persist the reconciliation record
    alert('Clôture de caisse enregistrée avec succès.');
  };

  const isToday = selectedDate === new Date().toISOString().substring(0, 10);

  return (
    <AppLayout>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Clôture de caisse</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Réconciliation fin de journée — comptage, écarts et journal des tickets</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
              <Icon name="CalendarDaysIcon" size={16} className="text-muted-foreground" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-sm font-500 text-foreground bg-transparent focus:outline-none"
              />
            </div>
            {isToday && (
              <button
                onClick={handleCloseShift}
                className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-600 hover:bg-primary/90 transition-colors"
              >
                <Icon name="LockClosedIcon" size={15} />
                Clôturer la caisse
              </button>
            )}
          </div>
        </div>

        {/* Date badge */}
        {isToday && (
          <div className="flex items-center gap-2 mb-5 bg-primary/8 border border-primary/20 rounded-lg px-4 py-2.5 w-fit">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm font-500 text-primary">Session en cours — aujourd'hui</span>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KPICard
            label="Total encaissé"
            value={formatCurrency(grandTotal)}
            icon="BanknotesIcon"
            iconColor="text-green-600"
            iconBg="bg-green-100"
          />
          <KPICard
            label="Tickets validés"
            value={String(totalTickets)}
            icon="ReceiptRefundIcon"
            iconColor="text-blue-600"
            iconBg="bg-blue-100"
            sub={`${receipts.filter((r) => r.status === 'cancelled').length} annulé(s)`}
            subColor="text-muted-foreground"
          />
          <KPICard
            label="Panier moyen"
            value={formatCurrency(avgTicket)}
            icon="ShoppingCartIcon"
            iconColor="text-purple-600"
            iconBg="bg-purple-100"
          />
          <KPICard
            label="Espèces registre"
            value={formatCurrency(registerCash)}
            icon="CurrencyEuroIcon"
            iconColor="text-amber-600"
            iconBg="bg-amber-100"
            sub={countedTotal > 0 ? `Compté: ${formatCurrency(countedCash)}` : 'Non compté'}
            subColor={countedTotal > 0 ? (Math.abs(countedCash - registerCash) > discrepancyThreshold ? 'text-red-600' : 'text-green-600') : 'text-muted-foreground'}
          />
        </div>

        {/* Discrepancy Alert */}
        <div className="mb-6">
          <DiscrepancyAlert
            registerCash={registerCash}
            countedCash={countedCash}
            threshold={discrepancyThreshold}
          />
        </div>

        {/* Main 2-col grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <CashCountPanel
            denominations={denominations}
            onChange={handleDenominationChange}
            fundFloat={fundFloat}
            onFundFloatChange={setFundFloat}
          />
          <div className="flex flex-col gap-6">
            <PaymentBreakdown methods={paymentMethods} grandTotal={grandTotal} />

            {/* Shift Notes */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center gap-2">
                <Icon name="PencilSquareIcon" size={18} className="text-primary" />
                <h3 className="font-600 text-foreground">Notes de clôture</h3>
              </div>
              <div className="p-4">
                <textarea
                  rows={4}
                  value={shiftNotes}
                  onChange={(e) => setShiftNotes(e.target.value)}
                  placeholder="Incidents, remarques, observations sur la journée..."
                  className="w-full text-sm border border-border rounded-lg px-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none text-foreground placeholder:text-muted-foreground"
                />
                <div className="flex justify-end mt-2">
                  <button
                    onClick={handleSaveNotes}
                    className="flex items-center gap-1.5 text-sm font-600 text-primary hover:text-primary/80 transition-colors"
                  >
                    <Icon name={noteSaved ? 'CheckIcon' : 'BookmarkIcon'} size={14} />
                    {noteSaved ? 'Sauvegardé !' : 'Sauvegarder'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Receipt Journal */}
        <ReceiptJournal
          receipts={receipts}
          loading={loading}
          search={search}
          onSearchChange={setSearch}
          filterMethod={filterMethod}
          onFilterMethodChange={setFilterMethod}
          filterStatus={filterStatus}
          onFilterStatusChange={setFilterStatus}
        />
      </div>
    </AppLayout>
  );
}
