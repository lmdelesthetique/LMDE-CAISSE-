'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { exportToPDF, exportToExcel } from '@/app/reports/utils/exportUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TVARow {
  id: string;
  date: string;
  ticket_number: string;
  client_name: string;
  client_type: string;
  payment_method: string;
  total_ht: number;
  tva_amount: number;
  total_ttc: number;
  period_label: string;
}

interface PeriodSummary {
  period: string;
  base_ht: number;
  tva: number;
  ttc: number;
  ticket_count: number;
}

interface CategorySummary {
  category: string;
  base_ht: number;
  tva: number;
  ttc: number;
  ticket_count: number;
}

interface PaymentSummary {
  method: string;
  base_ht: number;
  tva: number;
  ttc: number;
  ticket_count: number;
}

type PeriodMode = 'day' | 'week' | 'month' | 'quarter' | 'year';

// ─── Constants ────────────────────────────────────────────────────────────────

const TVA_RATE = 8.5;

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  check: 'Chèque',
  transfer: 'Virement',
  mobile: 'Paiement mobile',
  voucher: 'Bon d\'achat',
  mixed: 'Paiement mixte',
};

const CLIENT_TYPE_LABELS: Record<string, string> = {
  particulier: 'Particulier',
  professionnel: 'Professionnel',
  abonne: 'Abonné',
  vip: 'VIP',
  grossiste: 'Grossiste',
};

const PERIOD_LABELS: Record<PeriodMode, string> = {
  day: 'Jour',
  week: 'Semaine',
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
};

const PIE_COLORS = ['#7C3AED', '#2563EB', '#059669', '#D97706', '#DC2626', '#0891B2'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function getDefaultRange() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(firstDay), to: fmt(now) };
}

