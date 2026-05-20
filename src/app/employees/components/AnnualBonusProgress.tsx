'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { employeeService, type Employee } from '@/lib/services/employeeService';

const ANNUAL_BONUS = 3000;

interface AnnualBonusProgressProps {
  employees: Employee[];
}

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface EmpBonus {
  employee: Employee;
  annualRevenue: number;
  progress: number; // 0-100
  bonusEarned: number;
  monthlyBreakdown: { month: number; revenue: number; label: string }[];
}

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

export default function AnnualBonusProgress({ employees }: AnnualBonusProgressProps) {
  const [bonusData, setBonusData] = useState<EmpBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const results: EmpBonus[] = [];
      for (const emp of employees.filter(e => e.status === 'active')) {
        try {
          const yearStart = `${currentYear}-01-01T00:00:00.000Z`;
          const sales = await employeeService.getSales(emp.id, yearStart);
          const activeSales = sales.filter(s => !s.wasCancelled);
          const annualRevenue = activeSales.reduce((sum, s) => sum + s.totalTtc, 0);

          // Monthly breakdown
          const monthlyBreakdown = MONTHS_SHORT.map((label, idx) => {
            const month = idx + 1;
            const monthStr = `${currentYear}-${String(month).padStart(2, '0')}`;
            const rev = activeSales
              .filter(s => s.soldAt.startsWith(monthStr))
              .reduce((sum, s) => sum + s.totalTtc, 0);
            return { month, revenue: rev, label };
          });

          // Annual objective = monthlyObjective * 12
          const annualTarget = emp.monthlyObjective * 12;
          const progress = annualTarget > 0 ? Math.min(100, (annualRevenue / annualTarget) * 100) : 0;
          // Bonus earned proportionally (max 3000€)
          const bonusEarned = Math.min(ANNUAL_BONUS, (progress / 100) * ANNUAL_BONUS);

          results.push({ employee: emp, annualRevenue, progress, bonusEarned, monthlyBreakdown });
        } catch {
          // skip
        }
      }
      setBonusData(results.sort((a, b) => b.progress - a.progress));
      setLoading(false);
    };
    if (employees.length > 0) load();
    else setLoading(false);
  }, [employees, currentYear]);

  if (loading) {
    return (
      <div className="bg-white border border-border rounded-2xl p-6 flex items-center justify-center py-12">
        <Icon name="ArrowPathIcon" size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (bonusData.length === 0) {
    return (
      <div className="bg-white border border-border rounded-2xl p-6 text-center text-muted-foreground">
        <Icon name="TrophyIcon" size={40} className="mx-auto mb-3 opacity-20" />
        <p className="text-sm">Aucun employé actif</p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-amber-50 to-yellow-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Icon name="TrophyIcon" size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="text-base font-700 text-foreground">Prime annuelle — Objectif {currentYear}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Prime de <span className="font-700 text-amber-700">{ANNUAL_BONUS.toLocaleString('fr-FR')} €</span> à atteindre — basée sur le CA annuel
            </p>
          </div>
        </div>
      </div>

      {/* Employee list */}
      <div className="divide-y divide-border">
        {bonusData.map((item) => {
          const isExpanded = expanded === item.employee.id;
          const annualTarget = item.employee.monthlyObjective * 12;
          const remaining = Math.max(0, ANNUAL_BONUS - item.bonusEarned);
          const caRemaining = Math.max(0, annualTarget - item.annualRevenue);

          return (
            <div key={item.employee.id} className="p-5">
              {/* Employee row */}
              <div
                className="flex items-center gap-4 cursor-pointer"
                onClick={() => setExpanded(isExpanded ? null : item.employee.id)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <span className="text-sm font-700 text-primary">{item.employee.avatarInitials}</span>
                </div>

                {/* Name + progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-sm font-600 text-foreground">{item.employee.fullName}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-sm font-700 tabular-nums ${
                        item.progress >= 100 ? 'text-emerald-600' : item.progress >= 70 ? 'text-amber-600' : 'text-red-500'
                      }`}>
                        {Math.round(item.progress)}%
                      </span>
                      <span className="text-xs font-600 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full tabular-nums">
                        {fmt(item.bonusEarned)} €
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-3 overflow-hidden relative">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${
                        item.progress >= 100 ? 'bg-emerald-500' : item.progress >= 70 ? 'bg-amber-500' : item.progress >= 40 ? 'bg-orange-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${Math.min(100, item.progress)}%` }}
                    />
                    {/* Milestone markers */}
                    {[25, 50, 75].map(pct => (
                      <div
                        key={pct}
                        className="absolute top-0 bottom-0 w-px bg-white/60"
                        style={{ left: `${pct}%` }}
                      />
                    ))}
                  </div>

                  {/* Sub info */}
                  <div className="flex items-center justify-between mt-1.5 text-xs text-muted-foreground">
                    <span>CA : {fmt(item.annualRevenue)} € / {fmt(annualTarget)} €</span>
                    {item.progress < 100 && (
                      <span className="text-amber-600">
                        Encore {fmt(caRemaining)} € pour {fmt(remaining)} € de prime
                      </span>
                    )}
                    {item.progress >= 100 && (
                      <span className="text-emerald-600 font-600 flex items-center gap-1">
                        <Icon name="CheckCircleIcon" size={12} />
                        Prime complète !
                      </span>
                    )}
                  </div>
                </div>

                <Icon
                  name={isExpanded ? 'ChevronUpIcon' : 'ChevronDownIcon'}
                  size={16}
                  className="text-muted-foreground shrink-0"
                />
              </div>

              {/* Expanded monthly breakdown */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-3">Progression mensuelle {currentYear}</p>
                  <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                    {item.monthlyBreakdown.map((m) => {
                      const monthTarget = item.employee.monthlyObjective;
                      const pct = monthTarget > 0 ? Math.min(100, (m.revenue / monthTarget) * 100) : 0;
                      const now = new Date();
                      const isFuture = m.month > now.getMonth() + 1 || currentYear > now.getFullYear();
                      return (
                        <div key={m.month} className="flex flex-col items-center gap-1">
                          <div className="w-full bg-muted rounded-md overflow-hidden" style={{ height: 48 }}>
                            <div
                              className={`w-full rounded-md transition-all ${
                                isFuture ? 'bg-muted-foreground/10' : pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-amber-400' : 'bg-red-300'
                              }`}
                              style={{ height: `${isFuture ? 0 : Math.max(4, pct)}%`, marginTop: 'auto' }}
                            />
                          </div>
                          <span className="text-[9px] text-muted-foreground font-500">{m.label}</span>
                          {!isFuture && m.revenue > 0 && (
                            <span className="text-[8px] text-muted-foreground tabular-nums">{Math.round(m.revenue)}€</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Bonus milestones */}
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[
                      { pct: 25, bonus: 750, label: '25%' },
                      { pct: 50, bonus: 1500, label: '50%' },
                      { pct: 75, bonus: 2250, label: '75%' },
                      { pct: 100, bonus: 3000, label: '100%' },
                    ].map((milestone) => {
                      const reached = item.progress >= milestone.pct;
                      return (
                        <div
                          key={milestone.pct}
                          className={`rounded-lg p-2.5 text-center border ${
                            reached
                              ? 'bg-emerald-50 border-emerald-200' :'bg-muted/30 border-border'
                          }`}
                        >
                          <div className={`text-xs font-700 ${reached ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            {reached ? '✓' : milestone.label}
                          </div>
                          <div className={`text-sm font-700 tabular-nums mt-0.5 ${reached ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                            {milestone.bonus.toLocaleString('fr-FR')} €
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer summary */}
      <div className="px-6 py-4 bg-muted/30 border-t border-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Total primes à distribuer (si 100%)</span>
          <span className="text-sm font-700 text-amber-700">
            {(bonusData.length * ANNUAL_BONUS).toLocaleString('fr-FR')} € max
          </span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-muted-foreground">Primes acquises à ce jour</span>
          <span className="text-sm font-700 text-emerald-700">
            {fmt(bonusData.reduce((sum, d) => sum + d.bonusEarned, 0))} €
          </span>
        </div>
      </div>
    </div>
  );
}
