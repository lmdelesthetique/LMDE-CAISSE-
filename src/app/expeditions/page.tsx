'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import { createClient } from '@/lib/supabase/client';
import {
  expeditionService,
  pickupService,
  type Expedition,
  type PickupNotification,
  EXPEDITION_STATUS_CONFIG,
} from '@/lib/services/expeditionService';

type Tab = 'expeditions' | 'pickups';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}

function printColissimoLabel(exp: Expedition) {
  const win = window.open('', '_blank', 'width=480,height=700');
  if (!win) return;
  const products = (exp.products ?? [])
    .map((p) => `<tr><td>${p.name}</td><td style="text-align:center">${p.qty}</td>${p.sku ? `<td>${p.sku}</td>` : '<td>—</td>'}</tr>`)
    .join('');

  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Bon d'expédition ${exp.shopifyOrderNumber ?? exp.id.slice(0,8)}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; font-family:'Courier New',monospace; }
  body { width:10cm; height:15cm; padding:0.5cm; font-size:11px; border:2px solid #000; }
  .header { text-align:center; font-size:14px; font-weight:900; text-transform:uppercase; border-bottom:2px solid #000; padding-bottom:6px; margin-bottom:8px; letter-spacing:2px; }
  .section { margin-bottom:8px; }
  .label { font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#555; margin-bottom:2px; }
  .value { font-size:12px; font-weight:700; }
  .address { font-size:12px; font-weight:700; line-height:1.5; }
  .barcode { text-align:center; font-size:22px; font-weight:900; letter-spacing:4px; border:2px dashed #000; padding:8px; margin:8px 0; }
  table { width:100%; border-collapse:collapse; font-size:10px; }
  th { background:#000; color:#fff; padding:3px 4px; text-align:left; }
  td { border-bottom:1px dotted #999; padding:3px 4px; }
  .carrier { font-size:18px; font-weight:900; text-transform:uppercase; }
  .sep { border:none; border-top:1px dashed #000; margin:6px 0; }
  @media print { @page { size:10cm 15cm; margin:0; } body { border:none; } }
</style></head><body>
  <div class="header">Bon d'expédition</div>

  <div class="section">
    <div class="label">Transporteur</div>
    <div class="carrier">${exp.carrier}</div>
  </div>

  <div class="section">
    <div class="label">Destinataire</div>
    <div class="address">${exp.clientName}${exp.clientPhone ? `<br>${exp.clientPhone}` : ''}<br>${exp.shippingAddress}</div>
  </div>

  <hr class="sep">

  <div class="section">
    <div class="label">Référence commande</div>
    <div class="value">${exp.shopifyOrderNumber ?? '—'}</div>
  </div>

  ${exp.trackingNumber ? `<div class="barcode">${exp.trackingNumber}</div>` : ''}

  <hr class="sep">

  <div class="label">Contenu du colis</div>
  <table>
    <thead><tr><th>Article</th><th>Qté</th><th>SKU</th></tr></thead>
    <tbody>${products}</tbody>
  </table>

  ${exp.totalAmount ? `<hr class="sep"><div style="text-align:right;font-weight:900;font-size:13px">Valeur déclarée : ${exp.totalAmount.toFixed(2)} €</div>` : ''}

  <script>window.onload = () => { window.print(); }<\/script>
</body></html>`);
  win.document.close();
}

// ── Colissimo helpers ─────────────────────────────────────────────────────────

const COLISSIMO_COUNTRY_CODES: Record<string, string> = {
  'Martinique': 'MQ', 'Guadeloupe': 'GP', 'Guyane': 'GF', 'Guyane française': 'GF',
  'France': 'FR', 'Saint-Martin': 'MF', 'Saint Martin': 'MF',
  'MQ': 'MQ', 'GP': 'GP', 'GF': 'GF', 'FR': 'FR', 'MF': 'MF',
};

function parseShippingAddressString(addr: string): { address1: string; city: string; zip: string; country: string } {
  // Format stored by buildAddress: "address1[, address2], city, zip, country"
  const segs = addr.split(', ').map((s) => s.trim());
  const country = segs.length >= 1 ? segs[segs.length - 1] : '';
  const zip = segs.length >= 2 && /^\d{4,6}$/.test(segs[segs.length - 2]) ? segs[segs.length - 2] : '';
  const cityIdx = zip ? segs.length - 3 : segs.length - 2;
  const city = cityIdx >= 0 ? segs[cityIdx] : '';
  const address1 = segs.slice(0, Math.max(0, cityIdx)).join(', ');
  return { address1: address1 || addr, city, zip, country };
}

function createColissimoLinkFromExpedition(exp: Expedition): string {
  const nameParts = exp.clientName.trim().split(/\s+/);
  const lastName = (nameParts.length > 1 ? nameParts[nameParts.length - 1] : exp.clientName).toUpperCase();
  const firstName = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : '';
  const { address1, city, zip, country } = parseShippingAddressString(exp.shippingAddress);
  const countryCode = COLISSIMO_COUNTRY_CODES[country] || 'MQ';
  const params = new URLSearchParams({
    dest_nom: lastName,
    dest_prenom: firstName,
    dest_adresse1: address1,
    dest_cp: zip,
    dest_ville: city.toUpperCase(),
    dest_pays: countryCode,
    dest_tel: exp.clientPhone ?? '',
    exp_nom: 'LE MONDE DE L ESTHETIQUE',
    exp_adresse1: 'Zone de Gros la Jambette',
    exp_cp: '97232',
    exp_ville: 'LE LAMENTIN',
    exp_pays: 'MQ',
    exp_tel: '0696016998',
  });
  return 'https://www.colissimo.entreprise.laposte.fr/?' + params.toString();
}

function exportExpeditionsToColishipCSV(expeditions: Expedition[]) {
  const headers = ['Nom', 'Prenom', 'Adresse1', 'Adresse2', 'CP', 'Ville', 'Pays', 'Telephone', 'Poids', 'Reference', 'Valeur'];
  const rows = expeditions.map((exp) => {
    const parts = exp.clientName.trim().split(/\s+/);
    const lastName = (parts.length > 1 ? parts[parts.length - 1] : exp.clientName).toUpperCase();
    const firstName = parts.length > 1 ? parts.slice(0, -1).join(' ') : '';
    return [lastName, firstName, exp.shippingAddress, '', '', '', 'MQ', exp.clientPhone ?? '', '0.5', exp.shopifyOrderNumber ?? exp.id.slice(0, 8), (exp.totalAmount ?? 0).toFixed(2)];
  });
  const csv = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'coliship_' + new Date().toISOString().split('T')[0] + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ── Expedition row ─────────────────────────────────────────────────────────────

function ExpeditionRow({ exp, onRefresh }: { exp: Expedition; onRefresh: () => void }) {
  const cfg = EXPEDITION_STATUS_CONFIG[exp.status] ?? { label: exp.status, color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400' };
  const [trackingInput, setTrackingInput] = useState('');
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handlePrint = async () => {
    printColissimoLabel(exp);
    if (!exp.labelPrinted) {
      await expeditionService.markLabelPrinted(exp.id);
      onRefresh();
    }
  };

  const handleShipped = async () => {
    setLoading(true);
    await expeditionService.markShipped(exp.id, trackingInput);
    setLoading(false);
    setShowTrackingForm(false);
    onRefresh();
  };

  return (
    <div className={`rounded-xl border p-4 ${exp.status === 'pending' ? 'bg-yellow-50/40 border-yellow-200' : 'bg-white border-border'}`}>
      <div className="flex items-start gap-4">
        {/* Status dot */}
        <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-sm text-foreground">
              {exp.shopifyOrderNumber ?? exp.id.slice(0, 8)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            {exp.labelPrinted && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700">
                Étiquette imprimée
              </span>
            )}
            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(exp.createdAt)}</span>
          </div>

          <p className="text-sm font-semibold text-foreground">{exp.clientName}</p>
          <p className="text-xs text-muted-foreground">{exp.shippingAddress}</p>
          {exp.clientPhone && <p className="text-xs text-muted-foreground">{exp.clientPhone}</p>}

          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
            <span>📦 {exp.carrier}</span>
            {exp.totalAmount != null && <span>· {exp.totalAmount.toFixed(2)} €</span>}
            {exp.trackingNumber && <span>· Suivi : <strong className="text-foreground">{exp.trackingNumber}</strong></span>}
            {exp.products?.length ? <span>· {exp.products.length} article{exp.products.length > 1 ? 's' : ''}</span> : null}
          </div>

          {showTrackingForm && (
            <div className="flex gap-2 mt-3">
              <input
                type="text"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                placeholder="Numéro de suivi (optionnel)"
                className="flex-1 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <button
                onClick={handleShipped}
                disabled={loading}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading ? '...' : 'Confirmer expédition'}
              </button>
              <button
                onClick={() => setShowTrackingForm(false)}
                className="px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
            </svg>
            Bon Colissimo
          </button>

          <button
            onClick={() => window.open(createColissimoLinkFromExpedition(exp), '_blank')}
            title="Créer étiquette Colissimo"
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-3 py-2 rounded-lg font-bold text-sm transition-colors whitespace-nowrap"
          >
            📦 Créer étiquette
          </button>

          {exp.status !== 'shipped' && exp.status !== 'delivered' && exp.status !== 'returned' && (
            <button
              onClick={() => setShowTrackingForm(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-indigo-300 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg hover:bg-indigo-100 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
              Marquer expédié
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pickup row ─────────────────────────────────────────────────────────────────

function PickupRow({ pickup, onRefresh }: { pickup: PickupNotification; onRefresh: () => void }) {
  const [loading, setLoading] = useState(false);

  const statusColors: Record<string, string> = {
    pending:   'bg-yellow-50 border-yellow-200 text-yellow-700',
    notified:  'bg-blue-50 border-blue-200 text-blue-700',
    collected: 'bg-green-50 border-green-200 text-green-700',
    cancelled: 'bg-gray-50 border-gray-200 text-gray-500',
  };

  const statusLabels: Record<string, string> = {
    pending:   'À notifier',
    notified:  'Notifié',
    collected: 'Récupéré',
    cancelled: 'Annulé',
  };

  const handleNotify = async () => {
    setLoading(true);
    await pickupService.markNotified(pickup.id);
    setLoading(false);
    onRefresh();
  };

  const handleCollected = async () => {
    setLoading(true);
    await pickupService.markCollected(pickup.id);
    setLoading(false);
    onRefresh();
  };

  return (
    <div className={`rounded-xl border p-4 ${pickup.status === 'collected' ? 'opacity-60' : 'bg-white'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="font-bold text-sm text-foreground">
              {pickup.shopifyOrderNumber ?? pickup.id.slice(0, 8)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusColors[pickup.status] ?? ''}`}>
              {statusLabels[pickup.status] ?? pickup.status}
            </span>
            <span className="text-[10px] text-muted-foreground ml-auto">{timeAgo(pickup.createdAt)}</span>
          </div>

          <p className="text-sm font-semibold text-foreground">{pickup.clientName}</p>
          {pickup.clientPhone && <p className="text-xs text-muted-foreground">{pickup.clientPhone}</p>}
          {pickup.clientEmail && <p className="text-xs text-muted-foreground">{pickup.clientEmail}</p>}

          <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
            {pickup.totalAmount != null && <span>{pickup.totalAmount.toFixed(2)} €</span>}
            {pickup.products?.length ? <span>· {pickup.products.length} article{pickup.products.length > 1 ? 's' : ''}</span> : null}
            {pickup.products?.slice(0, 3).map((p, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-muted rounded text-[10px]">{p.name} ×{p.qty}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {pickup.status === 'pending' && (
            <button
              onClick={handleNotify}
              disabled={loading}
              className="px-3 py-2 border border-blue-300 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              Notifier client
            </button>
          )}
          {(pickup.status === 'pending' || pickup.status === 'notified') && (
            <button
              onClick={handleCollected}
              disabled={loading}
              className="px-3 py-2 border border-green-300 bg-green-50 text-green-700 text-xs font-bold rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
            >
              Récupéré ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ExpeditionsPage() {
  const [tab, setTab] = useState<Tab>('expeditions');
  const [expeditions, setExpeditions] = useState<Expedition[]>([]);
  const [pickups, setPickups] = useState<PickupNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [exps, pkps] = await Promise.all([
        expeditionService.getAll(),
        pickupService.getAll(),
      ]);
      setExpeditions(exps);
      setPickups(pkps);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const supabase = createClient();
    const ch = supabase
      .channel('expeditions-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expeditions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickup_notifications' }, load)
      .subscribe();
    channelRef.current = ch;
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  const pendingExp = expeditions.filter((e) => e.status === 'pending' || e.status === 'label_generated');
  const shippedExp = expeditions.filter((e) => e.status === 'shipped' || e.status === 'delivered');
  const pendingPickups = pickups.filter((p) => p.status !== 'collected' && p.status !== 'cancelled');
  const collectedPickups = pickups.filter((p) => p.status === 'collected');

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'expeditions', label: 'Expéditions', count: pendingExp.length || undefined },
    { id: 'pickups',     label: 'Retrait magasin', count: pendingPickups.length || undefined },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 py-4 sticky top-0 z-20">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between">
            <div>
              <a href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-pink-600 font-medium transition-colors mb-1">
                <span>←</span> Dashboard
              </a>
              <h1 className="text-2xl font-semibold text-foreground">Expéditions</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Gestion des envois Colissimo et retraits en magasin</p>
            </div>
            <button
              onClick={() => exportExpeditionsToColishipCSV(expeditions)}
              disabled={expeditions.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-yellow-400 hover:bg-yellow-500 text-yellow-900 rounded-lg disabled:opacity-40 transition-colors"
            >
              📥 Coliship CSV
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Actualiser
            </button>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-6 lg:px-8 py-6">
          {/* KPI summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'À expédier',    value: pendingExp.length,      color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200' },
              { label: 'Expédiés',      value: shippedExp.length,      color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200' },
              { label: 'Retrait en att.', value: pendingPickups.length, color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
              { label: 'Récupérés auj.',  value: collectedPickups.filter((p) => p.collectedAt?.startsWith(new Date().toISOString().slice(0, 10))).length, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
            ].map((k) => (
              <div key={k.label} className={`rounded-xl border px-4 py-3 ${k.bg}`}>
                <p className={`text-2xl font-black tabular-nums ${k.color}`}>{loading ? '—' : k.value}</p>
                <p className="text-xs font-semibold text-gray-600 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-5 bg-muted rounded-xl p-1 w-fit">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  tab === t.id ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted-foreground/20 text-muted-foreground'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : tab === 'expeditions' ? (
            <div className="space-y-3">
              {expeditions.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <p className="text-4xl mb-3">📦</p>
                  <p className="font-medium">Aucune expédition</p>
                  <p className="text-sm mt-1">Les commandes Shopify avec livraison standard apparaîtront ici</p>
                </div>
              ) : (
                <>
                  {pendingExp.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">À expédier ({pendingExp.length})</p>
                      {pendingExp.map((e) => <ExpeditionRow key={e.id} exp={e} onRefresh={load} />)}
                    </div>
                  )}
                  {shippedExp.length > 0 && (
                    <div className="space-y-3 mt-4">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Expédiés ({shippedExp.length})</p>
                      {shippedExp.map((e) => <ExpeditionRow key={e.id} exp={e} onRefresh={load} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {pickups.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <p className="text-4xl mb-3">🏪</p>
                  <p className="font-medium">Aucun retrait en attente</p>
                  <p className="text-sm mt-1">Les commandes Shopify avec retrait magasin apparaîtront ici</p>
                </div>
              ) : (
                <>
                  {pendingPickups.length > 0 && (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">En attente ({pendingPickups.length})</p>
                      {pendingPickups.map((p) => <PickupRow key={p.id} pickup={p} onRefresh={load} />)}
                    </div>
                  )}
                  {collectedPickups.length > 0 && (
                    <div className="space-y-3 mt-4 opacity-60">
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Récupérés ({collectedPickups.length})</p>
                      {collectedPickups.map((p) => <PickupRow key={p.id} pickup={p} onRefresh={load} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
