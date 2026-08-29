'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  clientType: string;
  loyaltyPoints: number;
  loyaltyTier: string;
  totalSpent: number;
  totalVisits: number;
  avgBasket: number;
  lastPurchaseAt: string | null;
  daysSincePurchase: number;
  balanceDue: number;
  createdAt: string;
  segment: string;
  topCategory: string | null;
  categoryRevenue: Record<string, number>;
}

interface Analytics {
  clients: ClientRow[];
  stats: { total: number; totalRevenue: number; avgSpentPerClient: number; activeClients: number; withBalanceDue: number };
  segments: Record<string, number>;
  clientTypes: Record<string, number>;
  topCities: { city: string; revenue: number }[];
  topCategories: { name: string; revenue: number }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SEGMENT_META: Record<string, { label: string; color: string; bg: string; desc: string }> = {
  championne:  { label: 'Championnes',   color: '#059669', bg: 'bg-emerald-100 text-emerald-700', desc: 'Achat récent, fréquent, gros panier' },
  fidele:      { label: 'Fidèles',       color: '#2563eb', bg: 'bg-blue-100 text-blue-700',       desc: 'Reviennent régulièrement' },
  nouvelle:    { label: 'Nouvelles',     color: '#7c3aed', bg: 'bg-violet-100 text-violet-700',   desc: 'Premières visites récentes' },
  occasionnelle:{ label: 'Occasionnelles',color: '#d97706', bg: 'bg-amber-100 text-amber-700',    desc: 'Achètent de temps en temps' },
  a_risque:    { label: 'À risque',      color: '#ea580c', bg: 'bg-orange-100 text-orange-700',   desc: 'Plus de 90 jours sans achat' },
  perdue:      { label: 'Perdues',       color: '#dc2626', bg: 'bg-red-100 text-red-700',         desc: 'Absentes depuis + de 6 mois' },
};

const TYPE_LABELS: Record<string, string> = {
  particulier: 'Particulière', professionnel: 'Pro', vip: 'VIP', abonne: 'Abonnée', non_abonne: 'Non abonnée',
};

const CHART_COLORS = ['#c0726a','#2563eb','#7c3aed','#059669','#d97706','#ea580c','#0891b2','#db2777','#84cc16','#6366f1','#14b8a6','#a855f7'];

function fmt(n: number) { return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function relativeDate(iso: string | null): string {
  if (!iso) return 'Jamais';
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d < 30) return `Il y a ${d} j`;
  if (d < 365) return `Il y a ${Math.floor(d / 30)} mois`;
  return `Il y a ${Math.floor(d / 365)} an(s)`;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ClientAnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterSegment, setFilterSegment] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterCity, setFilterCity] = useState('all');
  const [sortBy, setSortBy] = useState<'totalSpent' | 'totalVisits' | 'daysSincePurchase' | 'loyaltyPoints' | 'avgBasket'>('totalSpent');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [showCharts, setShowCharts] = useState(true);
  const [page, setPage] = useState(1);
  const PER_PAGE = 50;

  useEffect(() => {
    fetch('/api/clients/analytics')
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  // Unique cities & categories for filters
  const allCities = useMemo(() => {
    if (!data) return [];
    const s = new Set<string>();
    data.clients.forEach((c) => { if (c.city) s.add(c.city); });
    return [...s].sort();
  }, [data]);

  const allCategories = useMemo(() => {
    if (!data) return [];
    return data.topCategories.map((c) => c.name);
  }, [data]);

  // Filtered + sorted clients
  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.clients;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').includes(q) ||
        (c.city ?? '').toLowerCase().includes(q)
      );
    }
    if (filterSegment !== 'all') rows = rows.filter((c) => c.segment === filterSegment);
    if (filterType !== 'all') rows = rows.filter((c) => c.clientType === filterType);
    if (filterCity !== 'all') rows = rows.filter((c) => c.city === filterCity);
    if (filterCategory !== 'all') rows = rows.filter((c) => c.topCategory === filterCategory);

    return [...rows].sort((a, b) => {
      const va = a[sortBy] as number;
      const vb = b[sortBy] as number;
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }, [data, search, filterSegment, filterType, filterCity, filterCategory, sortBy, sortDir]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(col); setSortDir('desc'); }
    setPage(1);
  };

  // CSV export
  const exportCSV = () => {
    const header = ['Prénom','Nom','Type','Segment','CA Total (€)','Visites','Panier moy.','Derniers achat','Catégorie préf.','Points fidélité','Solde dû (€)','Ville','Téléphone','Email'];
    const rows = filtered.map((c) => [
      c.firstName, c.lastName,
      TYPE_LABELS[c.clientType] ?? c.clientType,
      SEGMENT_META[c.segment]?.label ?? c.segment,
      c.totalSpent.toFixed(2),
      c.totalVisits,
      c.avgBasket.toFixed(2),
      c.lastPurchaseAt ? new Date(c.lastPurchaseAt).toLocaleDateString('fr-FR') : 'Jamais',
      c.topCategory ?? '',
      c.loyaltyPoints,
      c.balanceDue.toFixed(2),
      c.city ?? '',
      c.phone ?? '',
      c.email ?? '',
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `clients-segmentation-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    <Icon
      name={sortBy === col ? (sortDir === 'desc' ? 'ChevronDownIcon' : 'ChevronUpIcon') : 'ChevronUpDownIcon'}
      size={13}
      className={sortBy === col ? 'text-primary' : 'text-muted-foreground/50'}
    />
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">

        {/* Header */}
        <div className="border-b border-border bg-white px-6 py-4 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Link href="/clients" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <Icon name="ArrowLeftIcon" size={18} />
              </Link>
              <div>
                <h1 className="text-xl font-700 text-foreground">Analyse & Segmentation clients</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data ? `${data.stats.total} clientes · segmentation RFM + catégories` : 'Chargement…'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowCharts((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-500 text-muted-foreground hover:bg-muted transition-colors">
                <Icon name={showCharts ? 'EyeSlashIcon' : 'EyeIcon'} size={14} />
                {showCharts ? 'Masquer graphiques' : 'Afficher graphiques'}
              </button>
              <button onClick={exportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-600 hover:opacity-90 transition-opacity">
                <Icon name="ArrowDownTrayIcon" size={14} />
                Exporter CSV
              </button>
            </div>
          </div>
        </div>

        <div className="max-w-screen-2xl mx-auto px-6 py-6 space-y-6">

          {loading && (
            <div className="flex items-center justify-center py-32">
              <div className="text-center">
                <Icon name="ArrowPathIcon" size={32} className="animate-spin text-primary mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Analyse de toutes vos clientes…</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{error}</div>
          )}

          {data && (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total clientes', value: data.stats.total.toLocaleString('fr-FR'), icon: 'UsersIcon', accent: 'default' },
                  { label: 'CA total généré', value: `${fmt(data.stats.totalRevenue)} €`, icon: 'BanknotesIcon', accent: 'success' },
                  { label: 'CA moyen/cliente', value: `${fmt(data.stats.avgSpentPerClient)} €`, icon: 'CalculatorIcon', accent: 'info' },
                  { label: 'Actives (< 90 j)', value: data.stats.activeClients.toLocaleString('fr-FR'), icon: 'SparklesIcon', accent: 'warning' },
                  { label: 'Soldes impayés', value: data.stats.withBalanceDue.toLocaleString('fr-FR'), icon: 'ExclamationTriangleIcon', accent: 'danger' },
                ].map((k) => {
                  const styles: Record<string, string> = {
                    default: 'bg-white border-border',
                    success: 'bg-emerald-50 border-emerald-200',
                    info: 'bg-blue-50 border-blue-200',
                    warning: 'bg-amber-50 border-amber-200',
                    danger: 'bg-red-50 border-red-200',
                  };
                  const iconStyles: Record<string, string> = {
                    default: 'bg-primary/10 text-primary',
                    success: 'bg-emerald-100 text-emerald-600',
                    info: 'bg-blue-100 text-blue-600',
                    warning: 'bg-amber-100 text-amber-600',
                    danger: 'bg-red-100 text-red-600',
                  };
                  return (
                    <div key={k.label} className={`rounded-xl border p-4 shadow-card ${styles[k.accent]}`}>
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconStyles[k.accent]}`}>
                        <Icon name={k.icon as any} size={16} />
                      </div>
                      <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide">{k.label}</p>
                      <p className="text-xl font-700 text-foreground mt-0.5">{k.value}</p>
                    </div>
                  );
                })}
              </div>

              {/* Segment pills */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setFilterSegment('all'); setPage(1); }}
                  className={`px-4 py-2 rounded-full text-sm font-600 border transition-all ${filterSegment === 'all' ? 'bg-foreground text-background border-foreground' : 'bg-white text-muted-foreground border-border hover:border-foreground hover:text-foreground'}`}
                >
                  Toutes ({data.stats.total})
                </button>
                {Object.entries(SEGMENT_META).map(([key, meta]) => (
                  <button key={key}
                    onClick={() => { setFilterSegment(key); setPage(1); }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-600 border transition-all ${filterSegment === key ? 'text-white border-transparent' : 'bg-white text-muted-foreground border-border hover:text-foreground hover:border-current'}`}
                    style={filterSegment === key ? { backgroundColor: meta.color, borderColor: meta.color } : {}}
                    title={meta.desc}
                  >
                    {meta.label}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${filterSegment === key ? 'bg-white/20' : 'bg-muted'}`}>
                      {data.segments[key] ?? 0}
                    </span>
                  </button>
                ))}
              </div>

              {/* Charts */}
              {showCharts && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Top 10 clients */}
                  <div className="lg:col-span-2 bg-white border border-border rounded-xl p-5">
                    <h3 className="text-[14px] font-700 text-foreground mb-1">Top 10 clientes par CA</h3>
                    <p className="text-xs text-muted-foreground mb-4">Cumulé depuis le début</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        layout="vertical"
                        data={[...data.clients].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 10).map((c) => ({
                          name: `${c.firstName} ${c.lastName.charAt(0)}.`,
                          ca: c.totalSpent,
                        }))}
                        margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(25,20%,92%)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: any) => [`${fmt(v)} €`, 'CA total']} />
                        <Bar dataKey="ca" fill="#c0726a" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Segments + Categories */}
                  <div className="space-y-5">
                    {/* Segment donut */}
                    <div className="bg-white border border-border rounded-xl p-5">
                      <h3 className="text-[14px] font-700 text-foreground mb-3">Segments RFM</h3>
                      <ResponsiveContainer width="100%" height={130}>
                        <PieChart>
                          <Pie
                            data={Object.entries(data.segments).map(([key, count]) => ({ name: SEGMENT_META[key]?.label ?? key, value: count, color: SEGMENT_META[key]?.color ?? '#6b7280' }))}
                            cx="50%" cy="50%" outerRadius={55} innerRadius={30} dataKey="value"
                          >
                            {Object.entries(data.segments).map(([key], i) => (
                              <Cell key={i} fill={SEGMENT_META[key]?.color ?? '#6b7280'} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: any) => [v, '']} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1 mt-2">
                        {Object.entries(data.segments).map(([key, count]) => (
                          <div key={key} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SEGMENT_META[key]?.color }} />
                              <span className="text-muted-foreground">{SEGMENT_META[key]?.label ?? key}</span>
                            </div>
                            <span className="font-600">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top categories */}
                    <div className="bg-white border border-border rounded-xl p-5">
                      <h3 className="text-[14px] font-700 text-foreground mb-3">CA par catégorie</h3>
                      <div className="space-y-2">
                        {data.topCategories.slice(0, 6).map((cat, i) => {
                          const max = data.topCategories[0]?.revenue ?? 1;
                          return (
                            <div key={cat.name}>
                              <div className="flex justify-between text-xs mb-0.5">
                                <span className="text-muted-foreground truncate max-w-[140px]">{cat.name}</span>
                                <span className="font-600 tabular-nums">{fmt(cat.revenue)} €</span>
                              </div>
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(cat.revenue / max) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters row */}
              <div className="bg-white border border-border rounded-xl p-4">
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex-1 min-w-[200px] relative">
                    <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                      placeholder="Nom, email, téléphone, ville…"
                      className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <select value={filterType} onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
                    className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="all">Tous les types</option>
                    {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>

                  <select value={filterCategory} onChange={(e) => { setFilterCategory(e.target.value); setPage(1); }}
                    className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="all">Toutes catégories</option>
                    {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select value={filterCity} onChange={(e) => { setFilterCity(e.target.value); setPage(1); }}
                    className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="all">Toutes les villes</option>
                    {allCities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <div className="ml-auto text-xs text-muted-foreground font-500">
                    {filtered.length} cliente{filtered.length > 1 ? 's' : ''} trouvée{filtered.length > 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-white border border-border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide">Cliente</th>
                        <th className="text-left px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide">Segment</th>
                        <th className="text-left px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide">Catégorie préf.</th>
                        <th className="text-right px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort('totalSpent')}>
                          <span className="flex items-center justify-end gap-1">CA total <SortIcon col="totalSpent" /></span>
                        </th>
                        <th className="text-right px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort('totalVisits')}>
                          <span className="flex items-center justify-end gap-1">Visites <SortIcon col="totalVisits" /></span>
                        </th>
                        <th className="text-right px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort('avgBasket')}>
                          <span className="flex items-center justify-end gap-1">Panier moy. <SortIcon col="avgBasket" /></span>
                        </th>
                        <th className="text-right px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort('daysSincePurchase')}>
                          <span className="flex items-center justify-end gap-1">Dernier achat <SortIcon col="daysSincePurchase" /></span>
                        </th>
                        <th className="text-right px-3 py-3 text-xs font-700 text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground select-none"
                          onClick={() => toggleSort('loyaltyPoints')}>
                          <span className="flex items-center justify-end gap-1">Points <SortIcon col="loyaltyPoints" /></span>
                        </th>
                        <th className="px-3 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {paginated.map((c) => {
                        const seg = SEGMENT_META[c.segment];
                        const initials = `${c.firstName.charAt(0)}${c.lastName.charAt(0)}`.toUpperCase();
                        return (
                          <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-700 shrink-0">
                                  {initials}
                                </div>
                                <div>
                                  <Link href={`/clients/${c.id}`} className="font-600 text-foreground hover:text-primary transition-colors">
                                    {c.firstName} {c.lastName}
                                  </Link>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full ${
                                      c.clientType === 'vip' ? 'bg-amber-100 text-amber-700' :
                                      c.clientType === 'professionnel' ? 'bg-violet-100 text-violet-700' :
                                      c.clientType === 'abonne' ? 'bg-blue-100 text-blue-700' :
                                      'bg-muted text-muted-foreground'
                                    }`}>
                                      {TYPE_LABELS[c.clientType] ?? c.clientType}
                                    </span>
                                    {c.city && <span className="text-[10px] text-muted-foreground">{c.city}</span>}
                                    {c.balanceDue > 0 && (
                                      <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                        Doit {fmt(c.balanceDue)} €
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`text-[11px] font-600 px-2 py-1 rounded-full ${seg?.bg ?? 'bg-muted text-muted-foreground'}`}>
                                {seg?.label ?? c.segment}
                              </span>
                            </td>
                            <td className="px-3 py-3">
                              {c.topCategory ? (
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{c.topCategory}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="font-700 text-foreground tabular-nums">{fmt(c.totalSpent)} €</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-muted-foreground tabular-nums">{c.totalVisits}</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-muted-foreground tabular-nums">{fmt(c.avgBasket)} €</span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className={`text-xs tabular-nums ${c.daysSincePurchase > 90 ? 'text-red-600 font-600' : c.daysSincePurchase > 60 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                                {relativeDate(c.lastPurchaseAt)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              <span className="text-muted-foreground tabular-nums">{c.loyaltyPoints.toLocaleString('fr-FR')}</span>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {c.whatsapp && (
                                  <a
                                    href={`https://wa.me/${c.whatsapp.replace(/\D/g, '')}`}
                                    target="_blank" rel="noreferrer"
                                    className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
                                    title="WhatsApp"
                                  >
                                    <Icon name="ChatBubbleLeftEllipsisIcon" size={15} />
                                  </a>
                                )}
                                <Link href={`/clients/${c.id}`}
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                                  <Icon name="ChevronRightIcon" size={15} />
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {paginated.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                            Aucune cliente pour ces filtres
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/30">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} sur {filtered.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
                        className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors">
                        <Icon name="ChevronLeftIcon" size={14} />
                      </button>
                      <span className="text-xs px-3 font-500">{page} / {totalPages}</span>
                      <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}
                        className="p-1.5 rounded-lg border border-border disabled:opacity-40 hover:bg-muted transition-colors">
                        <Icon name="ChevronRightIcon" size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
