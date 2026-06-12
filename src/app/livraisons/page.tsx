'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  deliveryService,
  type Delivery,
  type DeliveryStatus,
  type CreateDeliveryInput,
  DELIVERY_STATUS_CONFIG,
} from '@/lib/services/deliveryService';

type DriverOption = { id: string; name: string; phone: string | null; driverStatus: string };

const LIVRAISON_COUNTRY_CODES: Record<string, string> = {
  'Martinique': 'MQ', 'Guadeloupe': 'GP', 'Guyane': 'GF', 'Guyane française': 'GF',
  'France': 'FR', 'Saint-Martin': 'MF', 'MQ': 'MQ', 'GP': 'GP', 'GF': 'GF', 'FR': 'FR',
};

function parseLivraisonAddress(addr: string): { address1: string; city: string; zip: string; country: string } {
  const segs = addr.split(', ').map((s) => s.trim());
  const country = segs.length >= 1 ? segs[segs.length - 1] : '';
  const zip = segs.length >= 2 && /^\d{4,6}$/.test(segs[segs.length - 2]) ? segs[segs.length - 2] : '';
  const cityIdx = zip ? segs.length - 3 : segs.length - 2;
  const city = cityIdx >= 0 ? segs[cityIdx] : '';
  const address1 = segs.slice(0, Math.max(0, cityIdx)).join(', ');
  return { address1: address1 || addr, city, zip, country };
}

function createColissimoLinkFromDelivery(clientName: string, address: string, phone?: string | null): string {
  const parts = clientName.trim().split(/\s+/);
  const lastName = (parts.length > 1 ? parts[parts.length - 1] : clientName).toUpperCase();
  const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
  const { address1, city, zip, country } = parseLivraisonAddress(address);
  const countryCode = LIVRAISON_COUNTRY_CODES[country] || 'MQ';
  const params = new URLSearchParams({
    dest_nom: lastName,
    dest_prenom: firstName,
    dest_adresse1: address1,
    dest_cp: zip,
    dest_ville: city.toUpperCase(),
    dest_pays: countryCode,
    dest_tel: phone ?? '',
    exp_nom: 'LE MONDE DE L ESTHETIQUE',
    exp_adresse1: 'Zone de Gros la Jambette',
    exp_cp: '97232',
    exp_ville: 'LE LAMENTIN',
    exp_pays: 'MQ',
    exp_tel: '0696016998',
  });
  return 'https://www.colissimo.entreprise.laposte.fr/portail_colissimo/?' + params.toString();
}

const TABS: { key: DeliveryStatus | 'all'; label: string }[] = [
  { key: 'all',       label: 'Toutes' },
  { key: 'pending',   label: 'En attente' },
  { key: 'assigned',  label: 'Assignées' },
  { key: 'en_route',  label: 'En route' },
  { key: 'arrived',   label: 'Arrivées' },
  { key: 'delivered', label: 'Livrées' },
  { key: 'problem',   label: 'Problèmes' },
  { key: 'cancelled', label: 'Annulées' },
];

const EMPTY_FORM: CreateDeliveryInput = {
  clientName: '',
  clientPhone: '',
  deliveryAddress: '',
  deliveryNotes: '',
  totalAmount: undefined,
  estimatedTime: '',
  assignedTo: '',
};

