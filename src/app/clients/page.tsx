'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import Icon from '@/components/ui/AppIcon';
import {
  clientService,
  type Client,
  type ClientPurchase,
  type LoyaltyTransaction,
  type ClientSubscription,
  type ClientInternalNote,
} from '@/lib/services/clientService';
import ClientFormModal from './components/ClientFormModal';
import ClientDetailPanel from './components/ClientDetailPanel';
import ClientReminders from './components/ClientReminders';
import Link from 'next/link';

const TIER_CONFIG = {
  bronze: { label: 'Bronze', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  silver: { label: 'Argent', color: 'text-slate-600 bg-slate-50 border-slate-200' },
  gold: { label: 'Or', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  platinum: { label: 'Platine', color: 'text-purple-700 bg-purple-50 border-purple-200' },
};

const CLIENT_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  particulier: { label: 'Particulier', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'UserIcon' },
  professionnel: { label: 'Pro', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: 'BriefcaseIcon' },
  vip: { label: 'VIP', color: 'text-yellow-700 bg-yellow-50 border-yellow-200', icon: 'StarIcon' },
  abonne: { label: 'Abonné', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'CheckBadgeIcon' },
  non_abonne: { label: 'Non abonné', color: 'text-slate-600 bg-slate-50 border-slate-200', icon: 'UserIcon' },
};

const DISCOUNT_LABELS: Record<string, string> = {
  pro_5: 'Pro -5%',
  pro_10: 'Pro -10%',
  pro_15: 'Pro -15%',
  custom: 'Remise perso.',
  vip: 'Avantages VIP',
  classic: 'Fidélité classique',
};

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'particulier' | 'professionnel' | 'vip' | 'abonne' | 'non_abonne';

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailData, setDetailData] = useState<{
    purchases: ClientPurchase[];
    loyalty: LoyaltyTransaction[];
    subscription: ClientSubscription | null;
    notes: ClientInternalNote[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeSubClientIds, setActiveSubClientIds] = useState<Set<string>>(new Set());

  const loadClients = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [data, { data: activeSubs }] = await Promise.all([
      clientService.getAll(),
      supabase
        .from('client_subscriptions')
        .select('client_id')
        .eq('status', 'active'),
    ]);
    setClients(data);
    setActiveSubClientIds(new Set((activeSubs ?? []).map((s: any) => s.client_id)));
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const handleSearch = useCallback(async (val: string) => {
    setSearch(val);
    if (val.trim().length >= 2) {
      const results = await clientService.search(val.trim());
      setClients(results);
    } else if (val.trim().length === 0) {
      loadClients();
    }
  }, [loadClients]);

  const openDetail = async (client: Client) => {
    setSelectedClient(client);
    setDetailLoading(true);
    const [purchases, loyalty, subscription, notes] = await Promise.all([
      clientService.getPurchases(client.id),
      clientService.getLoyaltyTransactions(client.id),
      clientService.getSubscription(client.id),
      clientService.getNotes(client.id),
    ]);
    setDetailData({ purchases, loyalty, subscription, notes });
    setDetailLoading(false);
  };

  const handleSaved = (saved: Client) => {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditingClient(null);
  };

  const filtered = clients.filter((c) => {
    if (filterType !== 'all' && c.clientType !== filterType) return false;
    return true;
  });

  const stats = {
    total: clients.length,
    vip: clients.filter((c) => c.clientType === 'vip').length,
    pro: clients.filter((c) => c.clientType === 'professionnel').length,
    abonne: clients.filter((c) => c.clientType === 'abonne').length,
    totalRevenue: clients.reduce((s, c) => s + c.totalSpent, 0),
  };

  const filterButtons: { id: FilterType; label: string }[] = [
    { id: 'all', label: `Tous (${clients.length})` },
    { id: 'particulier', label: 'Particulier' },
    { id: 'professionnel', label: 'Pro' },
    { id: 'vip', label: 'VIP' },
    { id: 'abonne', label: 'Abonné' },
    { id: 'non_abonne', label: 'Non abonné' },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="bg-white border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-700 text-foreground">Base clients</h1>
              <p className="text-sm text-muted-foreground mt-0.5">{stats.total} client{stats.total > 1 ? 's' : ''} enregistré{stats.total > 1 ? 's' : ''}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/clients/import"
                className="flex items-center gap-2 px-4 py-2 border border-border text-foreground rounded-lg text-sm font-600 hover:bg-muted transition-colors"
              >
                <Icon name="ArrowUpTrayIcon" size={16} />
                Importer
              </Link>
              <button
                onClick={() => { setEditingClient(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity active:scale-95"
              >
                <Icon name="PlusIcon" size={16} />
                Nouveau client
              </button>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: 'Total clients', value: stats.total.toString(), icon: 'UsersIcon', color: 'text-blue-600 bg-blue-50' },
              { label: 'Professionnels', value: stats.pro.toString(), icon: 'BriefcaseIcon', color: 'text-indigo-600 bg-indigo-50' },
              { label: 'VIP', value: stats.vip.toString(), icon: 'StarIcon', color: 'text-yellow-600 bg-yellow-50' },
              { label: 'CA total', value: `${stats.totalRevenue.toFixed(0)} €`, icon: 'BanknotesIcon', color: 'text-emerald-600 bg-emerald-50' },
            ].map((kpi) => (
              <div key={kpi.label} className="flex items-center gap-3 bg-muted/30 rounded-xl px-4 py-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                  <Icon name={kpi.icon as any} size={18} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className="text-base font-700 text-foreground tabular-nums">{kpi.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Client Reminders */}
          <div className="mt-4">
            <ClientReminders />
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border-b border-border px-6 py-3 flex flex-wrap items-center gap-3 shrink-0">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nom, prénom, téléphone, email…"
              className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Type filters */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {filterButtons.map((f) => (
              <button key={f.id} onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-600 transition-colors whitespace-nowrap ${filterType === f.id ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground hover:bg-muted'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 ml-auto border border-border rounded-lg p-0.5">
            <button onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name="Squares2X2Icon" size={15} />
            </button>
            <button onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon name="ListBulletIcon" size={15} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Icon name="ArrowPathIcon" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Icon name="UsersIcon" size={40} className="text-muted-foreground mb-4" />
              <p className="text-base font-500 text-foreground">Aucun client trouvé</p>
              <p className="text-sm text-muted-foreground mt-1">Ajoutez votre premier client avec le bouton ci-dessus</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map((client) => <ClientCard key={client.id} client={client} hasActiveSub={activeSubClientIds.has(client.id)} onClick={() => openDetail(client)} />)}
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Contact</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Dépensé</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Fidélité</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground uppercase tracking-wide">Dernière commande</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((client) => {
                    const typeCfg = CLIENT_TYPE_CONFIG[client.clientType] ?? CLIENT_TYPE_CONFIG.particulier;
                    const tier = TIER_CONFIG[client.loyaltyTier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
                    return (
                      <tr key={client.id} className="hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => openDetail(client)}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs font-700 text-primary">{client.firstName.charAt(0)}{client.lastName.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="font-600 text-foreground">{client.fullName}</p>
                              {client.city && <p className="text-xs text-muted-foreground">{client.city}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <p>{client.phone ?? '—'}</p>
                          {client.email && <p className="text-xs">{client.email}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${typeCfg.color}`}>{typeCfg.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-700 tabular-nums text-foreground">{client.totalSpent.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${tier.color}`}>{tier.label}</span>
                          <p className="text-xs text-muted-foreground mt-0.5">{client.loyaltyPoints} pts</p>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {client.lastPurchaseAt ? new Date(client.lastPurchaseAt).toLocaleDateString('fr-FR') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Icon name="ChevronRightIcon" size={16} className="text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showForm && (
        <ClientFormModal
          client={editingClient}
          onClose={() => { setShowForm(false); setEditingClient(null); }}
          onSaved={handleSaved}
        />
      )}

      {selectedClient && !detailLoading && detailData && (
        <ClientDetailPanel
          client={selectedClient}
          purchases={detailData.purchases}
          loyaltyTransactions={detailData.loyalty}
          subscription={detailData.subscription}
          notes={detailData.notes}
          onEdit={() => { setEditingClient(selectedClient); setSelectedClient(null); setDetailData(null); setShowForm(true); }}
          onClose={() => { setSelectedClient(null); setDetailData(null); }}
          onClientUpdated={(updated) => {
            setSelectedClient(updated);
            setClients((prev) => prev.map((c) => c.id === updated.id ? updated : c));
          }}
          onNotesUpdated={(notes) => setDetailData((d) => d ? { ...d, notes } : d)}
          onSubscriptionUpdated={(sub) => setDetailData((d) => d ? { ...d, subscription: sub } : d)}
        />
      )}

      {detailLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-3 shadow-modal">
            <Icon name="ArrowPathIcon" size={18} className="animate-spin text-primary" />
            <span className="text-sm font-500 text-foreground">Chargement…</span>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

// ── Client Card Component ──────────────────────────────────────────────────────

function ClientCard({ client, hasActiveSub, onClick }: { client: Client; hasActiveSub: boolean; onClick: () => void }) {
  const tier = TIER_CONFIG[client.loyaltyTier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
  const typeCfg = CLIENT_TYPE_CONFIG[client.clientType] ?? CLIENT_TYPE_CONFIG.particulier;
  const hasDiscount = client.loyaltyDiscountType !== null;

  return (
    <button
      onClick={onClick}
      className="text-left bg-white border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all duration-150 group"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <span className="text-sm font-700 text-primary">{client.firstName.charAt(0)}{client.lastName.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-600 text-foreground truncate">{client.fullName}</p>
            <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full border shrink-0 ${tier.color}`}>{tier.label}</span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full border ${typeCfg.color}`}>{typeCfg.label}</span>
            {hasDiscount && (
              <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full border text-rose-700 bg-rose-50 border-rose-200">
                {DISCOUNT_LABELS[client.loyaltyDiscountType!] ?? `${client.loyaltyDiscountValue}%`}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{client.phone ?? client.email ?? 'Aucun contact'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border">
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground">Dépensé</p>
          <p className="text-sm font-700 tabular-nums text-foreground">{client.totalSpent.toFixed(0)} €</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground">Points</p>
          <p className="text-sm font-700 tabular-nums text-foreground">{client.loyaltyPoints}</p>
        </div>
        <div className="text-center">
          <p className="text-[11px] text-muted-foreground">Visites</p>
          <p className="text-sm font-700 tabular-nums text-foreground">{client.totalVisits}</p>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {client.lastPurchaseAt ? (
          <p className="text-[11px] text-muted-foreground">
            Dernière commande: {new Date(client.lastPurchaseAt).toLocaleDateString('fr-FR')}
          </p>
        ) : <span />}
        {client.storeCredit > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-blue-600 font-500">
            <Icon name="CreditCardIcon" size={11} />
            Avoir: {client.storeCredit.toFixed(2)} €
          </div>
        )}
      </div>

      {hasActiveSub && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-700 font-500 bg-emerald-50 rounded-lg px-2 py-1">
          <Icon name="CheckBadgeIcon" size={11} />
          Abonnement actif
        </div>
      )}
    </button>
  );
}
