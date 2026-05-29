'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { computeDaySummary, saveDaySummary, addDailyExpense, type DaySummaryData, type DailyExpense } from '@/lib/services/posService';
import { toast } from 'sonner';

const METHOD_LABELS: Record<string, string> = {
  'SumUp (CB)': 'SumUp (CB)',
  'CB': 'SumUp (CB)',
  'card': 'SumUp (CB)',
  'Espèces': 'Espèces',
  'cash': 'Espèces',
  'Virement': 'Virement',
  'transfer': 'Virement',
  'Mixte': 'Mixte',
  'mixed': 'Mixte',
  'Alma (3x/4x)': 'Alma',
  'alma': 'Alma',
  'acompte': 'Acompte',
  'avoir': 'Avoir',
  'store_credit': 'Avoir',
};

const METHOD_ICONS: Record<string, string> = {
  'SumUp (CB)': '💳',
  'Espèces': '💵',
  'Virement': '🏦',
  'Mixte': '🔀',
  'Alma': '🌸',
  'Acompte': '📋',
  'Avoir': '🔄',
};

const EXPENSE_CATEGORIES = [
  { id: 'fournitures', label: 'Fournitures' },
  { id: 'loyer', label: 'Loyer / Charges' },
  { id: 'salaires', label: 'Salaires' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'transport', label: 'Transport' },
  { id: 'repas', label: 'Repas / Restauration' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'other', label: 'Autre' },
];

