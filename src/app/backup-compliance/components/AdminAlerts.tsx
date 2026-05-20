'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminAlert {
  id: string;
  alert_type: 'failed_export' | 'missed_backup' | 'compliance_violation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  details: Record<string, any>;
  is_read: boolean;
  is_resolved: boolean;
  resolved_at: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<AdminAlert['alert_type'], string> = {
  failed_export: 'Export échoué',
  missed_backup: 'Sauvegarde manquée',
  compliance_violation: 'Violation conformité',
};

const ALERT_TYPE_ICONS: Record<AdminAlert['alert_type'], string> = {
  failed_export: 'XCircleIcon',
  missed_backup: 'CircleStackIcon',
  compliance_violation: 'ShieldExclamationIcon',
};

const SEVERITY_STYLES: Record<AdminAlert['severity'], { bg: string; border: string; icon: string; badge: string }> = {
  info: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: 'text-blue-500',
    badge: 'bg-blue-100 text-blue-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    badge: 'bg-amber-100 text-amber-700',
  },
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    badge: 'bg-red-100 text-red-700',
  },
};

const SEVERITY_LABELS: Record<AdminAlert['severity'], string> = {
  info: 'Info',
  warning: 'Attention',
  critical: 'Critique',
};

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays === 1) return 'Hier';
  return `Il y a ${diffDays} jours`;
}

// ─── Alert Item ───────────────────────────────────────────────────────────────