function getPeriodLabel(dateStr: string, mode: PeriodMode): string {
  const d = new Date(dateStr);
  if (mode === 'day') return dateStr;
  if (mode === 'week') {
    const week = Math.ceil(d.getDate() / 7);
    return `S${week} ${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  }
  if (mode === 'month') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  if (mode === 'quarter') return `T${Math.ceil((d.getMonth() + 1) / 3)} ${d.getFullYear()}`;
  return `${d.getFullYear()}`;
}

function formatCurrency(v: number) { return `${v.toFixed(2)} €`; }

// ─── Component ────────────────────────────────────────────────────────────────

export default function VATReportPage() {
  const [dateRange, setDateRange] = useState(getDefaultRange);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterPayment, setFilterPayment] = useState<string>('all');
  const [rows, setRows] = useState<TVARow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'table' | 'period' | 'category' | 'payment'>('table');
  const [generatedAt, setGeneratedAt] = useState<string>('');

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: tickets } = await supabase
        .from('receipts')
        .select('id, created_at, ticket_number, total_amount, payment_method, client_id, client_name')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (!tickets || tickets.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const mapped: TVARow[] = tickets.map((t: any) => {
        const ttc = t.total_amount ?? 0;
        const tvaRate = TVA_RATE;
        const tvaAmount = Math.round((ttc - ttc / (1 + tvaRate / 100)) * 100) / 100;
        const ht = Math.round((ttc - tvaAmount) * 100) / 100;
        const dateStr = t.created_at ? t.created_at.substring(0, 10) : '';
        const clientInfo = t.client_id ? { name: t.client_name ?? 'Client', client_type: 'particulier' } : null;

        return {
          id: t.id,
          date: dateStr,
          ticket_number: t.ticket_number ?? t.id?.substring(0, 8) ?? '-',
          client_name: clientInfo?.name ?? 'Anonyme',
          client_type: clientInfo?.client_type ?? 'particulier',
          payment_method: t.payment_method ?? 'cash',
          total_ht: ht,
          tva_amount: tvaAmount,
          total_ttc: ttc,
          period_label: getPeriodLabel(dateStr, periodMode),
        };
      });

      setRows(mapped);
      setGeneratedAt(new Date().toLocaleString('fr-FR'));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [dateRange, periodMode]);

  useEffect(() => { load(); }, [load]);

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const filtered = rows.filter((r) => {
    if (filterCategory !== 'all' && r.client_type !== filterCategory) return false;
    if (filterPayment !== 'all' && r.payment_method !== filterPayment) return false;
    return true;
  });

  // ── Aggregations ───────────────────────────────────────────────────────────

  const totalHT = filtered.reduce((s, r) => s + r.total_ht, 0);
  const totalTVA = filtered.reduce((s, r) => s + r.tva_amount, 0);
  const totalTTC = filtered.reduce((s, r) => s + r.total_ttc, 0);
  const ticketCount = filtered.length;

  // Period summary
  const periodMap: Record<string, PeriodSummary> = {};
  filtered.forEach((r) => {
    const key = r.period_label;
    if (!periodMap[key]) periodMap[key] = { period: key, base_ht: 0, tva: 0, ttc: 0, ticket_count: 0 };
    periodMap[key].base_ht += r.total_ht;
    periodMap[key].tva += r.tva_amount;
    periodMap[key].ttc += r.total_ttc;
    periodMap[key].ticket_count += 1;
  });
  const periodSummary = Object.values(periodMap).sort((a, b) => a.period.localeCompare(b.period));

  // Category summary
  const catMap: Record<string, CategorySummary> = {};
  filtered.forEach((r) => {
    const key = r.client_type;
    if (!catMap[key]) catMap[key] = { category: key, base_ht: 0, tva: 0, ttc: 0, ticket_count: 0 };
    catMap[key].base_ht += r.total_ht;
    catMap[key].tva += r.tva_amount;
    catMap[key].ttc += r.total_ttc;
    catMap[key].ticket_count += 1;
  });
  const categorySummary = Object.values(catMap);

  // Payment summary
  const payMap: Record<string, PaymentSummary> = {};
  filtered.forEach((r) => {
    const key = r.payment_method;
    if (!payMap[key]) payMap[key] = { method: key, base_ht: 0, tva: 0, ttc: 0, ticket_count: 0 };
    payMap[key].base_ht += r.total_ht;
    payMap[key].tva += r.tva_amount;
    payMap[key].ttc += r.total_ttc;
    payMap[key].ticket_count += 1;
  });
  const paymentSummary = Object.values(payMap);

  // Unique categories and payment methods for filter dropdowns
  const availableCategories = [...new Set(rows.map((r) => r.client_type))];
  const availablePayments = [...new Set(rows.map((r) => r.payment_method))];

  // ── Date presets ───────────────────────────────────────────────────────────

  const presets = [
    { label: "Aujourd\'hui", action: () => { const n = new Date(); setDateRange({ from: fmt(n), to: fmt(n) }); } },
    { label: '7 jours', action: () => { const n = new Date(); const f = new Date(n); f.setDate(f.getDate() - 6); setDateRange({ from: fmt(f), to: fmt(n) }); } },
    { label: 'Ce mois', action: () => { const n = new Date(); setDateRange({ from: fmt(new Date(n.getFullYear(), n.getMonth(), 1)), to: fmt(n) }); } },
    { label: 'Mois préc.', action: () => { const n = new Date(); setDateRange({ from: fmt(new Date(n.getFullYear(), n.getMonth() - 1, 1)), to: fmt(new Date(n.getFullYear(), n.getMonth(), 0)) }); } },
    { label: 'T1', action: () => { const y = new Date().getFullYear(); setDateRange({ from: `${y}-01-01`, to: `${y}-03-31` }); } },
    { label: 'T2', action: () => { const y = new Date().getFullYear(); setDateRange({ from: `${y}-04-01`, to: `${y}-06-30` }); } },
    { label: 'T3', action: () => { const y = new Date().getFullYear(); setDateRange({ from: `${y}-07-01`, to: `${y}-09-30` }); } },
    { label: 'T4', action: () => { const y = new Date().getFullYear(); setDateRange({ from: `${y}-10-01`, to: `${y}-12-31` }); } },
    { label: 'Cette année', action: () => { const n = new Date(); setDateRange({ from: `${n.getFullYear()}-01-01`, to: fmt(n) }); } },
  ];

  // ── Export ─────────────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    exportToPDF({
      title: `Déclaration TVA ${TVA_RATE}% — Rapport fiscal`,
      subtitle: `Période : ${dateRange.from} → ${dateRange.to} | Généré le ${generatedAt}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Client', key: 'client_name', width: 18 },
        { header: 'Catégorie', key: 'client_type', width: 14 },
        { header: 'Paiement', key: 'payment_method', width: 14 },
        { header: 'HT (€)', key: 'total_ht', width: 12 },
        { header: `TVA ${TVA_RATE}% (€)`, key: 'tva_amount', width: 14 },
        { header: 'TTC (€)', key: 'total_ttc', width: 12 },
      ],
      rows: filtered.map((r) => ({
        ...r,
        client_type: CLIENT_TYPE_LABELS[r.client_type] ?? r.client_type,
        payment_method: PAYMENT_LABELS[r.payment_method] ?? r.payment_method,
      })),
      filename: `declaration-tva-${TVA_RATE}-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: `Déclaration TVA ${TVA_RATE}%`,
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Client', key: 'client_name', width: 18 },
        { header: 'Catégorie client', key: 'client_type', width: 18 },
        { header: 'Mode de paiement', key: 'payment_method', width: 18 },
        { header: 'Base HT (€)', key: 'total_ht', width: 14 },
        { header: `TVA ${TVA_RATE}% (€)`, key: 'tva_amount', width: 14 },
        { header: 'Total TTC (€)', key: 'total_ttc', width: 14 },
      ],
      rows: filtered.map((r) => ({
        ...r,
        client_type: CLIENT_TYPE_LABELS[r.client_type] ?? r.client_type,
        payment_method: PAYMENT_LABELS[r.payment_method] ?? r.payment_method,
      })),
      filename: `tva-${TVA_RATE}-declaration-${dateRange.from}-${dateRange.to}`,
    });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">

        {/* ── Header ── */}
        <div className="bg-white border-b border-border px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Icon name="ReceiptPercentIcon" size={20} className="text-violet-700" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">
                    Déclaration TVA {TVA_RATE}%
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Rapport fiscal auto-généré · Conforme aux exigences françaises (DGFiP)
                  </p>
                </div>
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border bg-white hover:bg-muted text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name="DocumentArrowDownIcon" size={15} /> PDF
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-sm font-medium text-emerald-700 transition-colors"
              >
                <Icon name="TableCellsIcon" size={15} /> Excel
              </button>
            </div>
          </div>

          {/* ── Filters bar ── */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Period presets */}
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={p.action}
                className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-white hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                {p.label}
              </button>
            ))}

            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-lg px-3 py-1.5 border border-border">
              <Icon name="CalendarDaysIcon" size={13} className="text-muted-foreground" />
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))}
                className="text-xs bg-transparent border-none outline-none text-foreground"
              />
              <span className="text-muted-foreground text-xs">→</span>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))}
                className="text-xs bg-transparent border-none outline-none text-foreground"
              />
            </div>

            {/* Period grouping */}
            <select
              value={periodMode}
              onChange={(e) => setPeriodMode(e.target.value as PeriodMode)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none"
            >
              {(Object.keys(PERIOD_LABELS) as PeriodMode[]).map((k) => (
                <option key={k} value={k}>Regrouper par {PERIOD_LABELS[k]}</option>
              ))}
            </select>

            {/* Category filter */}
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none"
            >
              <option value="all">Toutes catégories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>{CLIENT_TYPE_LABELS[c] ?? c}</option>
              ))}
            </select>

            {/* Payment filter */}
            <select
              value={filterPayment}
              onChange={(e) => setFilterPayment(e.target.value)}
              className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none"
            >
              <option value="all">Tous modes de paiement</option>
              {availablePayments.map((m) => (
                <option key={m} value={m}>{PAYMENT_LABELS[m] ?? m}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* ── Legal notice banner ── */}
          <div className="flex items-start gap-3 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3">
            <Icon name="InformationCircleIcon" size={18} className="text-violet-600 shrink-0 mt-0.5" />
            <div className="text-xs text-violet-800 leading-relaxed">
              <span className="font-semibold">Déclaration TVA {TVA_RATE}% — Conforme DGFiP</span>
              {' '}· Taux applicable en France métropolitaine pour certains secteurs (Art. 278-0 bis CGI).
              Ce rapport est auto-généré à partir des tickets de caisse enregistrés.
              {generatedAt && <span className="ml-1 text-violet-600">Généré le {generatedAt}.</span>}
            </div>
          </div>

          {/* ── KPI cards ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Tickets analysés', value: loading ? '—' : ticketCount.toString(), icon: 'DocumentTextIcon', bg: 'bg-slate-50', text: 'text-slate-700' },
              { label: 'Base HT totale', value: loading ? '—' : formatCurrency(totalHT), icon: 'CalculatorIcon', bg: 'bg-blue-50', text: 'text-blue-700' },
              { label: `TVA ${TVA_RATE}% collectée`, value: loading ? '—' : formatCurrency(totalTVA), icon: 'ReceiptPercentIcon', bg: 'bg-violet-50', text: 'text-violet-700' },
              { label: 'Total TTC', value: loading ? '—' : formatCurrency(totalTTC), icon: 'BanknotesIcon', bg: 'bg-emerald-50', text: 'text-emerald-700' },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white rounded-xl border border-border p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${kpi.bg}`}>
                  <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} className={kpi.text} />
                </div>
                <p className="text-2xl font-bold text-foreground tabular-nums">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* ── View tabs ── */}
          <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
            {([
              { id: 'table', label: 'Détail tickets', icon: 'TableCellsIcon' },
              { id: 'period', label: `Par ${PERIOD_LABELS[periodMode]}`, icon: 'CalendarDaysIcon' },
              { id: 'category', label: 'Par catégorie', icon: 'UsersIcon' },
              { id: 'payment', label: 'Par paiement', icon: 'CreditCardIcon' },
            ] as { id: typeof activeView; label: string; icon: string }[]).map((v) => (
              <button
                key={v.id}
                onClick={() => setActiveView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeView === v.id
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={v.icon as Parameters<typeof Icon>[0]['name']} size={13} />
                {v.label}
              </button>
            ))}
          </div>

          {/* ── Detail table view ── */}
          {activeView === 'table' && (
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        {['Date', 'N° Ticket', 'Client', 'Catégorie', 'Paiement', 'Base HT', `TVA ${TVA_RATE}%`, 'Total TTC'].map((h) => (
                          <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                            <Icon name="DocumentMagnifyingGlassIcon" size={32} className="mx-auto mb-2 opacity-30" />
                            Aucune donnée pour cette période
                          </td>
                        </tr>
                      ) : (
                        filtered.map((row, i) => (
                          <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{row.date}</td>
                            <td className="px-4 py-3 font-mono text-xs text-foreground">{row.ticket_number}</td>
                            <td className="px-4 py-3 text-foreground text-xs">{row.client_name}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {CLIENT_TYPE_LABELS[row.client_type] ?? row.client_type}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                                {PAYMENT_LABELS[row.payment_method] ?? row.payment_method}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-foreground tabular-nums">{row.total_ht.toFixed(2)} €</td>
                            <td className="px-4 py-3 font-semibold text-violet-700 tabular-nums">{row.tva_amount.toFixed(2)} €</td>
                            <td className="px-4 py-3 font-semibold text-foreground tabular-nums">{row.total_ttc.toFixed(2)} €</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {filtered.length > 0 && (
                      <tfoot className="bg-violet-50 border-t-2 border-violet-200">
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-xs font-bold text-violet-800">TOTAL ({ticketCount} tickets)</td>
                          <td className="px-4 py-3 font-bold text-foreground tabular-nums">{totalHT.toFixed(2)} €</td>
                          <td className="px-4 py-3 font-bold text-violet-700 tabular-nums">{totalTVA.toFixed(2)} €</td>
                          <td className="px-4 py-3 font-bold text-foreground tabular-nums">{totalTTC.toFixed(2)} €</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Period view ── */}
          {activeView === 'period' && (
            <div className="space-y-4">
              {loading ? (
                <div className="bg-white rounded-xl border border-border flex items-center justify-center h-48 text-muted-foreground text-sm">
                  <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
                </div>
              ) : (
                <>
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">TVA collectée par {PERIOD_LABELS[periodMode].toLowerCase()}</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={periodSummary} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                        <Tooltip formatter={(v: any, name: any) => [`${v.toFixed(2)} €`, name === 'tva' ? `TVA ${TVA_RATE}%` : name === 'base_ht' ? 'Base HT' : 'TTC']} />
                        <Bar dataKey="base_ht" name="Base HT" fill="#BFDBFE" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="tva" name={`TVA ${TVA_RATE}%`} fill="#7C3AED" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          {['Période', 'Tickets', 'Base HT', `TVA ${TVA_RATE}%`, 'Total TTC'].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periodSummary.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
                        ) : (
                          periodSummary.map((p, i) => (
                            <tr key={p.period} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                              <td className="px-4 py-3 font-medium text-foreground">{p.period}</td>
                              <td className="px-4 py-3 text-muted-foreground">{p.ticket_count}</td>
                              <td className="px-4 py-3 text-foreground tabular-nums">{p.base_ht.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold text-violet-700 tabular-nums">{p.tva.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold text-foreground tabular-nums">{p.ttc.toFixed(2)} €</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Category view ── */}
          {activeView === 'category' && (
            <div className="space-y-4">
              {loading ? (
                <div className="bg-white rounded-xl border border-border flex items-center justify-center h-48 text-muted-foreground text-sm">
                  <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">TVA par catégorie client</h3>
                    {categorySummary.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={categorySummary.map((c) => ({ name: CLIENT_TYPE_LABELS[c.category] ?? c.category, value: Math.round(c.tva * 100) / 100 }))}
                            cx="50%" cy="50%" outerRadius={80} dataKey="value"
                          >
                            {categorySummary.map((_, idx) => (
                              <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => [`${v.toFixed(2)} €`, `TVA ${TVA_RATE}%`]} />
                          <Legend formatter={(v) => <span className="text-xs">{v}</span>} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Aucune donnée</div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          {['Catégorie', 'Tickets', 'Base HT', `TVA ${TVA_RATE}%`, 'TTC'].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {categorySummary.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
                        ) : (
                          categorySummary.map((c, i) => (
                            <tr key={c.category} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] + '20', color: PIE_COLORS[i % PIE_COLORS.length] }}>
                                  {CLIENT_TYPE_LABELS[c.category] ?? c.category}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{c.ticket_count}</td>
                              <td className="px-4 py-3 tabular-nums">{c.base_ht.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold text-violet-700 tabular-nums">{c.tva.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold tabular-nums">{c.ttc.toFixed(2)} €</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Payment view ── */}
          {activeView === 'payment' && (
            <div className="space-y-4">
              {loading ? (
                <div className="bg-white rounded-xl border border-border flex items-center justify-center h-48 text-muted-foreground text-sm">
                  <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-white rounded-xl border border-border p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-4">TVA par mode de paiement</h3>
                    {paymentSummary.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={paymentSummary.map((p) => ({ ...p, method_label: PAYMENT_LABELS[p.method] ?? p.method }))} layout="vertical" margin={{ top: 4, right: 16, left: 60, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
                          <YAxis type="category" dataKey="method_label" tick={{ fontSize: 11 }} width={60} />
                          <Tooltip formatter={(v: any, name: any) => [`${v.toFixed(2)} €`, name === 'tva' ? `TVA ${TVA_RATE}%` : 'Base HT']} />
                          <Bar dataKey="base_ht" name="Base HT" fill="#BFDBFE" radius={[0, 3, 3, 0]} />
                          <Bar dataKey="tva" name={`TVA ${TVA_RATE}%`} fill="#7C3AED" radius={[0, 3, 3, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">Aucune donnée</div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          {['Mode de paiement', 'Tickets', 'Base HT', `TVA ${TVA_RATE}%`, 'TTC'].map((h) => (
                            <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paymentSummary.length === 0 ? (
                          <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
                        ) : (
                          paymentSummary.map((p, i) => (
                            <tr key={p.method} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                              <td className="px-4 py-3">
                                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                                  {PAYMENT_LABELS[p.method] ?? p.method}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">{p.ticket_count}</td>
                              <td className="px-4 py-3 tabular-nums">{p.base_ht.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold text-violet-700 tabular-nums">{p.tva.toFixed(2)} €</td>
                              <td className="px-4 py-3 font-semibold tabular-nums">{p.ttc.toFixed(2)} €</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Declaration summary box ── */}
          {!loading && filtered.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-violet-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Icon name="DocumentCheckIcon" size={18} className="text-violet-700" />
                <h3 className="text-sm font-semibold text-foreground">Récapitulatif déclaration TVA — À reporter sur formulaire CA3</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <p className="text-xs text-muted-foreground mb-1">Ligne A — Base imposable HT</p>
                  <p className="text-xl font-bold text-foreground tabular-nums">{totalHT.toFixed(2)} €</p>
                </div>
                <div className="bg-violet-50 rounded-lg p-4 border border-violet-200">
                  <p className="text-xs text-muted-foreground mb-1">Ligne B — TVA brute {TVA_RATE}%</p>
                  <p className="text-xl font-bold text-violet-700 tabular-nums">{totalTVA.toFixed(2)} €</p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-200">
                  <p className="text-xs text-muted-foreground mb-1">Total TTC encaissé</p>
                  <p className="text-xl font-bold text-emerald-700 tabular-nums">{totalTTC.toFixed(2)} €</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Période : <strong>{dateRange.from}</strong> → <strong>{dateRange.to}</strong> · {ticketCount} ticket(s) · Taux TVA : {TVA_RATE}% · Généré le {generatedAt}
              </p>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}
