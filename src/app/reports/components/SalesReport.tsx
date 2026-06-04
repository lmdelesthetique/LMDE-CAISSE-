'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface SalesReportProps {
  dateRange: DateRange;
}

interface SaleRow {
  date: string;
  ticket_number: string;
  client: string;
  items: number;
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
}

interface CategoryDrillRow {
  category: string;
  quantity: number;
  revenue: number;
  avg_price: number;
}

interface DailyData {
  day: string;
  revenue: number;
  tickets: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Espèces',
  card: 'Carte',
  mixed: 'Mixte',
  check: 'Chèque',
  transfer: 'Virement',
  other: 'Autre',
};

export default function SalesReport({ dateRange }: SalesReportProps) {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryDrillRow[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillCategory, setDrillCategory] = useState<string | null>(null);
  const [view, setView] = useState<'overview' | 'detail' | 'category'>('overview');

  const kpis = {
    totalRevenue: rows.reduce((s, r) => s + r.total, 0),
    totalTickets: rows.length,
    avgBasket: rows.length > 0 ? rows.reduce((s, r) => s + r.total, 0) / rows.length : 0,
    totalDiscount: rows.reduce((s, r) => s + r.discount, 0),
  };

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    try {
      // Fetch sales/tickets
      const { data: rawSales } = await supabase
        .from('receipts')
        .select('id, created_at, ticket_number, client_id, client_name, total_amount, discount_amount, payment_method, items_count, items, is_demo')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to + 'T23:59:59')
        .order('created_at', { ascending: false });

      const sales = (rawSales ?? []).filter((s: any) => {
        if (s.is_demo === true) return false;
        const cn = (s.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
        return cn !== 'CHRISTY LHOMME';
      });

      if (sales.length >= 0) {
        const mapped: SaleRow[] = sales.map((s: any) => ({
          date: s.created_at ? s.created_at.substring(0, 10) : '',
          ticket_number: s.ticket_number ?? s.id?.substring(0, 8) ?? '-',
          client: s.client_id ? 'Client' : 'Anonyme',
          items: s.items_count ?? 0,
          subtotal: (s.total_amount ?? 0) + (s.discount_amount ?? 0),
          discount: s.discount_amount ?? 0,
          total: s.total_amount ?? 0,
          payment_method: PAYMENT_LABELS[s.payment_method] ?? s.payment_method ?? '-',
        }));
        setRows(mapped);

        // Build daily chart data
        const byDay: Record<string, { revenue: number; tickets: number }> = {};
        mapped.forEach((r) => {
          if (!byDay[r.date]) byDay[r.date] = { revenue: 0, tickets: 0 };
          byDay[r.date].revenue += r.total;
          byDay[r.date].tickets += 1;
        });
        const daily = Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, v]) => ({ day: day.substring(5), revenue: Math.round(v.revenue * 100) / 100, tickets: v.tickets }));
        setDailyData(daily);

        // Category drill-down from items jsonb
        const catMap: Record<string, { quantity: number; revenue: number }> = {};
        sales.forEach((s: any) => {
          const items: any[] = Array.isArray(s.items) ? s.items : [];
          items.forEach((item: any) => {
            const cat = item.category ?? item.categoryName ?? 'Non catégorisé';
            if (!catMap[cat]) catMap[cat] = { quantity: 0, revenue: 0 };
            catMap[cat].quantity += item.quantity ?? 1;
            catMap[cat].revenue += (item.quantity ?? 1) * (item.unit_price ?? item.price ?? 0);
          });
        });
        const catRows: CategoryDrillRow[] = Object.entries(catMap).map(([category, v]) => ({
          category,
          quantity: v.quantity,
          revenue: Math.round(v.revenue * 100) / 100,
          avg_price: v.quantity > 0 ? Math.round((v.revenue / v.quantity) * 100) / 100 : 0,
        }));
        setCategoryRows(catRows.sort((a, b) => b.revenue - a.revenue));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport Ventes',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Client', key: 'client', width: 16 },
        { header: 'Articles', key: 'items', width: 10 },
        { header: 'Remise (€)', key: 'discount', width: 14 },
        { header: 'Total (€)', key: 'total', width: 14 },
        { header: 'Paiement', key: 'payment_method', width: 16 },
      ],
      rows,
      filename: `rapport-ventes-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport Ventes',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Date', key: 'date', width: 14 },
        { header: 'N° Ticket', key: 'ticket_number', width: 16 },
        { header: 'Client', key: 'client', width: 16 },
        { header: 'Articles', key: 'items', width: 10 },
        { header: 'Remise (€)', key: 'discount', width: 14 },
        { header: 'Total (€)', key: 'total', width: 14 },
        { header: 'Paiement', key: 'payment_method', width: 16 },
      ],
      rows,
      filename: `rapport-ventes-${dateRange.from}-${dateRange.to}`,
    });
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'CA Total', value: `${kpis.totalRevenue.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'Tickets', value: kpis.totalTickets, icon: 'ReceiptRefundIcon', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Panier moyen', value: `${kpis.avgBasket.toFixed(2)} €`, icon: 'ShoppingCartIcon', color: 'bg-amber-50 text-amber-700' },
          { label: 'Remises totales', value: `${kpis.totalDiscount.toFixed(2)} €`, icon: 'TagIcon', color: 'bg-rose-50 text-rose-700' },
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

      {/* Chart */}
      {!loading && dailyData.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Évolution du CA journalier</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [`${v.toFixed(2)} €`, 'CA']} />
              <Line type="monotone" dataKey="revenue" stroke="#4F46E5" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* View switcher + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {[
            { id: 'overview', label: 'Aperçu' },
            { id: 'detail', label: 'Détail tickets' },
            { id: 'category', label: 'Par catégorie' },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id as typeof view)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === v.id ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon name="DocumentArrowDownIcon" size={14} />
            PDF
          </button>
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-medium text-emerald-700 transition-colors"
          >
            <Icon name="TableCellsIcon" size={14} />
            Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
          </div>
        ) : view === 'category' ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Catégorie', 'Quantité vendue', 'CA (€)', 'Prix moyen (€)'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categoryRows.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée</td></tr>
              ) : (
                categoryRows.map((row, i) => (
                  <tr key={row.category} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.quantity}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.revenue.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.avg_price.toFixed(2)} €</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Date', 'N° Ticket', 'Client', 'Articles', 'Remise', 'Total', 'Paiement'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Aucune vente sur cette période</td></tr>
              ) : (
                rows.slice(0, view === 'overview' ? 10 : undefined).map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 text-muted-foreground">{row.date}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{row.ticket_number}</td>
                    <td className="px-4 py-3 text-foreground">{row.client}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.items}</td>
                    <td className="px-4 py-3 text-rose-600">-{row.discount.toFixed(2)} €</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.total.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.payment_method}</td>
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
