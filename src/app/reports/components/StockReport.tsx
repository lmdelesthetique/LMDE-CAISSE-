'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import type { DateRange } from '../page';
import { exportToPDF, exportToExcel } from '../utils/exportUtils';

interface StockReportProps {
  dateRange: DateRange;
}

interface StockRow {
  product_name: string;
  reference: string;
  category: string;
  current_stock: number;
  min_stock: number;
  status: string;
  purchase_price: number;
  stock_value: number;
}

interface CategoryStock {
  category: string;
  total_items: number;
  total_value: number;
  low_stock: number;
}

export default function StockReport({ dateRange }: StockReportProps) {
  const [rows, setRows] = useState<StockRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [categories, setCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: products } = await supabase
        .from('products')
        .select('id, name, reference, category, stock_quantity, min_stock_alert, purchase_price, product_status')
        .order('stock_quantity', { ascending: true });

      if (products) {
        const mapped: StockRow[] = products.map((p: any) => {
          const stock = p.stock_quantity ?? 0;
          const min = p.min_stock_alert ?? 0;
          const purchasePrice = p.purchase_price ?? 0;
          let status = 'OK';
          if (stock === 0) status = 'Rupture';
          else if (stock <= min) status = 'Faible';
          return {
            product_name: p.name ?? '-',
            reference: p.reference ?? '-',
            category: p.category ?? 'Non catégorisé',
            current_stock: stock,
            min_stock: min,
            status,
            purchase_price: purchasePrice,
            stock_value: Math.round(stock * purchasePrice * 100) / 100,
          };
        });
        setRows(mapped);

        const cats = [...new Set(mapped.map((r) => r.category))].sort();
        setCategories(cats);

        // Category aggregation
        const catMap: Record<string, CategoryStock> = {};
        mapped.forEach((r) => {
          if (!catMap[r.category]) catMap[r.category] = { category: r.category, total_items: 0, total_value: 0, low_stock: 0 };
          catMap[r.category].total_items += r.current_stock;
          catMap[r.category].total_value += r.stock_value;
          if (r.status !== 'OK') catMap[r.category].low_stock += 1;
        });
        setCategoryData(Object.values(catMap).sort((a, b) => b.total_value - a.total_value));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);

  const filtered = rows.filter((r) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterCategory !== 'all' && r.category !== filterCategory) return false;
    return true;
  });

  const totalValue = filtered.reduce((s, r) => s + r.stock_value, 0);
  const ruptures = filtered.filter((r) => r.status === 'Rupture').length;
  const faibles = filtered.filter((r) => r.status === 'Faible').length;

  const handleExportPDF = () => {
    exportToPDF({
      title: 'Rapport Stock',
      subtitle: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      columns: [
        { header: 'Produit', key: 'product_name', width: 24 },
        { header: 'Référence', key: 'reference', width: 16 },
        { header: 'Catégorie', key: 'category', width: 18 },
        { header: 'Stock actuel', key: 'current_stock', width: 14 },
        { header: 'Stock min', key: 'min_stock', width: 12 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Valeur stock (€)', key: 'stock_value', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-stock-${dateRange.from}`,
    });
  };

  const handleExportExcel = () => {
    exportToExcel({
      title: 'Rapport Stock',
      subtitle: `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
      columns: [
        { header: 'Produit', key: 'product_name', width: 24 },
        { header: 'Référence', key: 'reference', width: 16 },
        { header: 'Catégorie', key: 'category', width: 18 },
        { header: 'Stock actuel', key: 'current_stock', width: 14 },
        { header: 'Stock min', key: 'min_stock', width: 12 },
        { header: 'Statut', key: 'status', width: 12 },
        { header: 'Prix achat (€)', key: 'purchase_price', width: 16 },
        { header: 'Valeur stock (€)', key: 'stock_value', width: 16 },
      ],
      rows: filtered,
      filename: `rapport-stock-${dateRange.from}`,
    });
  };

  const statusColor = (s: string) => {
    if (s === 'Rupture') return 'bg-red-100 text-red-700';
    if (s === 'Faible') return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Produits analysés', value: rows.length, icon: 'ArchiveBoxIcon', color: 'bg-blue-50 text-blue-700' },
          { label: 'Valeur totale stock', value: `${totalValue.toFixed(2)} €`, icon: 'BanknotesIcon', color: 'bg-emerald-50 text-emerald-700' },
          { label: 'En rupture', value: ruptures, icon: 'ExclamationTriangleIcon', color: 'bg-red-50 text-red-700' },
          { label: 'Stock faible', value: faibles, icon: 'ArrowTrendingDownIcon', color: 'bg-amber-50 text-amber-700' },
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

      {/* Category chart */}
      {!loading && categoryData.length > 0 && (
        <div className="bg-white rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Valeur stock par catégorie</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={categoryData.slice(0, 10)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="category" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(2)} €`, 'Valeur']} />
              <Bar dataKey="total_value" fill="#F59E0B" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none"
          >
            <option value="all">Tous les statuts</option>
            <option value="OK">OK</option>
            <option value="Faible">Faible</option>
            <option value="Rupture">Rupture</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-border bg-white text-foreground outline-none"
          >
            <option value="all">Toutes catégories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin mr-2" /> Chargement...
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {['Produit', 'Référence', 'Catégorie', 'Stock actuel', 'Stock min', 'Statut', 'Valeur stock'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">Aucun produit</td></tr>
              ) : (
                filtered.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                    <td className="px-4 py-3 font-medium text-foreground">{row.product_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.reference}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-3 text-center font-semibold text-foreground">{row.current_stock}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{row.min_stock}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(row.status)}`}>{row.status}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-foreground">{row.stock_value.toFixed(2)} €</td>
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
