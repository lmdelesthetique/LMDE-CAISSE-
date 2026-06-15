'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { supplierOrderService, FoOrder, FoOrderStatus } from '@/lib/services/supplierOrderService';

const STATUS_CONFIG: Record<FoOrderStatus, { label: string; color: string; dot: string }> = {
  draft:                      { label: 'Brouillon',              color: 'text-gray-600 bg-gray-100',    dot: 'bg-gray-400' },
  sent:                       { label: 'Envoyée',                color: 'text-blue-700 bg-blue-50',     dot: 'bg-blue-500' },
  awaiting_validation:        { label: 'Attente validation',     color: 'text-amber-700 bg-amber-50',   dot: 'bg-amber-500' },
  validated:                  { label: 'Validée',                color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  modification_requested:     { label: 'Modif. demandée',        color: 'text-orange-700 bg-orange-50', dot: 'bg-orange-500' },
  payment_pending:            { label: 'Paiement en attente',    color: 'text-amber-700 bg-amber-50',   dot: 'bg-amber-500' },
  payment_in_progress:        { label: 'Paiement en cours',      color: 'text-blue-700 bg-blue-50',     dot: 'bg-blue-500' },
  paid:                       { label: 'Payée',                  color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  payment_received_by_supplier: { label: 'Paiement reçu',        color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  in_preparation:             { label: 'En préparation',         color: 'text-purple-700 bg-purple-50', dot: 'bg-purple-500' },
  in_production:              { label: 'En production',          color: 'text-purple-700 bg-purple-50', dot: 'bg-purple-500' },
  ready_to_ship:              { label: 'Prête à expédier',       color: 'text-indigo-700 bg-indigo-50', dot: 'bg-indigo-500' },
  shipped:                    { label: 'Expédiée',               color: 'text-cyan-700 bg-cyan-50',     dot: 'bg-cyan-500' },
  partially_received:         { label: 'Reçue partiellement',    color: 'text-amber-700 bg-amber-50',   dot: 'bg-amber-500' },
  fully_received:             { label: 'Reçue totalement',       color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  costs_recorded:             { label: 'Frais enregistrés',      color: 'text-teal-700 bg-teal-50',     dot: 'bg-teal-500' },
  stock_integrated:           { label: 'Stock intégré',          color: 'text-green-700 bg-green-50',   dot: 'bg-green-500' },
  closed:                     { label: 'Clôturée',               color: 'text-gray-600 bg-gray-100',    dot: 'bg-gray-400' },
  suspended:                  { label: 'Suspendue',              color: 'text-red-700 bg-red-50',       dot: 'bg-red-500' },
  cancelled:                  { label: 'Annulée',                color: 'text-red-700 bg-red-50',       dot: 'bg-red-500' },
};

const TABS = [
  { id: 'all', label: 'Toutes' },
  { id: 'draft', label: 'Brouillons' },
  { id: 'active', label: 'En cours' },
  { id: 'shipped', label: 'Expédiées' },
  { id: 'received', label: 'Reçues' },
  { id: 'suspended', label: 'Suspendues' },
];

function StatusBadge({ status }: { status: FoOrderStatus }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-500 ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

const ACTIVE_STATUSES: FoOrderStatus[] = ['sent', 'awaiting_validation', 'validated', 'modification_requested', 'payment_pending', 'payment_in_progress', 'paid', 'payment_received_by_supplier', 'in_preparation', 'in_production', 'ready_to_ship'];
const RECEIVED_STATUSES: FoOrderStatus[] = ['partially_received', 'fully_received', 'costs_recorded', 'stock_integrated', 'closed'];

export default function CommandesFournisseursPage() {
  const [orders, setOrders] = useState<FoOrder[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        supplierOrderService.getAll(),
        supplierOrderService.getDashboardStats(),
      ]);
      setOrders(data);
      setStats(s);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.orderNumber.toLowerCase().includes(q) || (o.supplierName || '').toLowerCase().includes(q);
    let matchTab = true;
    if (tab === 'draft') matchTab = o.orderStatus === 'draft';
    else if (tab === 'active') matchTab = ACTIVE_STATUSES.includes(o.orderStatus);
    else if (tab === 'shipped') matchTab = o.orderStatus === 'shipped';
    else if (tab === 'received') matchTab = RECEIVED_STATUSES.includes(o.orderStatus);
    else if (tab === 'suspended') matchTab = o.orderStatus === 'suspended';
    return matchSearch && matchTab;
  });

  const kpis = [
    { label: 'Brouillons', value: stats?.draft ?? 0, icon: 'DocumentIcon', color: 'text-gray-600 bg-gray-100' },
    { label: 'En attente', value: stats?.awaitingValidation ?? 0, icon: 'ClockIcon', color: 'text-amber-600 bg-amber-50' },
    { label: 'À payer', value: stats?.toPay ?? 0, icon: 'BanknotesIcon', color: 'text-red-600 bg-red-50' },
    { label: 'Expédiées', value: stats?.shipped ?? 0, icon: 'TruckIcon', color: 'text-cyan-600 bg-cyan-50' },
    { label: 'Reçues', value: stats?.received ?? 0, icon: 'ArchiveBoxIcon', color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Frais à saisir', value: stats?.costsNotRecorded ?? 0, icon: 'ExclamationTriangleIcon', color: 'text-orange-600 bg-orange-50' },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Commandes Fournisseurs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{orders.length} commande{orders.length !== 1 ? 's' : ''} au total</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const url = `${window.location.origin}/supplier-portal/login`;
                navigator.clipboard?.writeText(url).then(() => alert(`Lien copié :\n${url}`)).catch(() => alert(`Lien portail fournisseur :\n${url}`));
              }}
              className="flex items-center gap-2 border border-border bg-white text-muted-foreground px-3 py-2 rounded-lg text-sm font-500 hover:bg-muted transition-colors"
              title="Copier le lien du portail fournisseur à envoyer à vos fournisseurs"
            >
              <Icon name="LinkIcon" size={14} />
              Lien portail
            </button>
            <Link
              href="/commandes-fournisseurs/nouvelle"
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors"
            >
              <Icon name="PlusIcon" size={16} />
              Nouvelle commande
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white border border-border rounded-xl p-3.5 shadow-card">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.color}`}>
                  <Icon name={k.icon as any} size={16} />
                </div>
                <div>
                  <p className="text-lg font-700 text-foreground">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Sub-nav */}
        <div className="flex flex-wrap gap-2 mb-5">
          {[
            { href: '/commandes-fournisseurs/reassort', label: 'Réassort conseillé', icon: 'ArrowPathIcon' },
            { href: '/commandes-fournisseurs/depenses', label: 'Dépenses fournisseurs', icon: 'ChartBarIcon' },
            { href: '/commandes-fournisseurs/historique', label: 'Historique', icon: 'ClockIcon' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Icon name={item.icon as any} size={14} />
              {item.label}
            </Link>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher par numéro ou fournisseur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-500 border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-12 text-center">
            <Icon name="ShoppingBagIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="font-500 text-foreground">Aucune commande trouvée</p>
            <p className="text-sm text-muted-foreground mt-1">Créez votre première commande fournisseur</p>
            <Link href="/commandes-fournisseurs/nouvelle" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-500 hover:bg-primary/90 transition-colors">
              <Icon name="PlusIcon" size={15} />
              Nouvelle commande
            </Link>
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">N° Commande</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Fournisseur</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Statut</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Paiement</th>
                    <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Montant</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Livraison</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-600 text-foreground">{order.orderNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{order.supplierName || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={order.orderStatus} /></td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-500 ${
                          order.paymentStatus === 'paid' || order.paymentStatus === 'received_by_supplier' ? 'text-emerald-700 bg-emerald-50' :
                          order.paymentStatus === 'partial'? 'text-amber-700 bg-amber-50' : 'text-gray-600 bg-gray-100'
                        }`}>
                          {order.paymentStatus === 'paid' ? 'Payé' :
                           order.paymentStatus === 'received_by_supplier' ? 'Reçu' :
                           order.paymentStatus === 'partial' ? 'Partiel' :
                           order.paymentStatus === 'in_progress'? 'En cours' : 'En attente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-600 text-foreground">
                        {order.totalRealCost.toFixed(2)} {order.currency}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {order.expectedDeliveryAt ? new Date(order.expectedDeliveryAt).toLocaleDateString('fr-FR') : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/commandes-fournisseurs/${order.id}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline font-500"
                        >
                          Voir
                          <Icon name="ChevronRightIcon" size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
