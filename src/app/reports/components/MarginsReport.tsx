'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface MarginsReportProps {
  dateRange: DateRange;
}

interface MarginRow {
  product_name: string;
  category: string;
  qty_sold: number;
  revenue: number;
  cost: number;
  gross_margin: number;
  margin_pct: string;
}

interface CategoryMargin {
  category: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_pct: number;
}

export default function MarginsReport({ dateRange }: MarginsReportProps) {
  const [rows, setRows] = useState<MarginRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryMargin[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<'margin_pct' | 'gross_margin' | 'revenue'>('gross_margin');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      // Fetch receipts with items jsonb in the date range
      const { data: receipts } = await supabase
        .from('receipts')
        .select('items')
        .gte('created_at', dateRange.from)
        .lte('created_at', dateRange.to + 'T23:59:59');

      // Fetch all products for purchase_price lookup (load all, bypass Supabase 1000-row default)
      const products = await fetchAll((from, to) =>
        supabase
          .from('products')
          .select('id, name, category, buy_price, purchase_price')
          .range(from, to)
      );

      const productLookup: Record<string, { name: string; category: string; purchase_price: number }> = {};
      products.forEach((p: any) => {
        productLookup[p.id] = {
          name: p.name ?? 'Produit inconnu',
          category: p.category ?? 'Non catégorisé',
          purchase_price: Number(p.buy_price ?? p.purchase_price ?? 0),
        };
      });

      const productMap: Record<string, { name: string; category: string; qty: number; revenue: number; cost: number }> = {};

      (receipts ?? []).forEach((receipt: any) => {
        const items: any[] = Array.isArray(receipt.items) ? receipt.items : [];
        items.forEach((item: any) => {
          const pid = item.id ?? item.product_id ?? 'unknown';
          const lookup = productLookup[pid];
          const name = item.name ?? lookup?.name ?? 'Produit inconnu';
          const category = item.category ?? item.categoryName ?? lookup?.category ?? 'Non catégorisé';
          const purchasePrice = lookup?.purchase_price ?? item.purchase_price ?? 0;
          const qty = item.quantity ?? 1;
          const rev = qty * (item.unit_price ?? item.price ?? 0);
          const cost = qty * purchasePrice;
          if (!productMap[pid]) productMap[pid] = { name, category, qty: 0, revenue: 0, cost: 0 };
          productMap[pid].qty += qty;
          productMap[pid].revenue += rev;
          productMap[pid].cost += cost;
        });
      });

      const mapped: MarginRow[] = Object.values(productMap).map((p) => {
        const grossMargin = p.revenue - p.cost;
        const marginPct = p.revenue > 0 ? (grossMargin / p.revenue) * 100 : 0;
        return {
          product_name: p.name,
          category: p.category,
          qty_sold: p.qty,
          revenue: Math.round(p.revenue * 100) / 100,
          cost: Math.round(p.cost * 100) / 100,
          gross_margin: Math.round(grossMargin * 100) / 100,
          margin_pct: marginPct.toFixed(1),
        };
      });
      setRows(mapped);

      const cats = [...new Set(mapped.map((r) => r.category))].sort();
      setCategories(cats);

      const catMap: Record<string, CategoryMargin> = {};
      mapped.forEach((r) => {
        if (!catMap[r.category]) catMap[r.category] = { category: r.category, revenue: 0, cost: 0, margin: 0, margin_pct: 0 };
        catMap[r.category].revenue += r.revenue;
        catMap[r.category].cost += r.cost;
        catMap[r.category].margin += r.gross_margin;
      });
      const catArr = Object.values(catMap).map((c) => ({
        ...c,
        margin_pct: c.revenue > 0 ? Math.round((c.margin / c.revenue) * 1000) / 10 : 0,
      }));
      setCategoryData(catArr.sort((a, b) => b.margin - a.margin));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows
    .filter((r) => filterCategory === 'all' || r.category === filterCategory)
    .sort((a, b) => {
      if (sortBy === 'margin_pct') return parseFloat(b.margin_pct) - parseFloat(a.margin_pct);
      if (sortBy === 'revenue') return b.revenue - a.revenue;
      return b.gross_margin - a.gross_margin;
    });

  const totalRevenue = filtered.reduce((s, r) => s + r.revenue, 0);
  const totalCost = filtered.reduce((s, r) => s + r.cost, 0);
  const totalMargin = filtered.reduce((s, r) => s + r.gross_margin, 0);
  const avgMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport Marges',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Produit', key: 'product_name', width: 24 },
        { header: 'Catégorie', key: 'category', width: 18 },
        { header: 'Qté vendue', key: 'qty_sold', width: 12 },
        { header: 'CA (€)', key: 'revenue', width: 14 },
        { header: 'Coût (€)', key: 'cost', width: 14 },
        { header: 'Marge brute (€)', key: 'gross_margin', width: 16 },
        { header: 'Marge %', key: 'margin_pct', width: 12 },
      ],
      rows: filtered,
      filename: `rapport-marges-${dateRange.from}-${dateRange.to}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport Marges',
      subtitle: `Période : ${dateRange.from} → ${dateRange.to}`,
      columns: [
        { header: 'Produit', key: 'product_name', width: 24 },
        { header: 'Catégorie', key: 'category', width: 18 },
        { header: 'Qté vendue', key: 'qty_sold', width: 12 },
        { header: 'CA (€)', key: 'revenue', width: 14 },
        { header: 'Coût (€)', key: 'cost', width: 14 },
        { header: 'Marge brute (€)', key: 'gross_margin', width: 16 },
        { header: 'Marge %', key: 'margin_pct', width: 12 },
      ],
      rows: filtered,
      filename: `rapport-marges-${dateRange.from}-${dateRange.to}`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'CA total', value: `${totalRevenue.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'Coût total', value: `${totalCost.toFixed(2)} €`, icon: 'ArrowTrendingDownIcon', color: 'bg-rose-50 text-rose-700' },
          { label: 'Marge brute', value: `${totalMargin.toFixed(2)} €`, icon: 'ChartBarIcon', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'Taux de marge moyen', value: `${avgMarginPct.toFixed(1)} %`, icon: 'PercentBadgeIcon', color: 'bg-amber-50 text-amber-700' },
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

      {!loading && categoryData.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Marge brute par catégorie</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} €`, 'Marge']} />
              <Bar dataKey="margin" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
            <option value="all">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none">
            <option value="gross_margin">Trier par marge €</option>
            <option value="margin_pct">Trier par marge %</option>
            <option value="revenue">Trier par CA</option>
          </select>
        </div>
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
                {['Produit', 'Catégorie', 'Qté vendue', 'CA (€)', 'Coût (€)', 'Marge brute (€)', 'Marge %'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Aucune donnée sur cette période</td></tr>
              ) : (
                filtered.map((row, i) => {
                  const pct = parseFloat(row.margin_pct);
                  const pctColor = pct >= 40 ? 'text-emerald-600' : pct >= 20 ? 'text-amber-600' : 'text-rose-600';
                  return (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                      <td className="px-4 py-3 font-medium text-foreground">{row.product_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-3 text-center text-muted-foreground">{row.qty_sold}</td>
                      <td className="px-4 py-3 text-foreground">{row.revenue.toFixed(2)} €</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.cost.toFixed(2)} €</td>
                      <td className="px-4 py-3 font-semibold text-foreground">{row.gross_margin.toFixed(2)} €</td>
                      <td className={`px-4 py-3 font-semibold ${pctColor}`}>{row.margin_pct} %</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