function fmt(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ClotureCaissePage() {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [summary, setSummary] = useState<DaySummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: 'other',
    paymentMethod: 'cash',
    note: '',
    performedBy: '',
  });
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem('beautypos_settings');
      if (cached) {
        const s = JSON.parse(cached);
        setCashierName(s.receipt_seller_name || '');
      }
    } catch { /* ignore */ }
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await computeDaySummary(selectedDate);
      setSummary(data);
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors du chargement de la synthèse');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const handleSave = async () => {
    if (!summary) return;
    setSaving(true);
    const ok = await saveDaySummary(summary, cashierName, notes);
    setSaving(false);
    if (ok) {
      toast.success('Synthèse de journée enregistrée');
    } else {
      toast.error('Erreur lors de l\'enregistrement');
    }
  };

  const handleAddExpense = async () => {
    const amount = parseFloat(expenseForm.amount);
    if (!amount || amount <= 0) {
      toast.error('Montant invalide');
      return;
    }
    const expense: Omit<DailyExpense, 'id'> = {
      expenseDate: selectedDate,
      amount,
      category: expenseForm.category,
      paymentMethod: expenseForm.paymentMethod,
      note: expenseForm.note,
      performedBy: expenseForm.performedBy || cashierName || 'Caisse',
    };
    const ok = await addDailyExpense(expense);
    if (ok) {
      toast.success('Dépense ajoutée');
      setShowExpenseForm(false);
      setExpenseForm({ amount: '', category: 'other', paymentMethod: 'cash', note: '', performedBy: '' });
      await loadSummary();
    } else {
      toast.error('Erreur lors de l\'ajout de la dépense');
    }
  };

  const handlePrint = () => {
    if (!summary) return;
    const win = window.open('', '_blank', 'width=800,height=900');
    if (!win) return;
    const dateLabel = new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    const paymentRows = Object.entries(summary.paymentBreakdown)
      .map(([method, v]) => {
        const label = METHOD_LABELS[method] || method;
        return `<tr><td>${label}</td><td style="text-align:center">${v.count}</td><td style="text-align:right;font-weight:600">${fmt(v.total)} €</td></tr>`;
      }).join('');

    const topProductRows = summary.topProducts.slice(0, 5).map((p, i) =>
      `<tr><td>${i + 1}. ${p.name}</td><td style="text-align:center">${p.qty}</td><td style="text-align:right;font-weight:600">${fmt(p.revenue)} €</td></tr>`
    ).join('');

    const empRows = summary.employeeSales.map(e =>
      `<tr><td>${e.name}</td><td style="text-align:center">${e.count}</td><td style="text-align:right;font-weight:600">${fmt(e.total)} €</td></tr>`
    ).join('');

    const expenseRows = summary.expenses.map(e =>
      `<tr><td>${e.category}</td><td>${e.note || '—'}</td><td>${e.paymentMethod}</td><td style="text-align:right;font-weight:900;color:#000">${fmt(e.amount)} €</td></tr>`
    ).join('');

    win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Synthèse journée ${selectedDate}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; color: #000 !important; background: transparent !important; }
  body { font-family: 'Courier New', monospace; font-size: 12px; color: #000; background: #fff; padding: 24px; }
  h1 { font-size: 20px; font-weight: 900; margin-bottom: 4px; color: #000; }
  h2 { font-size: 14px; font-weight: 700; margin: 16px 0 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
  .header { text-align: center; margin-bottom: 20px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
  .kpi-box { border: 2px solid #000; border-radius: 4px; padding: 12px; text-align: center; background: #fff; }
  .kpi-value { font-size: 18px; font-weight: 900; color: #000; }
  .kpi-label { font-size: 10px; color: #000; font-weight: 700; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th { background: #fff; padding: 6px 8px; text-align: left; font-size: 11px; font-weight: 900; border-bottom: 2px solid #000; }
  td { padding: 5px 8px; border-bottom: 1px dashed #000; color: #000; }
  .goal-box { border: 2px solid #000; border-radius: 4px; padding: 12px; margin: 12px 0; text-align: center; background: #fff; }
  .footer { margin-top: 24px; font-size: 10px; color: #000; font-weight: 700; text-align: center; }
  p, span, div, td, th, li, strong, b { color: #000 !important; }
  @media print {
    * { color: #000 !important; background: #fff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { padding: 12px; }
    .no-print { display: none !important; }
  }
</style></head><body>
<div class="header">
  <h1>SYNTHÈSE DE JOURNÉE — CLÔTURE CAISSE</h1>
  <p style="font-size:14px;color:#000;font-weight:700;margin-top:4px">${dateLabel}</p>
  ${cashierName ? `<p style="font-size:12px;color:#000;font-weight:700">Caissier : ${cashierName}</p>` : ''}
</div>

<div class="kpi-grid">
  <div class="kpi-box"><div class="kpi-value">${fmt(summary.totalCA)} €</div><div class="kpi-label">CA Total TTC</div></div>
  <div class="kpi-box"><div class="kpi-value">${summary.ticketCount}</div><div class="kpi-label">Tickets</div></div>
  <div class="kpi-box"><div class="kpi-value">${fmt(summary.avgBasket)} €</div><div class="kpi-label">Panier moyen</div></div>
  <div class="kpi-box"><div class="kpi-value">${fmt(summary.grossMarginRate)}%</div><div class="kpi-label">Marge brute</div></div>
</div>

<h2>Détail financier</h2>
<table>
  <tr><td>Total HT</td><td style="text-align:right;font-weight:600">${fmt(summary.totalHT)} €</td></tr>
  <tr><td>TVA 8,5 %</td><td style="text-align:right;font-weight:600">${fmt(summary.totalTVA)} €</td></tr>
  <tr><td style="font-weight:bold">Total TTC</td><td style="text-align:right;font-weight:bold;font-size:14px">${fmt(summary.totalTTC)} €</td></tr>
  <tr><td>Marge brute estimée</td><td style="text-align:right;font-weight:900;color:#000">${fmt(summary.grossMargin)} €</td></tr>
</table>

<h2>Paiements par méthode</h2>
<table>
  <thead><tr><th>Méthode</th><th style="text-align:center">Tickets</th><th style="text-align:right">Montant</th></tr></thead>
  <tbody>${paymentRows}</tbody>
</table>

${summary.topProducts.length > 0 ? `
<h2>Top produits vendus</h2>
<table>
  <thead><tr><th>Produit</th><th style="text-align:center">Qté</th><th style="text-align:right">CA</th></tr></thead>
  <tbody>${topProductRows}</tbody>
</table>` : ''}

${summary.employeeSales.length > 0 ? `
<h2>Ventes par employé</h2>
<table>
  <thead><tr><th>Employé</th><th style="text-align:center">Tickets</th><th style="text-align:right">CA</th></tr></thead>
  <tbody>${empRows}</tbody>
</table>` : ''}

${summary.dailyGoal > 0 ? `
<div class="goal-box">
  <strong>${summary.goalReached ? '✅ Objectif atteint !' : '❌ Objectif non atteint'}</strong>
  <p style="margin-top:4px">Objectif : ${fmt(summary.dailyGoal)} € — Réalisé : ${fmt(summary.totalCA)} €</p>
</div>` : ''}

${summary.expenses.length > 0 ? `
<h2>Dépenses du jour</h2>
<table>
  <thead><tr><th>Catégorie</th><th>Note</th><th>Mode</th><th style="text-align:right">Montant</th></tr></thead>
  <tbody>${expenseRows}</tbody>
  <tfoot><tr><td colspan="3" style="font-weight:900">Total dépenses</td><td style="text-align:right;font-weight:900;color:#000">${fmt(summary.totalExpenses)} €</td></tr></tfoot>
</table>` : ''}

${notes ? `<h2>Notes de clôture</h2><p style="padding:8px;background:#f9f9f9;border-radius:4px">${notes}</p>` : ''}

<div class="footer">
  Synthèse générée le ${new Date().toLocaleString('fr-FR')} — BeautyPOS
</div>
<script>window.onload = function(){ window.print(); }</script>
</body></html>`);
    win.document.close();
  };

  const handleExportPDF = () => {
    handlePrint();
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Icon name="ArrowPathIcon" size={32} className="animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Synthèse journée / Clôture caisse</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Récapitulatif complet de la journée de caisse</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={loadSummary}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
            >
              <Icon name="ArrowPathIcon" size={15} />
              Actualiser
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 px-4 py-2 border border-primary/30 bg-primary/5 rounded-xl text-sm font-600 text-primary hover:bg-primary/10 transition-colors"
            >
              <Icon name="DocumentArrowDownIcon" size={15} />
              PDF / Imprimer
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !summary}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-600 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
              Clôturer la journée
            </button>
          </div>
        </div>

        {!summary || summary.ticketCount === 0 ? (
          <div className="bg-white border border-border rounded-2xl p-12 text-center">
            <Icon name="ReceiptRefundIcon" size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
            <p className="text-lg font-600 text-foreground">Aucune vente ce jour</p>
            <p className="text-sm text-muted-foreground mt-1">
              {selectedDate === todayISO() ? "Aucune vente encaissée aujourd'hui." : `Aucune vente le ${new Date(selectedDate + 'T12:00:00').toLocaleDateString('fr-FR')}.`}
            </p>
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'CA Total TTC', value: `${fmt(summary.totalCA)} €`, icon: 'BanknotesIcon', color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Tickets encaissés', value: String(summary.ticketCount), icon: 'ReceiptRefundIcon', color: 'text-blue-600 bg-blue-50' },
                { label: 'Panier moyen', value: `${fmt(summary.avgBasket)} €`, icon: 'ShoppingCartIcon', color: 'text-indigo-600 bg-indigo-50' },
                { label: 'Marge brute', value: `${fmt(summary.grossMarginRate)}%`, icon: 'ChartBarIcon', color: 'text-violet-600 bg-violet-50' },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white border border-border rounded-2xl p-5 flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                    <Icon name={kpi.icon as any} size={22} />
                  </div>
                  <div>
                    <p className="text-xl font-700 text-foreground">{kpi.value}</p>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Financial detail */}
              <div className="bg-white border border-border rounded-2xl p-6">
                <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="CalculatorIcon" size={18} className="text-primary" />
                  Détail financier
                </h2>
                <div className="space-y-2">
                  {[
                    { label: 'Total HT', value: `${fmt(summary.totalHT)} €`, muted: true },
                    { label: 'TVA 8,5 %', value: `${fmt(summary.totalTVA)} €`, muted: true },
                    { label: 'Total TTC', value: `${fmt(summary.totalTTC)} €`, bold: true, large: true },
                    { label: 'Marge brute estimée', value: `${fmt(summary.grossMargin)} €`, color: 'text-emerald-600' },
                    { label: `Taux de marge (${fmt(summary.grossMarginRate)}%)`, value: '', bar: true },
                  ].map((row, i) => (
                    <div key={i}>
                      {row.bar ? (
                        <div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                            <span>Taux de marge brute</span>
                            <span className="font-600">{fmt(summary.grossMarginRate)}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                              style={{ width: `${Math.min(100, summary.grossMarginRate)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className={`flex items-center justify-between py-2 border-b border-border last:border-0 ${row.large ? 'border-t-2 border-foreground/20 pt-3' : ''}`}>
                          <span className={`text-sm ${row.muted ? 'text-muted-foreground' : 'font-600 text-foreground'}`}>{row.label}</span>
                          <span className={`tabular-nums ${row.bold ? 'text-lg font-700 text-foreground' : row.color ? `font-600 ${row.color}` : 'text-sm text-foreground'}`}>{row.value}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment breakdown */}
              <div className="bg-white border border-border rounded-2xl p-6">
                <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="CreditCardIcon" size={18} className="text-primary" />
                  Paiements par méthode
                </h2>
                {Object.keys(summary.paymentBreakdown).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun paiement</p>
                ) : (
                  <div className="space-y-3">
                    {Object.entries(summary.paymentBreakdown).map(([method, v]) => {
                      const label = METHOD_LABELS[method] || method;
                      const icon = METHOD_ICONS[label] || '💰';
                      const pct = summary.totalCA > 0 ? (v.total / summary.totalCA) * 100 : 0;
                      return (
                        <div key={method}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span>{icon}</span>
                              <span className="text-sm font-500 text-foreground">{label}</span>
                              <span className="text-xs text-muted-foreground">({v.count} ticket{v.count > 1 ? 's' : ''})</span>
                            </div>
                            <span className="text-sm font-700 tabular-nums">{fmt(v.total)} €</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top products */}
              <div className="bg-white border border-border rounded-2xl p-6">
                <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="TrophyIcon" size={18} className="text-amber-500" />
                  Top produits vendus
                </h2>
                {summary.topProducts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune donnée produit</p>
                ) : (
                  <div className="space-y-2">
                    {summary.topProducts.slice(0, 8).map((p, i) => (
                      <div key={i} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 shrink-0 ${
                          i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-600' : 'bg-muted text-muted-foreground'
                        }`}>{i + 1}</span>
                        <span className="flex-1 text-sm text-foreground truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">×{p.qty}</span>
                        <span className="text-sm font-600 tabular-nums shrink-0">{fmt(p.revenue)} €</span>
                      </div>
                    ))}
                  </div>
                )}
                {summary.topClient && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-xl">👑</span>
                    <div>
                      <p className="text-xs text-amber-600 font-600">Meilleur client du jour</p>
                      <p className="text-sm font-700 text-amber-800">{summary.topClient}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Employee sales */}
              <div className="bg-white border border-border rounded-2xl p-6">
                <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
                  <Icon name="UsersIcon" size={18} className="text-blue-500" />
                  Ventes par employé
                </h2>
                {summary.employeeSales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucune donnée employé</p>
                ) : (
                  <div className="space-y-3">
                    {summary.employeeSales.map((e, i) => {
                      const pct = summary.totalCA > 0 ? (e.total / summary.totalCA) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[11px] font-700 text-primary shrink-0">
                                {e.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-500 text-foreground">{e.name}</span>
                              <span className="text-xs text-muted-foreground">({e.count} ticket{e.count > 1 ? 's' : ''})</span>
                            </div>
                            <span className="text-sm font-700 tabular-nums">{fmt(e.total)} €</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Daily goal */}
                {summary.dailyGoal > 0 && (
                  <div className={`mt-4 border rounded-xl px-4 py-3 ${summary.goalReached ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{summary.goalReached ? '✅' : '🎯'}</span>
                      <div>
                        <p className={`text-sm font-700 ${summary.goalReached ? 'text-emerald-800' : 'text-red-800'}`}>
                          {summary.goalReached ? 'Objectif atteint !' : 'Objectif non atteint'}
                        </p>
                        <p className={`text-xs ${summary.goalReached ? 'text-emerald-600' : 'text-red-600'}`}>
                          Objectif : {fmt(summary.dailyGoal)} € · Réalisé : {fmt(summary.totalCA)} €
                        </p>
                      </div>
                    </div>
                    <div className="h-2 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${summary.goalReached ? 'bg-emerald-500' : 'bg-red-400'}`}
                        style={{ width: `${Math.min(100, (summary.totalCA / summary.dailyGoal) * 100)}%` }}
                      />
                    </div>
                    <p className={`text-xs mt-1 ${summary.goalReached ? 'text-emerald-600' : 'text-red-600'}`}>
                      {((summary.totalCA / summary.dailyGoal) * 100).toFixed(1)}% de l'objectif
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Expenses */}
            <div className="bg-white border border-border rounded-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-700 text-foreground flex items-center gap-2">
                  <Icon name="ArrowTrendingDownIcon" size={18} className="text-red-500" />
                  Dépenses & sorties de caisse
                </h2>
                <button
                  onClick={() => setShowExpenseForm(!showExpenseForm)}
                  className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
                >
                  <Icon name="PlusIcon" size={14} />
                  Ajouter une dépense
                </button>
              </div>

              {showExpenseForm && (
                <div className="bg-muted/30 border border-border rounded-xl p-4 mb-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Montant (€)</label>
                      <input
                        type="number"
                        value={expenseForm.amount}
                        onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0.00"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Catégorie</label>
                      <select
                        value={expenseForm.category}
                        onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      >
                        {EXPENSE_CATEGORIES.map(c => (
                          <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Mode de paiement</label>
                      <select
                        value={expenseForm.paymentMethod}
                        onChange={(e) => setExpenseForm(f => ({ ...f, paymentMethod: e.target.value }))}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                      >
                        <option value="cash">Espèces</option>
                        <option value="card">Carte bancaire</option>
                        <option value="transfer">Virement</option>
                        <option value="check">Chèque</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Effectué par</label>
                      <input
                        type="text"
                        value={expenseForm.performedBy}
                        onChange={(e) => setExpenseForm(f => ({ ...f, performedBy: e.target.value }))}
                        placeholder={cashierName || 'Nom'}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Note</label>
                    <input
                      type="text"
                      value={expenseForm.note}
                      onChange={(e) => setExpenseForm(f => ({ ...f, note: e.target.value }))}
                      placeholder="Description de la dépense..."
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddExpense}
                      className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity"
                    >
                      Ajouter
                    </button>
                    <button
                      onClick={() => setShowExpenseForm(false)}
                      className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}

              {summary.expenses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune dépense enregistrée pour cette journée.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border">
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Catégorie</th>
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Note</th>
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Mode</th>
                        <th className="text-left px-3 py-2 text-xs font-600 text-muted-foreground">Effectué par</th>
                        <th className="text-right px-3 py-2 text-xs font-600 text-muted-foreground">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.expenses.map((e, i) => (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-500 bg-muted px-2 py-0.5 rounded-full">
                              {EXPENSE_CATEGORIES.find(c => c.id === e.category)?.label || e.category}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-foreground">{e.note || '—'}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{e.paymentMethod}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground">{e.performedBy || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-700 text-red-600 tabular-nums">{fmt(e.amount)} €</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 border-t-2 border-red-200">
                        <td colSpan={4} className="px-3 py-2.5 text-sm font-700 text-red-700">Total dépenses</td>
                        <td className="px-3 py-2.5 text-right font-700 text-red-700 tabular-nums">{fmt(summary.totalExpenses)} €</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Net after expenses */}
              {summary.totalExpenses > 0 && (
                <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-600 text-slate-700">CA net après dépenses</span>
                  <span className="text-lg font-700 tabular-nums text-slate-800">{fmt(summary.totalCA - summary.totalExpenses)} €</span>
                </div>
              )}
            </div>

            {/* Closing notes + cashier */}
            <div className="bg-white border border-border rounded-2xl p-6">
              <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
                <Icon name="PencilSquareIcon" size={18} className="text-primary" />
                Notes de clôture
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1.5">Caissier responsable</label>
                  <input
                    type="text"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    placeholder="Nom du caissier"
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Notes de clôture, observations, écarts de caisse, incidents..."
                rows={4}
                className="w-full border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
            </div>

            {/* Summary footer */}
            <div className="bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-2xl font-700 text-foreground tabular-nums">{fmt(summary.totalCA)} €</p>
                  <p className="text-xs text-muted-foreground mt-1">CA Total TTC</p>
                </div>
                <div>
                  <p className="text-2xl font-700 text-foreground tabular-nums">{summary.ticketCount}</p>
                  <p className="text-xs text-muted-foreground mt-1">Tickets</p>
                </div>
                <div>
                  <p className="text-2xl font-700 text-emerald-600 tabular-nums">{fmt(summary.grossMargin)} €</p>
                  <p className="text-xs text-muted-foreground mt-1">Marge brute</p>
                </div>
                <div>
                  <p className={`text-2xl font-700 tabular-nums ${summary.totalExpenses > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {summary.totalExpenses > 0 ? `-${fmt(summary.totalExpenses)} €` : '0,00 €'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Dépenses</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
