'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  employeeService,
  type Employee,
  type EmployeeSale,
  type EmployeeObjective,
  type EmployeeStats,
  ROLE_CONFIG,
  STATUS_CONFIG,
  PERMISSION_LABELS,
  type EmployeePermissions,
} from '@/lib/services/employeeService';

interface EmployeeDetailPanelProps {
  employee: Employee;
  onEdit: () => void;
  onClose: () => void;
  onDeleted: () => void;
}

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MONTHS_FULL = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

type PeriodFilter = '7d' | '30d' | '90d' | 'all';

function getPeriodFrom(period: PeriodFilter): string | undefined {
  if (period === 'all') return undefined;
  const d = new Date();
  if (period === '7d') d.setDate(d.getDate() - 7);
  else if (period === '30d') d.setDate(d.getDate() - 30);
  else if (period === '90d') d.setDate(d.getDate() - 90);
  return d.toISOString();
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EmployeeDetailPanel({ employee, onEdit, onClose, onDeleted }: EmployeeDetailPanelProps) {
  const [tab, setTab] = useState<'overview' | 'sales' | 'objectives'>('overview');
  const [period, setPeriod] = useState<PeriodFilter>('30d');
  const [sales, setSales] = useState<EmployeeSale[]>([]);
  const [objectives, setObjectives] = useState<EmployeeObjective[]>([]);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const from = getPeriodFrom(period);
      const [s, st, obj] = await Promise.all([
        employeeService.getSales(employee.id, from),
        employeeService.getStats(employee.id, from),
        employeeService.getAllObjectives(employee.id),
      ]);
      setSales(s);
      setStats(st);
      setObjectives(obj);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [employee.id, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await employeeService.delete(employee.id);
      onDeleted();
    } catch {
      setDeleting(false);
    }
  };

  const roleConf = ROLE_CONFIG[employee.role] ?? { label: employee.role, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: 'UserIcon' };
  const statusConf = STATUS_CONFIG[employee.status] ?? { label: employee.status, color: 'text-gray-600 bg-gray-50 border-gray-200', dot: 'bg-gray-400' };

  const PERIOD_OPTS: { id: PeriodFilter; label: string }[] = [
    { id: '7d', label: '7 jours' },
    { id: '30d', label: '30 jours' },
    { id: '90d', label: '90 jours' },
    { id: 'all', label: 'Tout' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-4 px-6 py-5 border-b border-border">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-xl font-700 text-primary">{employee.avatarInitials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-700 text-foreground">{employee.fullName}</h2>
              <span className={`inline-flex items-center gap-1 text-xs font-600 px-2.5 py-1 rounded-full border ${roleConf.color}`}>
                <Icon name={roleConf.icon as any} size={12} />
                {roleConf.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-xs font-500 px-2.5 py-1 rounded-full border ${statusConf.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusConf.dot}`} />
                {statusConf.label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
              {employee.email && <span className="flex items-center gap-1"><Icon name="EnvelopeIcon" size={13} />{employee.email}</span>}
              {employee.phone && <span className="flex items-center gap-1"><Icon name="PhoneIcon" size={13} />{employee.phone}</span>}
              {employee.hireDate && (
                <span className="flex items-center gap-1">
                  <Icon name="CalendarDaysIcon" size={13} />
                  Depuis le {new Date(employee.hireDate).toLocaleDateString('fr-FR')}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onEdit} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Modifier">
              <Icon name="PencilSquareIcon" size={18} />
            </button>
            <button onClick={() => setConfirmDelete(true)} className="p-2 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors" title="Supprimer">
              <Icon name="TrashIcon" size={18} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="XMarkIcon" size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {(['overview', 'sales', 'objectives'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-500 border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'overview' ? 'Vue d\'ensemble' : t === 'sales' ? 'Ventes' : 'Objectifs'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Icon name="ArrowPathIcon" size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === 'overview' && stats && (
                <div className="space-y-6">
                  {/* Period filter */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Période :</span>
                    {PERIOD_OPTS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${
                          period === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {/* KPI Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'CA Total', value: `${fmt(stats.totalRevenue)} €`, icon: 'BanknotesIcon', color: 'text-emerald-600 bg-emerald-50' },
                      { label: 'Tickets', value: String(stats.totalTickets), icon: 'ReceiptRefundIcon', color: 'text-blue-600 bg-blue-50' },
                      { label: 'Panier moyen', value: `${fmt(stats.avgBasket)} €`, icon: 'ShoppingCartIcon', color: 'text-indigo-600 bg-indigo-50' },
                      { label: 'Remises', value: `${fmt(stats.totalDiscounts)} €`, icon: 'ReceiptPercentIcon', color: 'text-amber-600 bg-amber-50' },
                    ].map((kpi) => (
                      <div key={kpi.label} className="bg-white border border-border rounded-xl p-4">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${kpi.color}`}>
                          <Icon name={kpi.icon as any} size={18} />
                        </div>
                        <p className="text-xl font-700 text-foreground">{kpi.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Monthly progress */}
                  <div className="bg-white border border-border rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-600 text-foreground">Objectif du mois en cours</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {fmt(stats.currentMonthRevenue)} € / {fmt(employee.monthlyObjective)} €
                        </p>
                      </div>
                      <span className={`text-2xl font-700 ${stats.objectiveProgress >= 100 ? 'text-emerald-600' : stats.objectiveProgress >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                        {Math.round(stats.objectiveProgress)}%
                      </span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          stats.objectiveProgress >= 100 ? 'bg-emerald-500' : stats.objectiveProgress >= 70 ? 'bg-amber-500' : 'bg-red-400'
                        }`}
                        style={{ width: `${Math.min(100, stats.objectiveProgress)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                      <span>{stats.currentMonthTickets} tickets ce mois</span>
                      <span>{stats.totalCancellations} annulation(s)</span>
                    </div>
                  </div>

                  {/* Permissions */}
                  <div>
                    <p className="text-sm font-600 text-foreground mb-3">Permissions actives</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(Object.keys(PERMISSION_LABELS) as (keyof EmployeePermissions)[]).map((key) => {
                        const conf = PERMISSION_LABELS[key];
                        const enabled = employee.permissions[key];
                        return (
                          <div
                            key={key}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-500 ${
                              enabled ? 'bg-primary/5 border-primary/20 text-primary' : 'bg-muted/30 border-border text-muted-foreground line-through'
                            }`}
                          >
                            <Icon name={conf.icon as any} size={13} />
                            {conf.label}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* PIN */}
                  {employee.posPin && (
                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                      <Icon name="KeyIcon" size={18} className="text-amber-600 shrink-0" />
                      <div>
                        <p className="text-sm font-600 text-amber-800">PIN Caisse configuré</p>
                        <p className="text-xs text-amber-600">Code PIN enregistré — visible uniquement en mode édition</p>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {employee.notes && (
                    <div className="bg-muted/30 border border-border rounded-xl px-4 py-3">
                      <p className="text-xs font-600 text-muted-foreground mb-1">Notes internes</p>
                      <p className="text-sm text-foreground">{employee.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {/* SALES TAB */}
              {tab === 'sales' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Période :</span>
                    {PERIOD_OPTS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setPeriod(p.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${
                          period === p.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  {sales.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Icon name="ReceiptRefundIcon" size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Aucune vente sur cette période</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Ticket</th>
                            <th className="text-left px-4 py-3 text-xs font-600 text-muted-foreground">Date</th>
                            <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Montant</th>
                            <th className="text-right px-4 py-3 text-xs font-600 text-muted-foreground">Remise</th>
                            <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Articles</th>
                            <th className="text-center px-4 py-3 text-xs font-600 text-muted-foreground">Statut</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sales.map((sale) => (
                            <tr key={sale.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{sale.receiptNumber}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {new Date(sale.soldAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-4 py-3 text-right font-600 text-foreground">{fmt(sale.totalTtc)} €</td>
                              <td className="px-4 py-3 text-right text-amber-600 text-xs">
                                {sale.discountAmount > 0 ? `-${fmt(sale.discountAmount)} €` : '—'}
                              </td>
                              <td className="px-4 py-3 text-center text-xs text-muted-foreground">{sale.itemsCount}</td>
                              <td className="px-4 py-3 text-center">
                                {sale.wasCancelled ? (
                                  <span className="inline-flex items-center gap-1 text-xs font-500 text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                                    <Icon name="XCircleIcon" size={11} />Annulé
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-xs font-500 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    <Icon name="CheckCircleIcon" size={11} />Validé
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* OBJECTIVES TAB */}
              {tab === 'objectives' && (
                <div className="space-y-4">
                  {objectives.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Icon name="ChartBarIcon" size={40} className="mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Aucun objectif défini</p>
                      <p className="text-xs mt-1">Utilisez l'onglet Objectifs dans le formulaire d'édition</p>
                    </div>
                  ) : (
                    objectives.map((obj) => {
                      const monthSales = sales.filter((s) => {
                        const d = new Date(s.soldAt);
                        return d.getFullYear() === obj.year && (d.getMonth() + 1) === obj.month && !s.wasCancelled;
                      });
                      const achieved = monthSales.reduce((sum, s) => sum + s.totalTtc, 0);
                      const progress = obj.targetRevenue > 0 ? Math.min(100, (achieved / obj.targetRevenue) * 100) : 0;
                      return (
                        <div key={obj.id} className="bg-white border border-border rounded-xl p-5">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-600 text-foreground">
                              {MONTHS_FULL[obj.month - 1]} {obj.year}
                            </p>
                            <span className={`text-lg font-700 ${progress >= 100 ? 'text-emerald-600' : progress >= 70 ? 'text-amber-600' : 'text-red-500'}`}>
                              {Math.round(progress)}%
                            </span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden mb-3">
                            <div
                              className={`h-2.5 rounded-full transition-all ${
                                progress >= 100 ? 'bg-emerald-500' : progress >= 70 ? 'bg-amber-500' : 'bg-red-400'
                              }`}
                              style={{ width: `${Math.min(100, progress)}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>CA : {fmt(achieved)} € / {fmt(obj.targetRevenue)} €</span>
                            <span>Tickets cible : {obj.targetTickets}</span>
                          </div>
                          {obj.notes && <p className="text-xs text-muted-foreground mt-2 italic">{obj.notes}</p>}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Confirm delete */}
        {confirmDelete && (
          <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
            <div className="text-center p-8 max-w-sm">
              <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Icon name="TrashIcon" size={24} className="text-red-600" />
              </div>
              <h3 className="text-lg font-700 text-foreground mb-2">Supprimer {employee.fullName} ?</h3>
              <p className="text-sm text-muted-foreground mb-6">Cette action est irréversible. Toutes les données de ventes associées seront supprimées.</p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-5 py-2.5 rounded-lg text-sm font-500 bg-muted text-foreground hover:bg-muted/80 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-5 py-2.5 rounded-lg text-sm font-600 bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60"
                >
                  {deleting ? 'Suppression...' : 'Supprimer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
