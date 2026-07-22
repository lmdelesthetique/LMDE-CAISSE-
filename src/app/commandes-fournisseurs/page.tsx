'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { supplierOrderService, FoOrder, FoOrderStatus } from '@/lib/services/supplierOrderService';
import { createClient } from '@/lib/supabase/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

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
  const [groupFilter, setGroupFilter] = useState('');
  // Group management
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [assigningGroup, setAssigningGroup] = useState(false);
  const [groupSuccess, setGroupSuccess] = useState<string | null>(null);

  // WhatsApp supplier notify
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  const [notifyDone, setNotifyDone] = useState<Set<string>>(new Set());
  const [notifyError, setNotifyError] = useState<string | null>(null);

  // wa.me links returned by notify-supplier
  const [waLinks, setWaLinks] = useState<Record<string, string>>({});

  // Unread supplier message badges per order
  const [unreadPerOrder, setUnreadPerOrder] = useState<Record<string, number>>({});

  // Admin push notification state
  const [pushStatus, setPushStatus] = useState<'unknown' | 'granted' | 'denied' | 'subscribing'>('unknown');
  const [pushError, setPushError] = useState<string | null>(null);
  const pushInitialized = useRef(false);

  const loadUnread = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-messages/unread-per-order');
      if (res.ok) {
        const data = await res.json();
        setUnreadPerOrder(data.counts ?? {});
      }
    } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, s] = await Promise.all([
        supplierOrderService.getAll(),
        supplierOrderService.getDashboardStats(),
      ]);
      setOrders(data);
      setStats(s);
      // Sync stale totals in background after display is shown
      fetch('/api/fo-orders/sync-totals', { method: 'POST' })
        .then(r => r.json())
        .then(d => { if (d.fixed > 0) supplierOrderService.getAll().then(setOrders); })
        .catch(() => {});
    } finally {
      setLoading(false);
    }
  }, []);

  // Check current push permission state
  useEffect(() => {
    if (pushInitialized.current) return;
    pushInitialized.current = true;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') setPushStatus('granted');
    else if (Notification.permission === 'denied') setPushStatus('denied');
    else setPushStatus('unknown');
  }, []);

  // Realtime: listen for new supplier messages → refresh unread badges
  useEffect(() => {
    loadUnread();
    const supabase = createClient();
    const channel = supabase
      .channel('admin-supplier-msgs')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'supplier_messages',
        filter: "sender=eq.supplier",
      }, () => {
        loadUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadUnread]);

  useEffect(() => { load(); }, [load]);

  const handleEnablePushNotifications = async () => {
    setPushStatus('subscribing');
    setPushError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus('denied');
        setPushError('Notifications refusées. Activez-les dans les paramètres du navigateur.');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) throw new Error('VAPID key manquante');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          isAdmin: true,
        }),
      });
      if (!res.ok) throw new Error('Erreur enregistrement subscription');
      setPushStatus('granted');
    } catch (e: any) {
      setPushStatus('unknown');
      setPushError(e.message || 'Erreur activation notifications');
    }
  };

  const groups = [...new Set(orders.map((o) => o.orderGroup).filter(Boolean))] as string[];

  const filtered = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchSearch = !q || o.orderNumber.toLowerCase().includes(q) || (o.supplierName || '').toLowerCase().includes(q) || (o.orderGroup || '').toLowerCase().includes(q);
    let matchTab = true;
    if (tab === 'draft') matchTab = o.orderStatus === 'draft';
    else if (tab === 'active') matchTab = ACTIVE_STATUSES.includes(o.orderStatus);
    else if (tab === 'shipped') matchTab = o.orderStatus === 'shipped';
    else if (tab === 'received') matchTab = RECEIVED_STATUSES.includes(o.orderStatus);
    else if (tab === 'suspended') matchTab = o.orderStatus === 'suspended';
    const matchGroup = !groupFilter || o.orderGroup === groupFilter;
    return matchSearch && matchTab && matchGroup;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(o => o.id)));
    }
  };

  const handleAssignGroup = async () => {
    if (!newGroupName.trim() || selectedIds.size === 0) return;
    setAssigningGroup(true);
    setGroupSuccess(null);
    try {
      await Promise.all(
        [...selectedIds].map(id => supplierOrderService.update(id, { orderGroup: newGroupName.trim() }))
      );
      setGroupSuccess(`✅ ${selectedIds.size} commande${selectedIds.size > 1 ? 's' : ''} assignée${selectedIds.size > 1 ? 's' : ''} au groupe "${newGroupName.trim()}"`);
      setSelectedIds(new Set());
      setNewGroupName('');
      load();
    } finally {
      setAssigningGroup(false);
    }
  };

  const handleNotifySupplier = async (orderId: string) => {
    setNotifyingId(orderId);
    setNotifyError(null);
    try {
      const res = await fetch(`/api/fo-orders/${orderId}/notify-supplier`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setNotifyError(data.error || 'Échec notification fournisseur');
        setTimeout(() => setNotifyError(null), 5000);
      } else {
        setNotifyDone(prev => new Set([...prev, orderId]));
        if (data.waLink) {
          setWaLinks(prev => ({ ...prev, [orderId]: data.waLink }));
          window.open(data.waLink, '_blank');
        }
      }
    } catch {
      setNotifyError('Erreur réseau');
      setTimeout(() => setNotifyError(null), 5000);
    } finally {
      setNotifyingId(null);
    }
  };

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
        <div className="flex flex-wrap gap-3 mb-3">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher par numéro, fournisseur ou groupe..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 min-w-[200px]"
          >
            <option value="">Tous les groupes</option>
            {groups.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <button
            onClick={() => { setShowGroupPanel(p => !p); setGroupSuccess(null); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-500 transition-colors ${showGroupPanel ? 'bg-violet-50 border-violet-300 text-violet-700' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            <Icon name="FolderIcon" size={15} />
            Gérer les groupes
            {selectedIds.size > 0 && (
              <span className="bg-violet-600 text-white text-[11px] font-700 rounded-full px-1.5 py-0.5 leading-none">{selectedIds.size}</span>
            )}
          </button>
        </div>

        {/* Group management panel */}
        {showGroupPanel && (
          <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <Icon name="FolderIcon" size={16} className="text-violet-600" />
              <h3 className="font-600 text-sm text-violet-800">Gérer les groupes de commandes</h3>
              <span className="text-xs text-violet-600">— Cochez les commandes dans le tableau, puis assignez-les à un groupe</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {/* Existing groups quick-assign */}
              {groups.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {groups.map(g => (
                    <button
                      key={g}
                      onClick={() => setNewGroupName(g)}
                      className={`px-3 py-1.5 rounded-full text-xs font-600 border transition-colors ${newGroupName === g ? 'bg-violet-600 text-white border-violet-600' : 'bg-white text-violet-700 border-violet-300 hover:bg-violet-100'}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Nom du groupe (ex: Contenaire 1, Groupage Juin...)"
                  className="flex-1 px-3 py-1.5 border border-violet-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleAssignGroup()}
                />
                <button
                  onClick={handleAssignGroup}
                  disabled={!newGroupName.trim() || selectedIds.size === 0 || assigningGroup}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-500 hover:bg-violet-700 transition-colors disabled:opacity-40"
                >
                  {assigningGroup ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Icon name="CheckIcon" size={14} />}
                  Assigner ({selectedIds.size})
                </button>
                {selectedIds.size > 0 && (
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    className="px-3 py-1.5 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                  >
                    Désélectionner
                  </button>
                )}
              </div>
            </div>
            {groupSuccess && (
              <p className="mt-2 text-sm text-violet-700 font-500">{groupSuccess}</p>
            )}
          </div>
        )}

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

        {/* Group total counter bar */}
        {groupFilter && !loading && (
          <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 flex items-center gap-5 flex-wrap">
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Icon name="FolderIcon" size={14} className="text-violet-700" />
                </div>
                <span className="font-700 text-violet-900 text-sm">{groupFilter}</span>
              </div>
              <div className="h-5 w-px bg-violet-200 hidden sm:block" />
              <div className="flex gap-6 flex-1 flex-wrap">
                <div>
                  <p className="text-[10px] font-600 text-violet-500 uppercase tracking-wide">Commandes</p>
                  <p className="font-700 text-violet-900 text-lg leading-tight">{filtered.length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-600 text-violet-500 uppercase tracking-wide">Total dépenses groupe</p>
                  <p className="font-700 text-violet-900 text-2xl leading-tight">
                    {filtered.reduce((s, o) => s + (o.totalRealCost || o.subtotal || 0), 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-600 text-violet-500 uppercase tracking-wide">Envoyées</p>
                  <p className="font-700 text-blue-700 text-lg leading-tight">{filtered.filter(o => o.orderStatus === 'sent').length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-600 text-violet-500 uppercase tracking-wide">Brouillons</p>
                  <p className="font-700 text-gray-600 text-lg leading-tight">{filtered.filter(o => o.orderStatus === 'draft').length}</p>
                </div>
              </div>
              <button
                onClick={() => setGroupFilter('')}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-300 text-xs font-500 text-violet-700 hover:bg-violet-100 transition-colors"
              >
                <Icon name="XMarkIcon" size={12} />
                Effacer filtre
              </button>
            </div>
          </div>
        )}

        {/* Admin push notification banner */}
        {pushStatus === 'unknown' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <span className="text-lg">🔔</span>
            <div className="flex-1">
              <p className="text-sm font-600 text-blue-900">Recevez les messages fournisseurs en temps réel</p>
              <p className="text-xs text-blue-700 mt-0.5">Activez les notifications pour être alerté quand un fournisseur vous envoie un message.</p>
            </div>
            <button
              onClick={handleEnablePushNotifications}
              className="shrink-0 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-600 hover:bg-blue-700 transition-colors"
            >
              <span>Activer les notifications</span>
            </button>
          </div>
        )}
        {pushStatus === 'subscribing' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-blue-800">Activation en cours...</p>
          </div>
        )}
        {pushStatus === 'granted' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
            <span className="text-lg">✅</span>
            <p className="text-sm font-600 text-emerald-800">Notifications activées — vous recevrez une alerte pour chaque message fournisseur.</p>
          </div>
        )}
        {pushStatus === 'denied' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <span className="text-lg">⚠️</span>
            <p className="text-sm text-amber-800">{pushError || 'Notifications bloquées. Autorisez-les dans les paramètres navigateur.'}</p>
          </div>
        )}
        {pushError && pushStatus === 'unknown' && (
          <div className="mb-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <span>⚠️ {pushError}</span>
          </div>
        )}

        {/* WhatsApp error toast */}
        {notifyError && (
          <div className="mb-3 flex items-center gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <Icon name="ExclamationCircleIcon" size={15} className="shrink-0" />
            <span className="flex-1">{notifyError}</span>
            <button onClick={() => setNotifyError(null)}><Icon name="XMarkIcon" size={14} /></button>
          </div>
        )}

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
                    {showGroupPanel && (
                      <th className="px-3 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={filtered.length > 0 && selectedIds.size === filtered.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 rounded border-border text-violet-600 focus:ring-violet-400 cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">N° Commande</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Fournisseur</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Groupe</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Statut</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Paiement</th>
                    <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Montant</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Livraison</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Facture</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((order) => {
                    const unreadCount = unreadPerOrder[order.id] ?? 0;
                    return (
                    <tr key={order.id} className={`hover:bg-muted/20 transition-colors ${selectedIds.has(order.id) ? 'bg-violet-50/50' : unreadCount > 0 ? 'bg-blue-50/40' : ''}`}>
                      {showGroupPanel && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggleSelect(order.id)}
                            className="w-4 h-4 rounded border-border text-violet-600 focus:ring-violet-400 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="font-600 text-foreground">{order.orderNumber}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{order.supplierName || '—'}</td>
                      <td className="px-4 py-3">
                        {order.orderGroup ? (
                          <div>
                            <button
                              onClick={() => setGroupFilter(order.orderGroup === groupFilter ? '' : order.orderGroup!)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-600 bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-colors"
                            >
                              {order.orderGroup}
                            </button>
                            {order.transportMethod && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {({ avion: '✈️ Avion', bateau: '🚢 Bateau', camion: '🚛 Camion', courrier: '📦 Courrier', autre: 'Autre' } as Record<string,string>)[order.transportMethod] ?? order.transportMethod}
                              </p>
                            )}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
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
                        {Math.max(order.totalRealCost || 0, order.subtotal || 0).toFixed(2)} {order.currency}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(order.createdAt).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {order.expectedDeliveryAt ? new Date(order.expectedDeliveryAt).toLocaleDateString('fr-FR') : '—'}
                      </td>

                      {/* ── Colonne Facture / Messagerie ── */}
                      <td className="px-4 py-3">
                        {!['draft', 'cancelled', 'suspended'].includes(order.orderStatus) && (
                          order.invoiceReceivedAt ? (
                            <Link
                              href={`/commandes-fournisseurs/${order.id}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-700 bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 transition-colors"
                              title={`Facture reçue le ${new Date(order.invoiceReceivedAt).toLocaleDateString('fr-FR')}`}
                            >
                              <span>✅</span>
                              Facture reçue
                            </Link>
                          ) : (
                            <Link
                              href={`/commandes-fournisseurs/${order.id}?tab=messaging`}
                              className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-700 transition-colors ${
                                unreadCount > 0
                                  ? 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700'
                                  : 'bg-violet-50 text-violet-700 border border-violet-300 hover:bg-violet-100'
                              }`}
                              title={unreadCount > 0 ? `${unreadCount} message(s) non lu(s)` : 'Accéder à la messagerie fournisseur'}
                            >
                              💬 Messagerie
                              {unreadCount > 0 && (
                                <span className="ml-1 bg-white text-blue-700 text-[10px] font-800 rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center">
                                  {unreadCount}
                                </span>
                              )}
                            </Link>
                          )
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/commandes-fournisseurs/${order.id}`}
                            className="flex items-center gap-1 text-xs text-primary hover:underline font-500"
                          >
                            Voir
                            <Icon name="ChevronRightIcon" size={12} />
                          </Link>
                          {order.supplierId && (
                            <Link
                              href={`/suppliers/${order.supplierId}`}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-600 bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                              title="Voir la fiche fournisseur"
                            >
                              🏭 Fiche fournisseur
                            </Link>
                          )}
                          {order.orderStatus === 'sent' && (
                            notifyDone.has(order.id) && waLinks[order.id] ? (
                              <a
                                href={waLinks[order.id]}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-600 bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors"
                                title="Ouvrir WhatsApp pour relancer le fournisseur"
                              >
                                📲 Relance
                              </a>
                            ) : (
                              <button
                                onClick={() => handleNotifySupplier(order.id)}
                                disabled={notifyingId === order.id || notifyDone.has(order.id)}
                                title="Notifier le fournisseur et ouvrir WhatsApp"
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-600 transition-colors ${
                                  notifyDone.has(order.id)
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
                                } disabled:opacity-50`}
                              >
                                {notifyingId === order.id ? (
                                  <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                                ) : notifyDone.has(order.id) ? (
                                  <Icon name="CheckIcon" size={11} />
                                ) : (
                                  <span>📲</span>
                                )}
                                {notifyDone.has(order.id) ? 'Notifié' : 'Relance'}
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
