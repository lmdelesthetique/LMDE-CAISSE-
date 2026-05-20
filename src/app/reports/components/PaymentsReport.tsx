'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface PaymentsReportProps {
  dateRange: DateRange;
}

interface PaymentRow {
  date: string;
  ticket_number: string;
  method: string;
  amount: number;
  client: string;
}

interface MethodSummary {
  method: string;
  count: number;
  total: number;
  pct: string;
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte bancaire',
  mixed: 'Paiement mixte',
  check: 'Chèque',
  transfer: 'Virement',
  other: 'Autre',
};

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];

export default function PaymentsReport({ dateRange }: PaymentsReportProps) {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [methodSummary, setMethodSummary] = useState<MethodSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMethod, setFilterMethod] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: sales } = await supabase
        .from('receipts')
        .select('id, created_at, ticket_number, total_amount, payment_method, client_id, client_name')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (sales) {
        const mapped: PaymentRow[] = sales.map((s: any) => ({
          date: s.created_at ? s.created_at.substring(0, 10) : '',
          ticket_number: s.ticket_number ?? s.id?.substring(0, 8) ?? '-',
          method: METHOD_LABELS[s.payment_method] ?? s.payment_method ?? '-',
          amount: s.total_amount ?? 0,
          client: s.client_name ?? (s.client_id ? 'Client fidèle' : 'Anonyme'),
        }));
        setRows(mapped);

        const methodMap: Record<string, { count: number; total: number }> = {};
        mapped.forEach((r) => {
          if (!methodMap[r.method]) methodMap[r.method] = { count: 0, total: 0 };
          methodMap[r.method].count += 1;
          methodMap[r.method].total += r.amount;
        });
        const grandTotal = mapped.reduce((s, r) => s + r.amount, 0);
        const summary: MethodSummary[] = Object.entries(methodMap).map(([method, v]) => ({
          method,
          count: v.count,
          total: Math.round(v.total * 100) / 100,
          pct: grandTotal > 0 ? ((v.total / grandTotal) * 100).toFixed(1) : '0.0',
        }));
        setMethodSummary(summary.sort((a, b) => b.total - a.total));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => filterMethod === 'all' || r.method === filterMethod);
  const totalAmount = filtered.reduce((s, r) => s + r.amount, 0);
  const totalTickets = filtered.length;

  const pieData = methodSummary.map((s, i) => ({ name: s.method, value: s.total, color: COLORS[i % COLORS.length] }));

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport Paiements',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Mode de paiement', key: 'method', width: 20 },
        { header: 'Montant (€)', key: 'amount', width: 16 },
        { header: 'Client', key: 'client', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-paiements-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport Paiements',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Mode de paiement', key: 'method', width: 20 },
        { header: 'Montant (€)', key: 'amount', width: 16 },
        { header: 'Client', key: 'client', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-paiements-${dateRange.from}-${dateRange.to}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total encaissé', value: `${totalAmount.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-rose-50 text-rose-700' },
          { label: 'Transactions', value: totalTickets, icon: 'CreditCardIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'Modes de paiement', value: methodSummary.length, icon: 'QueueListIcon', color: 'bg-amber-50 text-amber-700' },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-xl border border-border p-4">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${kpi.color}`}>
              <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} />
            </div>
            <p className="text-2xl font-bold text-foreground">{loading ? '—' : kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Répartition par mode de paiement</h3>
          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Chargement...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Mode', 'Transactions', 'Total', '%'].map((h) => (
                    <th key={h} className="text-left pb-2 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {methodSummary.map((s, i) => (
                  <tr key={s.method} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="py-2 font-medium text-foreground">{s.method}</td>
                    <td className="py-2 text-muted-foreground">{s.count}</td>
                    <td className="py-2 font-semibold text-foreground">{s.total.toFixed(2)} €</td>
                    <td className="py-2 text-muted-foreground">{s.pct} %</td>
                  </tr>
                ))}
                {methodSummary.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {!loading && pieData.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Répartition visuelle</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value">
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)} €`, '']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
          <option value="all">Tous les modes</option>
          {methodSummary.map((s) => <option key={s.method} value={s.method}>{s.method}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={handleExportPDF} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="DocumentArrowDownIcon" size={14} /> PDF
          </button>
          <button onClick={handleExportExcel} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium text-emerald-700 transition-colors">
            <Icon name="TableCellsIcon" size={14} /> Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Date', 'N° Ticket', 'Mode de paiement', 'Montant', 'Client'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.ticket_number}</td>
                    <td className="px-4 py-3 text-foreground">{row.method}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.amount.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.client}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
