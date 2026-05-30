'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface TaxesReportProps {
  dateRange: DateRange;
}

interface TaxRow {
  date: string;
  ticket_number: string;
  total_ht: number;
  tva_rate: string;
  tva_amount: number;
  total_ttc: number;
}

interface TaxSummary {
  rate: string;
  base_ht: number;
  tva: number;
  ttc: number;
}

const TVA_RATES = [0, 5.5, 10, 20];
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444'];

export default function TaxesReport({ dateRange }: TaxesReportProps) {
  const [rows, setRows] = useState<TaxRow[]>([]);
  const [summary, setSummary] = useState<TaxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRate, setFilterRate] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: sales } = await supabase
        .from('receipts')
        .select('id, created_at, ticket_number, total_amount')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to + 'T23:59:59')
        .order('created_at', { ascending: false });

      if (sales) {
        const mapped: TaxRow[] = sales.map((s: any) => {
          const total = s.total_amount ?? 0;
          const tvaRate = TVA_RATES.find((r) => total >= 0 && total < r) ?? 20;
          const tvaAmount = total - total / (1 + tvaRate / 100);
          const ht = total - tvaAmount;
          return {
            date: s.created_at ? s.created_at.substring(0, 10) : '',
            ticket_number: s.ticket_number ?? s.id?.substring(0, 8) ?? '-',
            total_ht: Math.round(ht * 100) / 100,
            tva_rate: `${tvaRate}%`,
            tva_amount: Math.round(tvaAmount * 100) / 100,
            total_ttc: Math.round(total * 100) / 100,
          };
        });
        setRows(mapped);

        // Build summary by rate
        const rateMap: Record<string, TaxSummary> = {};
        mapped.forEach((r) => {
          if (!rateMap[r.tva_rate]) rateMap[r.tva_rate] = { rate: r.tva_rate, base_ht: 0, tva: 0, ttc: 0 };
          rateMap[r.tva_rate].base_ht += r.total_ht;
          rateMap[r.tva_rate].tva += r.tva_amount;
          rateMap[r.tva_rate].ttc += r.total_ttc;
        });
        setSummary(Object.values(rateMap).sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate)));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => filterRate === 'all' || r.tva_rate === filterRate);
  const totalHT = filtered.reduce((s, r) => s + r.total_ht, 0);
  const totalTVA = filtered.reduce((s, r) => s + r.tva_amount, 0);
  const totalTTC = filtered.reduce((s, r) => s + r.total_ttc, 0);

  const pieData = summary.map((s, i) => ({ name: `TVA ${s.rate}`, value: Math.round(s.tva * 100) / 100, color: COLORS[i % COLORS.length] }));

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport TVA',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Total HT (€)', key: 'total_ht', width: 16 },
        { header: 'Taux TVA', key: 'tva_rate', width: 12 },
        { header: 'TVA (€)', key: 'tva_amount', width: 14 },
        { header: 'Total TTC (€)', key: 'total_ttc', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-tva-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport TVA',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Total HT (€)', key: 'total_ht', width: 16 },
        { header: 'Taux TVA', key: 'tva_rate', width: 12 },
        { header: 'TVA (€)', key: 'tva_amount', width: 14 },
        { header: 'Total TTC (€)', key: 'total_ttc', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-tva-${dateRange.from}-${dateRange.to}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total HT', value: `${totalHT.toFixed(2)} €`, icon: 'ReceiptPercentIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'TVA collectée', value: `${totalTVA.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-purple-50 text-purple-700' },
          { label: 'Total TTC', value: `${totalTTC.toFixed(2)} €`, icon: 'CalculatorIcon', color: 'bg-emerald-50 text-emerald-700' },
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
        {/* Summary by rate */}
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Récapitulatif par taux</h3>
          {loading ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">Chargement...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['Taux', 'Base HT', 'TVA', 'TTC'].map((h) => (
                    <th key={h} className="text-left pb-2 text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={s.rate} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                    <td className="py-2 font-semibold text-foreground">{s.rate}</td>
                    <td className="py-2 text-muted-foreground">{s.base_ht.toFixed(2)} €</td>
                    <td className="py-2 font-semibold text-purple-700">{s.tva.toFixed(2)} €</td>
                    <td className="py-2 text-foreground">{s.ttc.toFixed(2)} €</td>
                  </tr>
                ))}
                {summary.length === 0 && (
                  <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pie chart */}
        {!loading && pieData.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Répartition TVA collectée</h3>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ name, value }) => `${name}: ${value.toFixed(0)}€`} labelLine={false}>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => [`${v.toFixed(2)} €`, 'TVA']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={filterRate} onChange={(e) => setFilterRate(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
          <option value="all">Tous les taux</option>
          {summary.map((s) => <option key={s.rate} value={s.rate}>{s.rate}</option>)}
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
                {['Date', 'N° Ticket', 'Total HT', 'Taux TVA', 'TVA', 'Total TTC'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.ticket_number}</td>
                    <td className="px-4 py-3 text-foreground">{row.total_ht.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{row.tva_rate}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-purple-700">{row.tva_amount.toFixed(2)} €</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.total_ttc.toFixed(2)} €</td>
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