function AlertItem({
  alert,
  onMarkRead,
  onResolve,
}: {
  alert: AdminAlert;
  onMarkRead: (id: string) => void;
  onResolve: (id: string) => void;
}) {
  const styles = SEVERITY_STYLES[alert.severity];
  const typeIcon = ALERT_TYPE_ICONS[alert.alert_type];

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${styles.bg} ${styles.border} ${
        !alert.is_read ? 'shadow-sm' : 'opacity-75'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white border ${styles.border}`}>
          <Icon
            name={typeIcon as Parameters<typeof Icon>[0]['name']}
            size={18}
            className={styles.icon}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              {!alert.is_read && (
                <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
              )}
              <span className="text-sm font-semibold text-foreground">{alert.title}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.badge}`}>
                {SEVERITY_LABELS[alert.severity]}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-muted-foreground border border-border/50">
                {ALERT_TYPE_LABELS[alert.alert_type]}
              </span>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {formatRelativeTime(alert.created_at)}
            </span>
          </div>

          <p className="text-sm text-muted-foreground mt-1">{alert.message}</p>

          {/* Actions */}
          {!alert.is_resolved && (
            <div className="flex items-center gap-2 mt-3">
              {!alert.is_read && (
                <button
                  onClick={() => onMarkRead(alert.id)}
                  className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg bg-white/70 border border-border/50 hover:bg-white"
                >
                  <Icon name="CheckIcon" size={13} />
                  Marquer lu
                </button>
              )}
              <button
                onClick={() => onResolve(alert.id)}
                className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-800 transition-colors px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 hover:bg-emerald-100"
              >
                <Icon name="CheckCircleIcon" size={13} />
                Résoudre
              </button>
            </div>
          )}

          {alert.is_resolved && (
            <div className="flex items-center gap-1.5 mt-2">
              <Icon name="CheckCircleIcon" size={13} className="text-emerald-500" />
              <span className="text-xs text-emerald-600 font-medium">Résolu</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface AdminAlertsProps {
  /** If true, shows only a compact badge/bell for embedding in headers */
  compact?: boolean;
  /** Max alerts to show in compact popover */
  maxCompact?: number;
}

export default function AdminAlerts({ compact = false, maxCompact = 5 }: AdminAlertsProps) {
  const supabase = createClient();

  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPopover, setShowPopover] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread' | AdminAlert['alert_type']>('all');

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('admin_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data) setAlerts(data as AdminAlert[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAlerts();
    // Poll every 60 seconds for new alerts
    const interval = setInterval(loadAlerts, 60000);
    return () => clearInterval(interval);
  }, [loadAlerts]);

  const handleMarkRead = useCallback(
    async (id: string) => {
      await supabase.from('admin_alerts').update({ is_read: true }).eq('id', id);
      setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
    },
    [supabase]
  );

  const handleResolve = useCallback(
    async (id: string) => {
      await supabase
        .from('admin_alerts')
        .update({ is_resolved: true, is_read: true, resolved_at: new Date().toISOString() })
        .eq('id', id);
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === id ? { ...a, is_resolved: true, is_read: true, resolved_at: new Date().toISOString() } : a
        )
      );
    },
    [supabase]
  );

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadIds.length === 0) return;
    await supabase.from('admin_alerts').update({ is_read: true }).in('id', unreadIds);
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  }, [supabase, alerts]);

  const unreadCount = alerts.filter((a) => !a.is_read && !a.is_resolved).length;
  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.is_resolved).length;

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'unread') return !a.is_read && !a.is_resolved;
    if (filter === 'all') return true;
    return a.alert_type === filter;
  });

  // ── Compact mode (bell icon for header/dashboard) ──────────────────────────
  if (compact) {
    const popoverAlerts = alerts.filter((a) => !a.is_resolved).slice(0, maxCompact);

    return (
      <div className="relative">
        <button
          onClick={() => setShowPopover((v) => !v)}
          className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-white hover:bg-muted/40 transition-colors"
          title="Alertes administrateur"
        >
          <Icon name="BellIcon" size={18} className="text-muted-foreground" />
          {unreadCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1 ${
                criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'
              }`}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showPopover && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowPopover(false)}
            />
            {/* Popover */}
            <div className="absolute right-0 top-11 z-50 w-96 bg-white rounded-xl border border-border shadow-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="BellAlertIcon" size={16} className="text-primary" />
                  <span className="text-sm font-semibold text-foreground">Alertes admin</span>
                  {unreadCount > 0 && (
                    <span className="text-xs font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                      {unreadCount} non lu{unreadCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Tout marquer lu
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {loading ? (
                  <div className="py-8 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : popoverAlerts.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    <Icon name="CheckCircleIcon" size={28} className="mx-auto mb-2 text-emerald-400" />
                    Aucune alerte active
                  </div>
                ) : (
                  popoverAlerts.map((alert) => {
                    const styles = SEVERITY_STYLES[alert.severity];
                    return (
                      <div
                        key={alert.id}
                        className={`px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors ${
                          !alert.is_read ? 'bg-primary/5' : ''
                        }`}
                      >
                        <Icon
                          name={ALERT_TYPE_ICONS[alert.alert_type] as Parameters<typeof Icon>[0]['name']}
                          size={16}
                          className={`shrink-0 mt-0.5 ${styles.icon}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {!alert.is_read && (
                              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                            )}
                            <p className="text-xs font-semibold text-foreground truncate">{alert.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatRelativeTime(alert.created_at)}
                          </p>
                        </div>
                        {!alert.is_read && (
                          <button
                            onClick={() => handleMarkRead(alert.id)}
                            className="shrink-0 text-muted-foreground hover:text-foreground"
                            title="Marquer lu"
                          >
                            <Icon name="XMarkIcon" size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-4 py-2.5 border-t border-border bg-muted/30">
                <a
                  href="/backup-compliance"
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => setShowPopover(false)}
                >
                  Voir toutes les alertes →
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Full panel mode ────────────────────────────────────────────────────────
  const FILTERS: { id: typeof filter; label: string }[] = [
    { id: 'all', label: 'Toutes' },
    { id: 'unread', label: 'Non lues' },
    { id: 'failed_export', label: 'Exports échoués' },
    { id: 'missed_backup', label: 'Sauvegardes manquées' },
    { id: 'compliance_violation', label: 'Conformité' },
  ];

  const unresolvedCount = alerts.filter((a) => !a.is_resolved).length;

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
            <Icon name="BellAlertIcon" size={18} className="text-red-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Alertes administrateur</h2>
            <p className="text-xs text-muted-foreground">
              {unresolvedCount} alerte{unresolvedCount !== 1 ? 's' : ''} active{unresolvedCount !== 1 ? 's' : ''}
              {unreadCount > 0 && ` · ${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40"
            >
              <Icon name="CheckIcon" size={13} />
              Tout marquer lu
            </button>
          )}
          <button
            onClick={loadAlerts}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg border border-border hover:bg-muted/40"
          >
            <Icon name="ArrowPathIcon" size={13} />
            Actualiser
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="px-5 py-3 border-b border-border bg-muted/20 flex items-center gap-3 flex-wrap">
        {criticalCount > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
            <Icon name="ExclamationCircleIcon" size={13} />
            {criticalCount} critique{criticalCount > 1 ? 's' : ''}
          </span>
        )}
        {alerts.filter((a) => a.severity === 'warning' && !a.is_resolved).length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
            <Icon name="ExclamationTriangleIcon" size={13} />
            {alerts.filter((a) => a.severity === 'warning' && !a.is_resolved).length} attention
          </span>
        )}
        {alerts.filter((a) => a.alert_type === 'failed_export' && !a.is_resolved).length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-600 text-xs font-medium border border-red-200">
            <Icon name="XCircleIcon" size={13} />
            {alerts.filter((a) => a.alert_type === 'failed_export' && !a.is_resolved).length} export(s) échoué(s)
          </span>
        )}
        {alerts.filter((a) => a.alert_type === 'missed_backup' && !a.is_resolved).length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-600 text-xs font-medium border border-amber-200">
            <Icon name="CircleStackIcon" size={13} />
            {alerts.filter((a) => a.alert_type === 'missed_backup' && !a.is_resolved).length} sauvegarde(s) manquée(s)
          </span>
        )}
        {alerts.filter((a) => a.alert_type === 'compliance_violation' && !a.is_resolved).length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-violet-50 text-violet-600 text-xs font-medium border border-violet-200">
            <Icon name="ShieldExclamationIcon" size={13} />
            {alerts.filter((a) => a.alert_type === 'compliance_violation' && !a.is_resolved).length} violation(s) conformité
          </span>
        )}
        {unresolvedCount === 0 && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
            <Icon name="CheckCircleIcon" size={13} />
            Aucune alerte active
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div className="px-5 border-b border-border flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => {
          const count =
            f.id === 'all'
              ? alerts.length
              : f.id === 'unread'
              ? alerts.filter((a) => !a.is_read && !a.is_resolved).length
              : alerts.filter((a) => a.alert_type === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${
                filter === f.id
                  ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    filter === f.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      <div className="p-5 space-y-3 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Icon name="CheckCircleIcon" size={36} className="mx-auto mb-3 text-emerald-400" />
            <p className="text-sm font-medium">Aucune alerte dans cette catégorie</p>
          </div>
        ) : (
          filteredAlerts.map((alert) => (
            <AlertItem
              key={alert.id}
              alert={alert}
              onMarkRead={handleMarkRead}
              onResolve={handleResolve}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Helper to create alerts programmatically ─────────────────────────────────

export async function createAdminAlert(
  supabase: ReturnType<typeof createClient>,
  params: {
    alert_type: AdminAlert['alert_type'];
    severity: AdminAlert['severity'];
    title: string;
    message: string;
    details?: Record<string, any>;
  }
) {
  return supabase.from('admin_alerts').insert({
    alert_type: params.alert_type,
    severity: params.severity,
    title: params.title,
    message: params.message,
    details: params.details ?? {},
    is_read: false,
    is_resolved: false,
  });
}
