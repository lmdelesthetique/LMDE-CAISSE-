'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Payment {
  id: string;
  status: string;
  amount: number;
  amountDue: number;
  currency: string;
  date: number;
  email: string;
  customerName: string;
  description: string;
  hostedUrl: string | null;
  attempt: number;
  nextAttempt: number | null;
  subscriptionId: string | null;
}

interface Subscription {
  id: string;
  status: string;
  email: string;
  customerName: string;
  amount: number;
  currency: string;
  interval: string;
  currentPeriodEnd: number;
  createdAt: number;
  cancelAtPeriodEnd: boolean;
}

interface Stats {
  activeCount: number;
  pastDueCount: number;
  revenueThisMonth: number;
  newThisMonth: number;
  paidThisMonthCount: number;
  failedThisMonthCount: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  paid:           { label: 'Payé',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  open:           { label: 'En attente',    color: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400' },
  void:           { label: 'Annulé',        color: 'bg-gray-100 text-gray-500 border-gray-200',          dot: 'bg-gray-400' },
  uncollectible:  { label: 'Irrécupérable', color: 'bg-red-50 text-red-700 border-red-200',              dot: 'bg-red-500' },
  active:         { label: 'Actif',          color: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  past_due:       { label: 'Impayé',         color: 'bg-red-50 text-red-700 border-red-200',              dot: 'bg-red-500' },
  canceled:       { label: 'Résilié',        color: 'bg-gray-100 text-gray-500 border-gray-200',          dot: 'bg-gray-400' },
  trialing:       { label: 'Essai',          color: 'bg-blue-50 text-blue-700 border-blue-200',           dot: 'bg-blue-400' },
  unpaid:         { label: 'Non payé',       color: 'bg-red-50 text-red-700 border-red-200',              dot: 'bg-red-500' },
};

function fmt(ts: number) {
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtAmount(amount: number, currency: string) {
  return amount.toLocaleString('fr-FR', { style: 'currency', currency: currency.toUpperCase() });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'bg-gray-100 text-gray-500 border-gray-200', dot: 'bg-gray-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-600 border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

type Tab = 'paiements' | 'abonnements';

export default function PaiementsPage() {
  const router = useRouter();
  const [data, setData] = useState<{ stats: Stats; payments: Payment[]; subscriptions: Subscription[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('paiements');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/stripe/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); } else { setData(d); }
      })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoading(false));
  }, []);