export default function LivraisonsPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DeliveryStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CreateDeliveryInput>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [newShopifyIds, setNewShopifyIds] = useState<Set<string>>(new Set());
  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDone = useRef(false);
  const channelRef = useRef<any>(null);

  const loadAll = useCallback(async () => {
    // Load deliveries and drivers independently so a missing table on one side
    // does not prevent the other from loading (e.g. drivers populate the dropdown
    // even while the deliveries table is being created).
    const [dels, drvs] = await Promise.all([
      deliveryService.getAll().catch((e: any) => {
        console.error('[livraisons] deliveries load error:', e?.message ?? e);
        return [] as Delivery[];
      }),
      fetch('/api/livreurs')
        .then((r) => r.json())
        .then((d) => (d.drivers ?? []).map((dr: any) => ({
          id: dr.id,
          name: `${dr.first_name ?? ''} ${dr.last_name ?? ''}`.trim(),
          phone: dr.phone ?? null,
          driverStatus: dr.driver_status ?? 'off',
        })))
        .catch((e: any) => {
          console.error('[livraisons] drivers load error:', e?.message ?? e);
          return [] as DriverOption[];
        }),
    ]);

    setDeliveries(dels);
    setDrivers(drvs);

    // Track new Shopify orders that arrive after initial load
    if (!initialLoadDone.current) {
      dels.forEach((d) => seenIdsRef.current.add(d.id));
      initialLoadDone.current = true;
    } else {
      const incoming = dels.filter(
        (d) => d.shopifyOrderId && !seenIdsRef.current.has(d.id)
      );
      if (incoming.length > 0) {
        setNewShopifyIds((prev) => {
          const next = new Set(prev);
          incoming.forEach((d) => next.add(d.id));
          return next;
        });
        incoming.forEach((d) => seenIdsRef.current.add(d.id));
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
    const supabase = createClient();
    const channel = supabase
      .channel('admin-deliveries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, loadAll)
      .subscribe();
    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [loadAll]);

  // KPIs
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalOrders    = deliveries.filter((d) => d.status !== 'cancelled').length;
  const driversOnline  = drivers.filter((d) => d.driverStatus === 'on').length;
  const todayDelivered = deliveries.filter((d) => d.status === 'delivered' && d.deliveredAt?.startsWith(todayStr)).length;
  const enRouteCount   = deliveries.filter((d) => d.status === 'en_route').length;

  const filtered = tab === 'all'
    ? deliveries.filter((d) => d.status !== 'cancelled')
    : deliveries.filter((d) => d.status === tab);

  const handleAssign = async (deliveryId: string, driverId: string) => {
    setAssigningId(deliveryId);
    try {
      const res = await fetch(`/api/livraisons/${deliveryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to_driver: driverId || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('[livraisons] assign error:', d.error);
      }
    } catch (e: any) {
      console.error('[livraisons] assign error:', e.message);
    } finally {
      setAssigningId(null);
      loadAll();
    }
  };

  const handleCancel = async (deliveryId: string) => {
    if (!confirm('Annuler cette livraison ?')) return;
    try { await deliveryService.cancel(deliveryId); } catch { /* ignore */ }
    loadAll();
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.clientName.trim() || !form.deliveryAddress.trim()) {
      setFormError('Nom du client et adresse requis.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      await deliveryService.create({
        ...form,
        assignedTo: form.assignedTo || undefined,
        totalAmount: form.totalAmount ? Number(form.totalAmount) : undefined,
        estimatedTime: form.estimatedTime || undefined,
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      loadAll();
    } catch (err: any) {
      const msg: string = err?.message ?? String(err ?? 'Erreur inconnue');
      console.error('[livraisons] create error:', msg);
      setFormError(`Erreur : ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-600 font-medium transition-colors mb-1">
            <span>←</span> Dashboard
          </a>
          <h1 className="text-2xl font-black text-gray-900">Livraisons</h1>
          <p className="text-sm text-gray-500">Gestion des livraisons en temps réel</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/livreurs"
            className="flex items-center gap-2 px-4 py-2.5 border-2 border-orange-500 text-orange-500 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm"
          >
            🚗 Gérer les livreurs
          </a>
          <button
            onClick={() => { setShowForm(true); setFormError(''); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nouvelle livraison
          </button>
        </div>
      </div>

      {/* Shopify new-order notification banner */}
      {newShopifyIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-300 rounded-2xl px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🛍️</span>
            <div>
              <p className="text-sm font-bold text-green-800">
                {newShopifyIds.size} nouvelle{newShopifyIds.size > 1 ? 's' : ''} commande{newShopifyIds.size > 1 ? 's' : ''} Shopify
              </p>
              <p className="text-xs text-green-600">Reçue{newShopifyIds.size > 1 ? 's' : ''} en temps réel — en attente d'assignation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setTab('pending'); setNewShopifyIds(new Set()); }}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
            >
              Voir
            </button>
            <button
              onClick={() => setNewShopifyIds(new Set())}
              className="text-green-500 hover:text-green-700 text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Commandes actives', value: totalOrders,    icon: '📦', bg: 'bg-blue-50 border-blue-200' },
          { label: 'Livreurs en ligne', value: driversOnline,  icon: '🟢', bg: 'bg-green-50 border-green-200' },
          { label: 'Livrées auj.',      value: todayDelivered, icon: '✅', bg: 'bg-emerald-50 border-emerald-200' },
          { label: 'En route',          value: enRouteCount,   icon: '🚚', bg: 'bg-orange-50 border-orange-200' },
        ].map((kpi) => (
          <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.bg}`}>
            <p className="text-3xl font-black text-gray-900">{kpi.value}</p>
            <p className="text-xs font-semibold text-gray-600 mt-1">{kpi.icon} {kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const count = t.key === 'all'
            ? deliveries.filter((d) => d.status !== 'cancelled').length
            : deliveries.filter((d) => d.status === t.key).length;
          const shopifyPendingCount = t.key === 'pending'
            ? deliveries.filter((d) => d.status === 'pending' && d.shopifyOrderId).length
            : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={[
                'shrink-0 px-3 py-2 rounded-xl text-sm font-bold transition-all border flex items-center gap-1.5',
                tab === t.key
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50',
              ].join(' ')}
            >
              {t.label}
              {count > 0 && (
                <span className={`text-xs ${tab === t.key ? 'opacity-80' : 'text-gray-400'}`}>
                  {count}
                </span>
              )}
              {shopifyPendingCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-500 text-white rounded-full leading-none">
                  {shopifyPendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-gray-500 font-semibold">Aucune livraison</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Commande</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Adresse</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Articles</th>
                  <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Montant</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Livreur</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((d) => {
                  const cfg = DELIVERY_STATUS_CONFIG[d.status] ?? { label: d.status, color: 'text-gray-800', bg: 'bg-gray-100 border-gray-300', dot: 'bg-gray-400' };
                  const products = d.products ?? [];
                  const isNewShopify = newShopifyIds.has(d.id);
                  return (
                    <tr key={d.id} className={`hover:bg-gray-50 transition-colors ${isNewShopify ? 'bg-green-50/60' : ''}`}>
                      {/* Order# */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs text-gray-500">
                            {d.shopifyOrderNumber ? d.shopifyOrderNumber : '—'}
                          </span>
                          {d.receiptId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-pink-100 text-pink-700 border border-pink-200 rounded-md leading-none">
                              🧾 Caisse
                            </span>
                          )}
                          {d.shopifyOrderId && !d.receiptId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-700 border border-green-200 rounded-md leading-none">
                              🛒 Shopify
                            </span>
                          )}
                          {!d.shopifyOrderId && !d.receiptId && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 border border-gray-200 rounded-md leading-none">
                              📝 Manuel
                            </span>
                          )}
                          {isNewShopify && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-700 border border-orange-200 rounded-md leading-none animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(d.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </td>

                      {/* Client */}
                      <td className="px-4 py-3">
                        <p className="font-bold text-gray-900 text-sm">{d.clientName}</p>
                        {d.clientPhone && (
                          <a href={`tel:${d.clientPhone}`} className="text-xs text-blue-500">{d.clientPhone}</a>
                        )}
                      </td>

                      {/* Address */}
                      <td className="px-4 py-3 hidden md:table-cell max-w-[180px]">
                        <p className="text-xs text-gray-600 line-clamp-2">{d.deliveryAddress}</p>
                      </td>

                      {/* Items */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <span className="text-xs text-gray-500">{products.length} article{products.length !== 1 ? 's' : ''}</span>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3 text-right hidden md:table-cell">
                        {d.totalAmount != null ? (
                          <span className="text-sm font-bold text-gray-800">{d.totalAmount.toFixed(2)} €</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Driver assign */}
                      <td className="px-4 py-3 min-w-[150px]">
                        {d.status === 'delivered' || d.status === 'cancelled' ? (
                          <span className="text-xs text-gray-500">{d.driverName ?? '—'}</span>
                        ) : (
                          <select
                            value={d.assignedTo ?? ''}
                            onChange={(e) => handleAssign(d.id, e.target.value)}
                            disabled={assigningId === d.id}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-orange-400 bg-white disabled:opacity-50"
                          >
                            <option value="">— Assigner —</option>
                            {drivers.map((dr) => (
                              <option key={dr.id} value={dr.id}>
                                {dr.name} {dr.driverStatus === 'on' ? '🟢' : '⚫'}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 items-start">
                          {d.deliveryAddress && (
                            <button
                              onClick={() => window.open(createColissimoLinkFromDelivery(d.clientName, d.deliveryAddress, d.clientPhone), '_blank')}
                              title="Créer étiquette Colissimo"
                              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                            >
                              📦 Créer étiquette
                            </button>
                          )}
                          {d.status !== 'delivered' && d.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCancel(d.id)}
                              className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors"
                            >
                              Annuler
                            </button>
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

      {/* Create delivery modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowForm(false)} />
          <div className="relative w-full md:max-w-lg bg-white rounded-t-3xl md:rounded-2xl shadow-xl max-h-[90dvh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between rounded-t-3xl md:rounded-t-2xl z-10">
              <h2 className="text-lg font-black text-gray-900">Nouvelle livraison</h2>
              <button
                onClick={() => setShowForm(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-5 space-y-4">
              <Field label="Nom du client *">
                <input
                  type="text"
                  value={form.clientName}
                  onChange={(e) => setForm((f) => ({ ...f, clientName: e.target.value }))}
                  placeholder="Prénom Nom"
                  className="input"
                  required
                />
              </Field>

              <Field label="Téléphone">
                <input
                  type="tel"
                  value={form.clientPhone ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, clientPhone: e.target.value }))}
                  placeholder="+596 696 00 00 00"
                  className="input"
                />
              </Field>

              <Field label="Adresse de livraison *">
                <textarea
                  value={form.deliveryAddress}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))}
                  placeholder="Rue, ville, code postal…"
                  rows={2}
                  className="input resize-none"
                  required
                />
              </Field>

              <Field label="Notes">
                <input
                  type="text"
                  value={form.deliveryNotes ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, deliveryNotes: e.target.value }))}
                  placeholder="Interphone, code porte…"
                  className="input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Montant (€)">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.totalAmount ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value ? Number(e.target.value) : undefined }))}
                    placeholder="0.00"
                    className="input"
                  />
                </Field>
                <Field label="Heure estimée">
                  <input
                    type="datetime-local"
                    value={form.estimatedTime ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, estimatedTime: e.target.value }))}
                    className="input"
                  />
                </Field>
              </div>

              <Field label="Assigner un livreur">
                <select
                  value={form.assignedTo ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="input"
                >
                  <option value="">— Aucun —</option>
                  {drivers.map((dr) => (
                    <option key={dr.id} value={dr.id}>
                      {dr.name} {dr.driverStatus === 'on' ? '🟢' : '⚫'}
                    </option>
                  ))}
                </select>
              </Field>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{formError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .input {
          width: 100%;
          padding: 0.625rem 0.875rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.75rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus { border-color: #f97316; }
      `}</style>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
