'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { exportToPDF, exportToExcel } from '@/app/reports/utils/exportUtils';
import AdminAlerts, { createAdminAlert } from './components/AdminAlerts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackupLog {
  id: string;
  backup_date: string;
  backup_type: string;
  export_format: string;
  status: string;
  records_count: number;
  file_size_kb: number;
  period_from: string;
  period_to: string;
  notes: string;
  created_at: string;
}

interface ComplianceRecord {
  id: string;
  fiscal_year: number;
  record_type: string;
  records_count: number;
  earliest_date: string;
  latest_date: string;
  retention_until: string;
  status: string;
  last_verified_at: string;
}

interface SaleRow {
  id: string;
  created_at: string;
  total_amount?: number;
  payment_method?: string;
  client_name?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RECORD_TYPE_LABELS: Record<string, string> = {
  sales: 'Ventes',
  invoices: 'Factures',
  expenses: 'Dépenses',
  purchases: 'Achats fournisseurs',
};

const STATUS_COLORS: Record<string, string> = {
  compliant: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  completed: 'bg-emerald-100 text-emerald-700',
  failed: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
};

const STATUS_LABELS: Record<string, string> = {
  compliant: 'Conforme',
  warning: 'Attention',
  expired: 'Expiré',
  completed: 'Réussi',
  failed: 'Échoué',
  pending: 'En cours',
};

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR');
}