  const refresh = () => {
    setLoading(true);
    setError(null);
    fetch('/api/stripe/dashboard')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoading(false));
  };

  const filteredPayments = data?.payments.filter(p => filter === 'all' || p.status === filter) ?? [];
  const filteredSubs = data?.subscriptions.filter(s => filter === 'all' || s.status === filter) ?? [];

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/abonnements')}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-600 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Retour
            </button>
            <div>
              <h1 className="text-2xl font-800 text-gray-900">Suivi des paiements</h1>
              <p className="text-sm text-gray-500 mt-0.5">Tous les paiements Stripe — tunnel de vente + liens manuels</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-600 text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualiser
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
            <p className="font-600">Erreur Stripe : {error}</p>
            {error.toLowerCase().includes('publishable') || error.toLowerCase().includes('secret') ? (
              <p className="text-red-600">
                La variable <code className="bg-red-100 px-1 rounded">STRIPE_SECRET_KEY</code> dans Vercel contient une clé publique (<code>pk_...</code>). Remplacez-la par votre clé <strong>secrete</strong> (<code>sk_live_...</code>) depuis le tableau de bord Stripe → Developeurs → Cles API.
              </p>
            ) : null}
          </div>
        )}

        {/* KPI Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Abonnés actifs',      value: data.stats.activeCount,             color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Impayés',              value: data.stats.pastDueCount,            color: 'text-red-700',     bg: 'bg-red-50' },
              { label: 'Revenus ce mois',      value: fmtAmount(data.stats.revenueThisMonth, 'eur'), color: 'text-violet-700', bg: 'bg-violet-50' },
              { label: 'Nouveaux ce mois',     value: data.stats.newThisMonth,            color: 'text-blue-700',    bg: 'bg-blue-50' },
              { label: 'Paiements réussis',    value: data.stats.paidThisMonthCount,      color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Paiements échoués',    value: data.stats.failedThisMonthCount,    color: 'text-amber-700',   bg: 'bg-amber-50' },
            ].map(k => (
              <div key={k.label} className={`${k.bg} rounded-xl p-4`}>
                <p className="text-xs text-gray-500 font-500 mb-1">{k.label}</p>
                <p className={`text-xl font-800 ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          {([
            { id: 'paiements',    label: 'Paiements / Factures' },
            { id: 'abonnements',  label: 'Abonnements actifs' },
          ] as { id: Tab; label: string }[]).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setFilter('all'); }}
              className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
              {data && (
                <span className="ml-2 text-xs opacity-60">
                  {t.id === 'paiements' ? data.payments.length : data.subscriptions.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        {data && tab === 'paiements' && (
          <div className="flex gap-2 flex-wrap">
            {[
              { v: 'all',           l: `Tous (${data.payments.length})` },
              { v: 'paid',          l: `Payés (${data.payments.filter(p => p.status === 'paid').length})` },
              { v: 'open',          l: `En attente (${data.payments.filter(p => p.status === 'open').length})` },
              { v: 'uncollectible', l: `Échoués (${data.payments.filter(p => p.status === 'uncollectible').length})` },
            ].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${
                  filter === f.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >{f.l}</button>
            ))}
          </div>
        )}

        {data && tab === 'abonnements' && (
          <div className="flex gap-2 flex-wrap">
            {[
              { v: 'all',      l: `Tous (${data.subscriptions.length})` },
              { v: 'active',   l: `Actifs (${data.subscriptions.filter(s => s.status === 'active').length})` },
              { v: 'past_due', l: `Impayés (${data.subscriptions.filter(s => s.status === 'past_due').length})` },
              { v: 'canceled', l: `Résiliés (${data.subscriptions.filter(s => s.status === 'canceled').length})` },
            ].map(f => (
              <button key={f.v} onClick={() => setFilter(f.v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-600 border transition-colors ${
                  filter === f.v ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >{f.l}</button>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">Chargement depuis Stripe…</p>
          </div>
        )}

        {/* Payments table */}
        {!loading && data && tab === 'paiements' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredPayments.length === 0 ? (
              <p className="text-center text-gray-400 py-12 text-sm">Aucun paiement</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Montant</th>
                    <th className="text-center px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Tentatives</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPayments.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(p.date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-500 text-gray-900">{p.customerName !== '—' ? p.customerName : p.email}</p>
                        {p.customerName !== '—' && <p className="text-xs text-gray-400">{p.email}</p>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-right font-600 tabular-nums">
                        {p.status === 'paid'
                          ? <span className="text-emerald-700">{fmtAmount(p.amount, p.currency)}</span>
                          : <span className="text-gray-400">{fmtAmount(p.amountDue, p.currency)}</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        {p.attempt > 0 && (
                          <span className={`text-xs font-600 ${p.attempt > 1 ? 'text-red-600' : 'text-gray-400'}`}>
                            {p.attempt}x
                          </span>
                        )}
                        {p.nextAttempt && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Retry : {fmt(p.nextAttempt)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.hostedUrl && (
                          <a href={p.hostedUrl} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-pink-600 hover:underline font-500">
                            Voir →
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Subscriptions table */}
        {!loading && data && tab === 'abonnements' && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filteredSubs.length === 0 ? (
              <p className="text-center text-gray-400 py-12 text-sm">Aucun abonnement</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Cliente</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Statut</th>
                    <th className="text-right px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Montant</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Prochain paiement</th>
                    <th className="text-left px-4 py-3 text-xs font-600 text-gray-500 uppercase tracking-wide">Abonné depuis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredSubs.map(s => (
                    <tr key={s.id} className={`hover:bg-gray-50 transition-colors ${s.status === 'past_due' ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-500 text-gray-900">{s.customerName !== '—' ? s.customerName : s.email}</p>
                        {s.customerName !== '—' && <p className="text-xs text-gray-400">{s.email}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={s.status} />
                        {s.cancelAtPeriodEnd && (
                          <p className="text-[10px] text-amber-600 mt-1">Se termine le {fmt(s.currentPeriodEnd)}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-600 tabular-nums text-gray-900">
                        {fmtAmount(s.amount, s.currency)}<span className="text-xs font-400 text-gray-400">/{s.interval}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{fmt(s.currentPeriodEnd)}</td>
                      <td className="px-4 py-3 text-gray-400">{fmt(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
