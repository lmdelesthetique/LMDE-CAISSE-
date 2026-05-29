'use client';

import React, { useEffect, useState, useCallback } from 'react';

interface ShopifyStatus {
  connected: boolean;
  error?: string | null;
  ordersToday: number;
  revenueToday: number;
  lastSyncAt: string | null;
  webhookRegistered: boolean;
  webhookId: string | null;
}

function fmtEur(v: number) {
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function fmtSync(iso: string | null) {
  if (!iso) return 'Jamais';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ShopifyStatusCard() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [registerMsg, setRegisterMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/shopify/status');
      const data: ShopifyStatus = await res.json();
      setStatus(data);
      // Auto-register webhook silently on first load if connected and not yet registered
      if (data.connected && !data.webhookRegistered) {
        fetch('/api/shopify/register-webhook', { method: 'POST' })
          .then((r) => r.json())
          .then((d) => {
            if (d.ok) setStatus((prev) => prev ? { ...prev, webhookRegistered: true, webhookId: d.webhookId ?? null } : prev);
          })
          .catch(() => {});
      }
    } catch {
      setStatus({ connected: false, error: 'Impossible de contacter le serveur', ordersToday: 0, revenueToday: 0, lastSyncAt: null, webhookRegistered: false, webhookId: null });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegisterWebhook = async () => {
    setRegistering(true);
    setRegisterMsg(null);
    try {
      const res = await fetch('/api/shopify/register-webhook', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setStatus((prev) => prev ? { ...prev, webhookRegistered: true, webhookId: data.webhookId ?? null } : prev);
        setRegisterMsg(data.alreadyExists ? '✅ Webhook déjà enregistré' : '✅ Webhook enregistré avec succès');
      } else {
        setRegisterMsg('❌ Erreur lors de l\'enregistrement');
      }
    } catch {
      setRegisterMsg('❌ Erreur réseau');
    } finally {
      setRegistering(false);
      setTimeout(() => setRegisterMsg(null), 5000);
    }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div className="rounded-xl border bg-white p-5 shadow-card h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600">
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>
              <line x1="3" y1="6" x2="21" y2="6"/>
              <path d="M16 10a4 4 0 0 1-8 0"/>
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide leading-none mb-1">Shopify</p>
            {loading ? (
              <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            ) : (
              <span className={`text-sm font-semibold ${status?.connected ? 'text-emerald-600' : 'text-red-500'}`}>
                {status?.connected ? '✅ Connecté' : '❌ Non connecté'}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded border border-border hover:border-foreground/30 disabled:opacity-40"
          title="Actualiser"
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="space-y-2 flex-1">
          <div className="h-16 w-full bg-muted animate-pulse rounded-lg" />
          <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        </div>
      ) : status?.connected ? (
        <div className="flex flex-col gap-3 flex-1">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Commandes aujourd'hui</p>
              <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{status.ordersToday}</p>
            </div>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">CA aujourd'hui</p>
              <p className="text-2xl font-bold text-foreground mt-1 tabular-nums">{fmtEur(status.revenueToday)}</p>
            </div>
          </div>

          {/* Footer: sync time + webhook status */}
          <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
            <span>Sync : {fmtSync(status.lastSyncAt)}</span>
            <span className={`font-medium ${status.webhookRegistered ? 'text-emerald-600' : 'text-amber-600'}`}>
              {status.webhookRegistered ? '✅ Webhook actif' : '⚠️ Webhook inactif'}
            </span>
          </div>

          {/* Register webhook button — shown only if not yet registered */}
          {!status.webhookRegistered && (
            <button
              onClick={handleRegisterWebhook}
              disabled={registering}
              className="w-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg py-2 hover:bg-amber-100 transition-colors disabled:opacity-50"
            >
              {registering ? 'Enregistrement…' : '⚡ Activer le webhook Shopify → POS'}
            </button>
          )}

          {registerMsg && (
            <p className="text-xs text-center font-medium text-emerald-600">{registerMsg}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {status?.error ?? 'Token Shopify non configuré.'}
          </p>
          <a
            href="/api/shopify/install"
            className="block w-full text-center text-xs font-medium bg-foreground text-white rounded-lg py-2 hover:opacity-90 transition-opacity"
          >
            Connecter Shopify
          </a>
        </div>
      )}
    </div>
  );
}