function yearsUntilExpiry(retentionUntil: string): number {
  const now = new Date();
  const exp = new Date(retentionUntil);
  return Math.max(0, exp.getFullYear() - now.getFullYear());
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KPICard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-border p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon name={icon as Parameters<typeof Icon>[0]['name']} size={20} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RetentionTimeline({ records }: { records: ComplianceRecord[] }) {
  const byYear = records.reduce<Record<number, ComplianceRecord[]>>((acc, r) => {
    if (!acc[r.fiscal_year]) acc[r.fiscal_year] = [];
    acc[r.fiscal_year].push(r);
    return acc;
  }, {});

  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="space-y-2">
      {years.map((yr) => {
        const recs = byYear[yr];
        const allCompliant = recs.every((r) => r.status === 'compliant');
        const hasWarning = recs.some((r) => r.status === 'warning');
        const retUntil = recs[0]?.retention_until;
        const yrsLeft = retUntil ? yearsUntilExpiry(retUntil) : 0;
        const barWidth = Math.min(100, (yrsLeft / 10) * 100);

        return (
          <div key={yr} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
            <span className="text-sm font-semibold text-foreground w-12 shrink-0">{yr}</span>
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  allCompliant ? 'bg-emerald-500' : hasWarning ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-28 shrink-0 text-right">
              Jusqu&apos;au {retUntil ? formatDate(retUntil) : '—'}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
                allCompliant
                  ? 'bg-emerald-100 text-emerald-700'
                  : hasWarning
                  ? 'bg-amber-100 text-amber-700' :'bg-red-100 text-red-700'
              }`}
            >
              {yrsLeft} ans restants
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BackupCompliancePage() {
  const supabase = createClient();

  const [backupLogs, setBackupLogs] = useState<BackupLog[]>([]);
  const [complianceRecords, setComplianceRecords] = useState<ComplianceRecord[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'compliance' | 'alerts'>('dashboard');
  const [loading, setLoading] = useState(true);
  const [exportPeriodFrom, setExportPeriodFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [exportPeriodTo, setExportPeriodTo] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, compRes] = await Promise.all([
        supabase.from('backup_logs').select('*').order('backup_date', { ascending: false }).limit(50),
        supabase.from('compliance_records').select('*').order('fiscal_year', { ascending: false }),
      ]);
      if (logsRes.data) setBackupLogs(logsRes.data);
      if (compRes.data) setComplianceRecords(compRes.data);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-detect missed backups & compliance violations ──────────────────────
  useEffect(() => {
    async function checkAndCreateAlerts() {
      try {
        // Check for missed backup: no successful backup in last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const sevenDaysAgoStr = sevenDaysAgo.toISOString().slice(0, 10);

        const { data: recentBackups } = await supabase
          .from('backup_logs')
          .select('id')
          .eq('status', 'completed')
          .gte('backup_date', sevenDaysAgoStr)
          .limit(1);

        if (!recentBackups || recentBackups.length === 0) {
          // Check if we already have an unresolved missed_backup alert
          const { data: existingAlert } = await supabase
            .from('admin_alerts')
            .select('id')
            .eq('alert_type', 'missed_backup')
            .eq('is_resolved', false)
            .limit(1);

          if (!existingAlert || existingAlert.length === 0) {
            await createAdminAlert(supabase, {
              alert_type: 'missed_backup',
              severity: 'warning',
              title: 'Aucune sauvegarde depuis 7 jours',
              message: 'Aucune sauvegarde réussie n\'a été effectuée au cours des 7 derniers jours. Veuillez exporter vos données pour rester conforme.',
              details: { last_check: new Date().toISOString(), threshold_days: 7 },
            });
          }
        }

        // Check for compliance violations: records with warning/expired status
        const { data: violations } = await supabase
          .from('compliance_records')
          .select('fiscal_year, status, retention_until, record_type')
          .in('status', ['warning', 'expired']);

        if (violations && violations.length > 0) {
          for (const v of violations) {
            const { data: existingViolation } = await supabase
              .from('admin_alerts')
              .select('id')
              .eq('alert_type', 'compliance_violation')
              .eq('is_resolved', false)
              .contains('details', { fiscal_year: v.fiscal_year, record_type: v.record_type })
              .limit(1);

            if (!existingViolation || existingViolation.length === 0) {
              const isExpired = v.status === 'expired';
              await createAdminAlert(supabase, {
                alert_type: 'compliance_violation',
                severity: isExpired ? 'critical' : 'warning',
                title: `${isExpired ? 'Expiration' : 'Échéance approchante'} — Exercice ${v.fiscal_year}`,
                message: isExpired
                  ? `Les données de l'exercice ${v.fiscal_year} ont dépassé leur date de conservation légale (${v.retention_until ? new Date(v.retention_until).toLocaleDateString('fr-FR') : '—'}). Action requise immédiatement.`
                  : `Les données de l'exercice ${v.fiscal_year} arrivent à échéance de conservation légale le ${v.retention_until ? new Date(v.retention_until).toLocaleDateString('fr-FR') : '—'}. Archivez ces données dès que possible.`,
                details: { fiscal_year: v.fiscal_year, retention_until: v.retention_until, record_type: v.record_type, status: v.status },
              });
            }
          }
        }
      } catch (err) {
        console.error('Alert check error:', err);
      }
    }

    checkAndCreateAlerts();
  }, [supabase]);

  // ── Export handler ──────────────────────────────────────────────────────────

  const handleExport = useCallback(
    async (format: 'csv' | 'pdf' | 'both') => {
      setIsExporting(true);
      setExportMsg('Récupération des données de vente…');

      try {
        // Fetch sales from client_purchases
        const { data: salesData, error: salesErr } = await supabase
          .from('client_purchases')
          .select('id, created_at, total_amount, payment_method, clients(first_name, last_name)')
          .gte('created_at', exportPeriodFrom)
          .lte('created_at', exportPeriodTo + 'T23:59:59')
          .order('created_at', { ascending: false });

        if (salesErr) throw salesErr;

        const rows = (salesData || []).map((s: any) => ({
          date: formatDate(s.created_at),
          client: s.clients ? `${s.clients.first_name ?? ''} ${s.clients.last_name ?? ''}`.trim() : 'Client anonyme',
          montant: typeof s.total_amount === 'number' ? `${s.total_amount.toFixed(2)} €` : '—',
          paiement: s.payment_method ?? '—',
          reference: s.id?.slice(0, 8).toUpperCase() ?? '—',
        }));

        const columns = [
          { header: 'Date', key: 'date', width: 14 },
          { header: 'Client', key: 'client', width: 24 },
          { header: 'Montant TTC', key: 'montant', width: 14 },
          { header: 'Mode paiement', key: 'paiement', width: 18 },
          { header: 'Référence', key: 'reference', width: 14 },
        ];

        const subtitle = `Période : ${formatDate(exportPeriodFrom)} → ${formatDate(exportPeriodTo)} — ${rows.length} vente(s)`;
        const filename = `sauvegarde-ventes-${exportPeriodFrom}-${exportPeriodTo}`;

        setExportMsg('Génération du fichier…');

        if (format === 'pdf' || format === 'both') {
          exportToPDF({
            title: 'Sauvegarde des ventes — Conformité comptable',
            subtitle,
            columns,
            rows,
            filename: filename + '-pdf',
          });
        }
        if (format === 'csv' || format === 'both') {
          exportToExcel({
            title: 'Sauvegarde des ventes — Conformité comptable',
            subtitle,
            columns,
            rows,
            filename: filename + '-csv',
          });
        }

        // Log the backup
        await supabase.from('backup_logs').insert({
          backup_date: new Date().toISOString().slice(0, 10),
          backup_type: 'manual',
          export_format: format,
          status: 'completed',
          records_count: rows.length,
          file_size_kb: Math.round(rows.length * 0.4),
          period_from: exportPeriodFrom,
          period_to: exportPeriodTo,
          notes: `Export manuel — ${rows.length} enregistrements`,
        });

        setExportMsg(`✓ Export réussi — ${rows.length} vente(s) exportée(s)`);
        loadData();
      } catch (err: any) {
        const errMsg = err?.message ?? "Échec de l'export";
        setExportMsg(`Erreur : ${errMsg}`);
        // Log failed export alert
        await supabase.from('backup_logs').insert({
          backup_date: new Date().toISOString().slice(0, 10),
          backup_type: 'manual',
          export_format: format,
          status: 'failed',
          records_count: 0,
          file_size_kb: 0,
          period_from: exportPeriodFrom,
          period_to: exportPeriodTo,
          notes: `Échec export : ${errMsg}`,
        });
        await createAdminAlert(supabase, {
          alert_type: 'failed_export',
          severity: 'critical',
          title: `Export ${format.toUpperCase()} échoué`,
          message: `L'export des ventes du ${exportPeriodFrom} au ${exportPeriodTo} a échoué. Erreur : ${errMsg}`,
          details: { format, period_from: exportPeriodFrom, period_to: exportPeriodTo, error: errMsg },
        });
      } finally {
        setIsExporting(false);
        setTimeout(() => setExportMsg(''), 5000);
      }
    },
    [supabase, exportPeriodFrom, exportPeriodTo, loadData]
  );

  // ── Derived stats ───────────────────────────────────────────────────────────

  const totalBackups = backupLogs.length;
  const lastBackup = backupLogs[0];
  const compliantCount = complianceRecords.filter((r) => r.status === 'compliant').length;
  const totalComplianceRecords = complianceRecords.length;
  const currentYear = new Date().getFullYear();
  const yearsTracked = [...new Set(complianceRecords.map((r) => r.fiscal_year))].length;

  const TABS = [
    { id: 'dashboard' as const, label: 'Vue d\'ensemble', icon: 'ChartBarIcon' },
    { id: 'history' as const, label: 'Historique sauvegardes', icon: 'ClockIcon' },
    { id: 'compliance' as const, label: 'Conformité légale', icon: 'ShieldCheckIcon' },
    { id: 'alerts' as const, label: 'Alertes admin', icon: 'BellAlertIcon' },
  ];

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 py-4 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Sauvegarde & Conformité</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Export des données de vente · Règle de conservation 10 ans (Art. L123-22 Code de commerce)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                <Icon name="ShieldCheckIcon" size={13} />
                Conformité active
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border bg-white px-6 lg:px-8">
          <div className="max-w-screen-2xl mx-auto flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary' :'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={15} />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-w-screen-2xl mx-auto px-6 lg:px-8 py-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* ── DASHBOARD TAB ── */}
              {activeTab === 'dashboard' && (
                <div className="space-y-6">
                  {/* KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <KPICard
                      icon="CircleStackIcon"
                      label="Sauvegardes totales"
                      value={totalBackups}
                      sub={lastBackup ? `Dernière : ${formatDate(lastBackup.backup_date)}` : 'Aucune'}
                      color="bg-blue-500"
                    />
                    <KPICard
                      icon="ShieldCheckIcon"
                      label="Enregistrements conformes"
                      value={`${compliantCount}/${totalComplianceRecords}`}
                      sub="Règle 10 ans vérifiée"
                      color="bg-emerald-500"
                    />
                    <KPICard
                      icon="CalendarDaysIcon"
                      label="Années suivies"
                      value={yearsTracked}
                      sub={`${currentYear - 9} → ${currentYear}`}
                      color="bg-violet-500"
                    />
                    <KPICard
                      icon="DocumentArrowDownIcon"
                      label="Dernier export"
                      value={lastBackup ? lastBackup.export_format.toUpperCase() : '—'}
                      sub={lastBackup ? `${lastBackup.records_count} enregistrements` : 'Aucun export'}
                      color="bg-amber-500"
                    />
                  </div>

                  {/* Export Panel */}
                  <div className="bg-white rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Icon name="ArrowDownTrayIcon" size={18} className="text-primary" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-foreground">Export des données de vente</h2>
                        <p className="text-xs text-muted-foreground">Générez un export PDF ou CSV pour archivage comptable</p>
                      </div>
                    </div>

                    {/* Period selector */}
                    <div className="flex flex-wrap items-end gap-4 mb-5">
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">Période du</label>
                        <input
                          type="date"
                          value={exportPeriodFrom}
                          onChange={(e) => setExportPeriodFrom(e.target.value)}
                          className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-muted-foreground mb-1">au</label>
                        <input
                          type="date"
                          value={exportPeriodTo}
                          onChange={(e) => setExportPeriodTo(e.target.value)}
                          className="border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>

                    {/* Export buttons */}
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => handleExport('pdf')}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Icon name="DocumentTextIcon" size={16} />
                        Exporter PDF
                      </button>
                      <button
                        onClick={() => handleExport('csv')}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Icon name="TableCellsIcon" size={16} />
                        Exporter CSV/Excel
                      </button>
                      <button
                        onClick={() => handleExport('both')}
                        disabled={isExporting}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        <Icon name="ArrowDownTrayIcon" size={16} />
                        {isExporting ? 'Export en cours…' : 'Exporter PDF + CSV'}
                      </button>
                    </div>

                    {exportMsg && (
                      <p
                        className={`mt-3 text-sm font-medium ${
                          exportMsg.startsWith('✓') ? 'text-emerald-600' : exportMsg.startsWith('Erreur') ? 'text-red-600' : 'text-muted-foreground'
                        }`}
                      >
                        {exportMsg}
                      </p>
                    )}
                  </div>

                  {/* Legal notice */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                    <div className="flex items-start gap-3">
                      <Icon name="InformationCircleIcon" size={20} className="text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-blue-900 mb-1">
                          Obligations légales — Comptabilité française
                        </h3>
                        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                          <li>
                            <strong>Art. L123-22 Code de commerce</strong> : conservation des livres comptables et pièces justificatives pendant <strong>10 ans</strong>
                          </li>
                          <li>
                            <strong>Art. L102 B LPF</strong> : documents fiscaux conservés 6 ans minimum (10 ans recommandés)
                          </li>
                          <li>
                            <strong>RGPD</strong> : données personnelles limitées à la durée nécessaire — anonymisation après 3 ans pour les clients inactifs
                          </li>
                          <li>
                            <strong>Factures</strong> : numérotation chronologique continue obligatoire, conservation 10 ans
                          </li>
                          <li>
                            Les exports doivent être stockés sur un support sécurisé et non modifiable (coffre-fort numérique recommandé)
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── HISTORY TAB ── */}
              {activeTab === 'history' && (
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-base font-semibold text-foreground">Historique des sauvegardes</h2>
                    <span className="text-xs text-muted-foreground">{backupLogs.length} entrée(s)</span>
                  </div>
                  {backupLogs.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground text-sm">
                      <Icon name="CircleStackIcon" size={32} className="mx-auto mb-3 opacity-30" />
                      Aucune sauvegarde enregistrée
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                            <th className="text-left px-4 py-3 font-medium">Date</th>
                            <th className="text-left px-4 py-3 font-medium">Type</th>
                            <th className="text-left px-4 py-3 font-medium">Format</th>
                            <th className="text-left px-4 py-3 font-medium">Période couverte</th>
                            <th className="text-right px-4 py-3 font-medium">Enregistrements</th>
                            <th className="text-right px-4 py-3 font-medium">Taille</th>
                            <th className="text-left px-4 py-3 font-medium">Statut</th>
                            <th className="text-left px-4 py-3 font-medium">Notes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {backupLogs.map((log) => (
                            <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-medium text-foreground">{formatDate(log.backup_date)}</td>
                              <td className="px-4 py-3 text-muted-foreground capitalize">{log.backup_type}</td>
                              <td className="px-4 py-3 uppercase font-mono text-xs">{log.export_format}</td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">
                                {log.period_from && log.period_to
                                  ? `${formatDate(log.period_from)} → ${formatDate(log.period_to)}`
                                  : '—'}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{log.records_count.toLocaleString('fr-FR')}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-muted-foreground text-xs">
                                {log.file_size_kb > 0 ? `${log.file_size_kb} Ko` : '—'}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[log.status] ?? 'bg-muted text-muted-foreground'}`}>
                                  {STATUS_LABELS[log.status] ?? log.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{log.notes || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* ── COMPLIANCE TAB ── */}
              {activeTab === 'compliance' && (
                <div className="space-y-6">
                  {/* Retention timeline */}
                  <div className="bg-white rounded-xl border border-border p-6">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <Icon name="ShieldCheckIcon" size={18} className="text-emerald-600" />
                      </div>
                      <div>
                        <h2 className="text-base font-semibold text-foreground">Calendrier de conservation — Règle 10 ans</h2>
                        <p className="text-xs text-muted-foreground">Art. L123-22 Code de commerce · Durée légale de conservation des données comptables</p>
                      </div>
                    </div>
                    <RetentionTimeline records={complianceRecords} />
                  </div>

                  {/* Compliance table by type */}
                  <div className="bg-white rounded-xl border border-border overflow-hidden">
                    <div className="px-5 py-4 border-b border-border">
                      <h2 className="text-base font-semibold text-foreground">Détail par type de document</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 text-xs text-muted-foreground uppercase tracking-wide">
                            <th className="text-left px-4 py-3 font-medium">Exercice</th>
                            <th className="text-left px-4 py-3 font-medium">Type</th>
                            <th className="text-right px-4 py-3 font-medium">Enregistrements</th>
                            <th className="text-left px-4 py-3 font-medium">Période</th>
                            <th className="text-left px-4 py-3 font-medium">Conservation jusqu&apos;au</th>
                            <th className="text-left px-4 py-3 font-medium">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {complianceRecords.map((rec) => (
                            <tr key={rec.id} className="hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 font-semibold text-foreground">{rec.fiscal_year}</td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {RECORD_TYPE_LABELS[rec.record_type] ?? rec.record_type}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{rec.records_count.toLocaleString('fr-FR')}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {formatDate(rec.earliest_date)} → {formatDate(rec.latest_date)}
                              </td>
                              <td className="px-4 py-3 text-xs font-medium text-foreground">
                                {formatDate(rec.retention_until)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[rec.status] ?? 'bg-muted text-muted-foreground'}`}>
                                  {STATUS_LABELS[rec.status] ?? rec.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Legal references */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      {
                        title: 'Livres comptables',
                        duration: '10 ans',
                        ref: 'Art. L123-22 Code de commerce',
                        desc: 'Journaux, grands livres, balances, bilans, comptes de résultat',
                        color: 'border-l-blue-500',
                      },
                      {
                        title: 'Pièces justificatives',
                        duration: '10 ans',
                        ref: 'Art. L123-22 Code de commerce',
                        desc: 'Factures clients et fournisseurs, tickets de caisse, bons de commande',
                        color: 'border-l-emerald-500',
                      },
                      {
                        title: 'Documents fiscaux',
                        duration: '6 ans min.',
                        ref: 'Art. L102 B LPF',
                        desc: 'Déclarations TVA, liasses fiscales, correspondances avec l\'administration',
                        color: 'border-l-amber-500',
                      },
                      {
                        title: 'Données personnelles clients',
                        duration: '3 ans',
                        ref: 'RGPD + CNIL',
                        desc: 'Données clients inactifs — anonymisation recommandée après 3 ans d\'inactivité',
                        color: 'border-l-violet-500',
                      },
                    ].map((item) => (
                      <div key={item.title} className={`bg-white rounded-xl border border-border border-l-4 ${item.color} p-5`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                            {item.duration}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-1">{item.desc}</p>
                        <p className="text-xs font-medium text-foreground/60">{item.ref}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── ALERTS TAB ── */}
              {activeTab === 'alerts' && <AdminAlerts />}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
