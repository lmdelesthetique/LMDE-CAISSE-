'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { computeDaySummary, saveDaySummary, addDailyExpense, updateDailyExpense, deleteDailyExpense, syncExpenseToBusinessExpenses, type DaySummaryData, type DailyExpense } from '@/lib/services/posService';
import { toast } from 'sonner';

const BILLETS = [
  { valeur: 500, label: '500€' },
  { valeur: 200, label: '200€' },
  { valeur: 100, label: '100€' },
  { valeur: 50, label: '50€' },
  { valeur: 20, label: '20€' },
  { valeur: 10, label: '10€' },
  { valeur: 5, label: '5€' },
];

const PIECES = [
  { valeur: 2, label: '2€' },
  { valeur: 1, label: '1€' },
  { valeur: 0.5, label: '0,50€' },
  { valeur: 0.2, label: '0,20€' },
  { valeur: 0.1, label: '0,10€' },
  { valeur: 0.05, label: '0,05€' },
];

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
  const [editingExpense, setEditingExpense] = useState<(DailyExpense & { _idx: number }) | null>(null);
  const [deletingExpenseIdx, setDeletingExpenseIdx] = useState<number | null>(null);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    category: 'other',
    paymentMethod: 'cash',
    note: '',
    performedBy: '',
  });
  const printRef = useRef<HTMLDivElement>(null);

  // Fond de caisse clôture
  const [caisseSession, setCaisseSession] = useState<{ fond_ouverture: number; cash_in_today: number } | null>(null);
  const [fondCounts, setFondCounts] = useState<Record<string, number>>({});
  const [fondDemainMode, setFondDemainMode] = useState<'all' | 'fixed'>('all');
  const [fondDemainFixed, setFondDemainFixed] = useState('');
  const [closingSession, setClosingSession] = useState(false);

  // Feature 1 — sessions history
  const [sessions, setSessions] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  // Feature 2 — bank deposits
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositMonthTotal, setDepositMonthTotal] = useState(0);
  const [depositLoading, setDepositLoading] = useState(true);
  const [depositNeedsMigration, setDepositNeedsMigration] = useState(false);
  const [depositForm, setDepositForm] = useState({ amount: '', date: todayISO(), reference: '', notes: '' });
  const [savingDeposit, setSavingDeposit] = useState(false);

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

  useEffect(() => {
    fetch(`/api/caisse/sessions?date=${selectedDate}`)
      .then(r => r.json())
      .then(d => setCaisseSession(d || null))
      .catch(() => {});
  }, [selectedDate]);

  useEffect(() => {
    fetch('/api/caisse/history?limit=30')
      .then(r => r.ok ? r.json() : [])
      .then(d => setSessions(Array.isArray(d) ? d : []))
      .catch(() => setSessions([]))
      .finally(() => setSessionsLoading(false));
  }, []);

  useEffect(() => {
    fetch('/api/bank-deposits?limit=20')
      .then(r => r.ok ? r.json() : { deposits: [], monthTotal: 0 })
      .then(d => {
        setDeposits(d.deposits ?? []);
        setDepositMonthTotal(d.monthTotal ?? 0);
        if (d.needsMigration) setDepositNeedsMigration(true);
      })
      .catch(() => {})
      .finally(() => setDepositLoading(false));
  }, []);

  const handleDepositSave = async () => {
    const amount = parseFloat(depositForm.amount);
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return; }
    setSavingDeposit(true);
    try {
      const res = await fetch('/api/bank-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          date: depositForm.date,
          reference: depositForm.reference || null,
          notes: depositForm.notes || null,
          cash_before: fondCompte > 0 ? fondCompte : null,
          cash_after: fondCompte > 0 ? Math.max(0, fondCompte - amount) : null,
          created_by: cashierName || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Erreur serveur' }));
        throw new Error(err.error || 'Erreur lors du dépôt');
      }
      const newDeposit = await res.json();
      setDeposits(prev => [newDeposit, ...prev]);
      const currentMonth = new Date().toISOString().slice(0, 7);
      if (depositForm.date.startsWith(currentMonth)) {
        setDepositMonthTotal(prev => prev + amount);
      }
      setShowDepositModal(false);
      setDepositForm({ amount: '', date: todayISO(), reference: '', notes: '' });
      toast.success('Dépôt en banque enregistré');
    } catch (e: any) {
      toast.error(e.message ?? 'Erreur lors du dépôt');
    } finally {
      setSavingDeposit(false);
    }
  };

  const fondTheorique = caisseSession
    ? caisseSession.fond_ouverture + (caisseSession.cash_in_today ?? 0)
    : 0;

  const fondCompte = useMemo(() => {
    return [...BILLETS, ...PIECES].reduce((sum, d) => {
      return sum + (fondCounts[String(d.valeur)] ?? 0) * d.valeur;
    }, 0);
  }, [fondCounts]);

  const ecart = fondCompte - fondTheorique;
  const fondDemain = fondDemainMode === 'all' ? fondCompte : (parseFloat(fondDemainFixed) || 0);
  const montantADeposer = Math.max(0, fondCompte - fondDemain);

  const handleCloseCaisse = async () => {
    setClosingSession(true);
    try {
      const res = await fetch('/api/caisse/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          fond_compte: fondCompte,
          fond_theorique: fondTheorique,
          fond_demain: fondDemain,
          montant_a_deposer: montantADeposer,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Échec de la clôture caisse');
      }
      toast.success('Caisse clôturée avec succès');
      setCaisseSession(null);
    } catch (e: any) {
      toast.error(e?.message ?? 'Erreur lors de la clôture');
    } finally {
      setClosingSession(false);
    }
  };

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
      await syncExpenseToBusinessExpenses({ ...expense, cashierName });
      await loadSummary();
    } else {
      toast.error('Erreur lors de l\'ajout de la dépense');
    }
  };

  const handleEditExpenseSave = async () => {
    if (!editingExpense || !summary) return;
    const id = summary.expenses[editingExpense._idx]?.id;
    if (!id) { toast.error('ID de dépense introuvable'); return; }
    const amount = editingExpense.amount;
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return; }
    const ok = await updateDailyExpense(id, {
      expenseDate: editingExpense.expenseDate,
      amount: editingExpense.amount,
      category: editingExpense.category,
      paymentMethod: editingExpense.paymentMethod,
      note: editingExpense.note,
      performedBy: editingExpense.performedBy,
    });
    if (ok) {
      toast.success('Dépense modifiée');
      setEditingExpense(null);
      await loadSummary();
    } else {
      toast.error('Erreur lors de la modification');
    }
  };

  const handleDeleteExpense = async (idx: number) => {
    if (!summary) return;
    const id = summary.expenses[idx]?.id;
    if (!id) { toast.error('ID de dépense introuvable'); return; }
    const ok = await deleteDailyExpense(id);
    if (ok) {
      toast.success('Dépense supprimée');
      setDeletingExpenseIdx(null);
      await loadSummary();
    } else {
      toast.error('Erreur lors de la suppression');
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
    @page { size: A4; margin: 12mm; }
    * { color: #000000 !important; background: #ffffff !important; background-color: #ffffff !important; background-image: none !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-shadow: none !important; text-shadow: none !important; border-color: #000000 !important; -webkit-text-fill-color: #000000 !important; }
    body { font-family: 'Courier New', Courier, monospace !important; font-size: 12px !important; font-weight: 700 !important; padding: 12px; }
    p, span, div, td, th, li, strong, b, h1, h2, h3, h4, h5 { color: #000000 !important; font-weight: 700 !important; font-family: 'Courier New', Courier, monospace !important; }
    [class*="text-gray"], [class*="text-slate"], [class*="text-blue"], [class*="text-green"], [class*="text-red"], [class*="text-purple"] { color: #000000 !important; }
    [class*="bg-"], .badge, .tag, .status, .chip { background: #ffffff !important; background-color: #ffffff !important; color: #000000 !important; border: 1px solid #000000 !important; }
    hr, .divider, .separator { border: none !important; border-top: 2px solid #000000 !important; height: 2px !important; }
    .ticket-total, .grand-total, [class*="total"] { font-weight: 900 !important; border-top: 3px solid #000000 !important; border-bottom: 3px solid #000000 !important; }
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
              onClick={() => setShowDepositModal(true)}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
            >
              🏦 Dépôt en banque
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

        {/* ── Fond de caisse ─────────────────────────────────────── */}
        {caisseSession && (
          <div className="bg-white border border-border rounded-2xl p-6 space-y-5">
            <h2 className="text-base font-700 text-foreground flex items-center gap-2">
              <span className="text-xl">💰</span>
              Fond de caisse — Clôture
            </h2>

            {/* Denomination grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <p className="text-xs font-700 text-muted-foreground uppercase tracking-widest mb-2">Billets</p>
                <div className="grid grid-cols-4 gap-2">
                  {BILLETS.map((d) => (
                    <div key={d.valeur} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-700 text-foreground">{d.label}</span>
                      <input
                        type="number"
                        min="0"
                        value={fondCounts[String(d.valeur)] ?? ''}
                        onChange={(e) => {
                          const n = Math.max(0, parseInt(e.target.value) || 0);
                          setFondCounts(prev => ({ ...prev, [String(d.valeur)]: n }));
                        }}
                        placeholder="0"
                        className="w-full text-center px-2 py-1.5 text-sm font-600 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {(fondCounts[String(d.valeur)] ?? 0) > 0 && (
                        <span className="text-[9px] text-primary font-600">
                          = {(d.valeur * (fondCounts[String(d.valeur)] ?? 0)).toFixed(0)}€
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-700 text-muted-foreground uppercase tracking-widest mb-2">Pièces</p>
                <div className="grid grid-cols-4 gap-2">
                  {PIECES.map((d) => (
                    <div key={d.valeur} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-700 text-foreground">{d.label}</span>
                      <input
                        type="number"
                        min="0"
                        value={fondCounts[String(d.valeur)] ?? ''}
                        onChange={(e) => {
                          const n = Math.max(0, parseInt(e.target.value) || 0);
                          setFondCounts(prev => ({ ...prev, [String(d.valeur)]: n }));
                        }}
                        placeholder="0"
                        className="w-full text-center px-2 py-1.5 text-sm font-600 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {(fondCounts[String(d.valeur)] ?? 0) > 0 && (
                        <span className="text-[9px] text-primary font-600">
                          = {(d.valeur * (fondCounts[String(d.valeur)] ?? 0)).toFixed(2)}€
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Comparison */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/40 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">Vous avez compté</p>
                <p className="text-xl font-900 tabular-nums text-foreground">{fondCompte.toFixed(2)} €</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-center">
                <p className="text-xs text-blue-600 mb-1">Théorique tiroir</p>
                <p className="text-xl font-900 tabular-nums text-blue-800">{fondTheorique.toFixed(2)} €</p>
                <p className="text-[10px] text-blue-500 mt-0.5">
                  Fond ouv. {caisseSession.fond_ouverture.toFixed(2)} € + Espèces {(caisseSession.cash_in_today ?? 0).toFixed(2)} €
                </p>
              </div>
              <div className={`rounded-xl px-4 py-3 text-center border ${
                ecart === 0 ? 'bg-emerald-50 border-emerald-200' :
                Math.abs(ecart) <= 2 ? 'bg-amber-50 border-amber-200' :
                'bg-red-50 border-red-200'
              }`}>
                <p className={`text-xs mb-1 ${ecart === 0 ? 'text-emerald-600' : Math.abs(ecart) <= 2 ? 'text-amber-600' : 'text-red-600'}`}>Écart</p>
                <p className={`text-xl font-900 tabular-nums ${ecart === 0 ? 'text-emerald-700' : Math.abs(ecart) <= 2 ? 'text-amber-700' : 'text-red-700'}`}>
                  {ecart >= 0 ? '+' : ''}{ecart.toFixed(2)} €
                </p>
              </div>
            </div>

            {/* Fond pour demain */}
            <div className="space-y-3">
              <p className="text-sm font-600 text-foreground">Fond pour demain</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setFondDemainMode('all')}
                  className={`flex-1 py-2 rounded-lg text-sm font-600 transition-colors ${fondDemainMode === 'all' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  Garder tout ({fondCompte.toFixed(2)} €)
                </button>
                <button
                  onClick={() => setFondDemainMode('fixed')}
                  className={`flex-1 py-2 rounded-lg text-sm font-600 transition-colors ${fondDemainMode === 'fixed' ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  Montant fixe
                </button>
              </div>
              {fondDemainMode === 'fixed' && (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={fondDemainFixed}
                  onChange={(e) => setFondDemainFixed(e.target.value)}
                  placeholder="Ex: 150.00"
                  className="w-full px-4 py-2 border-2 border-primary/40 rounded-xl focus:outline-none focus:border-primary text-center text-lg font-700"
                />
              )}
              {fondCompte > 0 && (
                <div className="flex items-center justify-between bg-muted/30 rounded-xl px-4 py-3">
                  <span className="text-sm text-muted-foreground">Montant à déposer en banque</span>
                  <span className="text-lg font-900 tabular-nums text-foreground">{montantADeposer.toFixed(2)} €</span>
                </div>
              )}
            </div>

            {/* Close button */}
            <button
              onClick={handleCloseCaisse}
              disabled={closingSession}
              className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-700 rounded-xl hover:bg-accent transition-colors disabled:opacity-60 text-sm"
            >
              {closingSession ? (
                <><Icon name="ArrowPathIcon" size={16} className="animate-spin" />Clôture en cours…</>
              ) : (
                <><Icon name="LockClosedIcon" size={16} />Clôturer la caisse</>
              )}
            </button>
          </div>
        )}

        {/* ── Feature 2 — Dépôts en banque ───────────────────────── */}
        <div className="bg-white border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-700 text-foreground flex items-center gap-2">
              🏦 Dépôts en banque
            </h2>
            <div className="flex items-center gap-3">
              {!depositNeedsMigration && (
                <span className="text-sm text-muted-foreground">
                  Total ce mois :&nbsp;
                  <span className="font-700 text-foreground tabular-nums">{fmt(depositMonthTotal)} €</span>
                </span>
              )}
              <button
                onClick={() => setShowDepositModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 transition-opacity"
              >
                🏦 Nouveau dépôt
              </button>
            </div>
          </div>

          {depositNeedsMigration ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-sm font-600 text-amber-800 mb-1">⚠️ Table bank_deposits manquante</p>
              <p className="text-xs text-amber-700">Exécutez ce SQL dans Supabase → SQL Editor :</p>
              <pre className="text-xs bg-amber-100 rounded p-2 mt-2 overflow-x-auto whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS bank_deposits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  notes TEXT,
  cash_before DECIMAL(10,2),
  cash_after DECIMAL(10,2),
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`}
              </pre>
            </div>
          ) : depositLoading ? (
            <div className="flex justify-center py-4">
              <Icon name="ArrowPathIcon" size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : deposits.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun dépôt enregistré. Cliquez sur "Nouveau dépôt" pour en créer un.</p>
          ) : (
            <div className="divide-y divide-border">
              {deposits.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">✅</span>
                    <div>
                      <p className="text-sm font-600 text-foreground">
                        {new Date(d.date + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </p>
                      {d.reference && <p className="text-xs text-muted-foreground">{d.reference}</p>}
                      {d.notes && <p className="text-xs text-muted-foreground italic">{d.notes}</p>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-700 tabular-nums text-foreground">{fmt(d.amount)} €</p>
                    {d.created_by && <p className="text-xs text-muted-foreground">{d.created_by}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Feature 1 — Historique des journées ─────────────────── */}
        <div className="bg-white border border-border rounded-2xl p-6">
          <h2 className="text-base font-700 text-foreground mb-4 flex items-center gap-2">
            📅 Historique des journées
          </h2>

          {sessionsLoading ? (
            <div className="flex justify-center py-4">
              <Icon name="ArrowPathIcon" size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune session enregistrée.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-3 py-2.5 text-xs font-600 text-muted-foreground">Date</th>
                      <th className="text-right px-3 py-2.5 text-xs font-600 text-muted-foreground">Ouverture</th>
                      <th className="text-right px-3 py-2.5 text-xs font-600 text-muted-foreground">Clôture</th>
                      <th className="text-right px-3 py-2.5 text-xs font-600 text-muted-foreground">CA</th>
                      <th className="text-right px-3 py-2.5 text-xs font-600 text-muted-foreground">Tickets</th>
                      <th className="text-right px-3 py-2.5 text-xs font-600 text-muted-foreground">Écart</th>
                      <th className="text-center px-3 py-2.5 text-xs font-600 text-muted-foreground">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <React.Fragment key={s.id}>
                        <tr
                          className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => setSelectedSession(selectedSession?.id === s.id ? null : s)}
                        >
                          <td className="px-3 py-2.5 font-600 text-foreground">
                            {new Date(s.date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' })}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {s.fond_ouverture != null ? `${fmt(s.fond_ouverture)} €` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                            {s.fond_compte != null ? `${fmt(s.fond_compte)} €` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-600 text-emerald-700">
                            {s.ca_total > 0 ? `${fmt(s.ca_total)} €` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {s.nombre_tickets > 0 ? s.nombre_tickets : '—'}
                          </td>
                          <td className={`px-3 py-2.5 text-right tabular-nums font-600 ${
                            s.ecart == null ? 'text-muted-foreground' :
                            s.ecart === 0 ? 'text-emerald-600' :
                            Math.abs(s.ecart) <= 2 ? 'text-amber-600' : 'text-red-600'
                          }`}>
                            {s.ecart != null ? `${s.ecart >= 0 ? '+' : ''}${fmt(s.ecart)} €` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${
                              s.statut === 'cloturee'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {s.statut === 'cloturee' ? 'Clôturée' : 'Ouverte'}
                            </span>
                          </td>
                        </tr>

                        {selectedSession?.id === s.id && (
                          <tr>
                            <td colSpan={7} className="px-3 py-3 bg-muted/20">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                  { label: 'Fond ouverture', value: s.fond_ouverture != null ? `${fmt(s.fond_ouverture)} €` : '—' },
                                  { label: 'Fond théorique', value: s.fond_theorique != null ? `${fmt(s.fond_theorique)} €` : '—' },
                                  { label: 'Fond clôture', value: s.fond_compte != null ? `${fmt(s.fond_compte)} €` : '—' },
                                  { label: 'À déposer', value: s.montant_a_deposer != null ? `${fmt(s.montant_a_deposer)} €` : '—' },
                                  { label: 'CA du jour', value: s.ca_total > 0 ? `${fmt(s.ca_total)} €` : '—' },
                                  { label: 'Tickets', value: s.nombre_tickets > 0 ? String(s.nombre_tickets) : '—' },
                                  { label: 'Caissier', value: s.caissier_name || '—' },
                                  { label: 'Heure clôture', value: s.heure_cloture ? new Date(s.heure_cloture).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—' },
                                ].map((item) => (
                                  <div key={item.label} className="bg-white rounded-lg px-3 py-2 border border-border">
                                    <p className="text-[10px] text-muted-foreground mb-0.5">{item.label}</p>
                                    <p className="text-sm font-700 text-foreground">{item.value}</p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
                        <th className="px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.expenses.map((e, i) => (
                        editingExpense?._idx === i ? (
                          // Inline edit row
                          <tr key={i} className="border-b border-border bg-amber-50">
                            <td className="px-2 py-2">
                              <select value={editingExpense.category} onChange={(ev) => setEditingExpense(prev => prev ? {...prev, category: ev.target.value} : prev)}
                                className="w-full border border-border rounded px-2 py-1 text-xs bg-white">
                                {EXPENSE_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input value={editingExpense.note} onChange={(ev) => setEditingExpense(prev => prev ? {...prev, note: ev.target.value} : prev)}
                                className="w-full border border-border rounded px-2 py-1 text-xs" placeholder="Note" />
                            </td>
                            <td className="px-2 py-2">
                              <select value={editingExpense.paymentMethod} onChange={(ev) => setEditingExpense(prev => prev ? {...prev, paymentMethod: ev.target.value} : prev)}
                                className="w-full border border-border rounded px-2 py-1 text-xs bg-white">
                                <option value="cash">Espèces</option>
                                <option value="card">Carte</option>
                                <option value="transfer">Virement</option>
                                <option value="check">Chèque</option>
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <input value={editingExpense.performedBy} onChange={(ev) => setEditingExpense(prev => prev ? {...prev, performedBy: ev.target.value} : prev)}
                                className="w-full border border-border rounded px-2 py-1 text-xs" placeholder="Nom" />
                            </td>
                            <td className="px-2 py-2 text-right">
                              <input type="number" value={editingExpense.amount} onChange={(ev) => setEditingExpense(prev => prev ? {...prev, amount: parseFloat(ev.target.value) || 0} : prev)}
                                className="w-20 border border-border rounded px-2 py-1 text-xs text-right" />
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex gap-1">
                                <button onClick={handleEditExpenseSave} className="p-1 bg-primary text-primary-foreground rounded hover:opacity-90"><Icon name="CheckIcon" size={12} /></button>
                                <button onClick={() => setEditingExpense(null)} className="p-1 bg-muted text-muted-foreground rounded hover:bg-muted/80"><Icon name="XMarkIcon" size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ) : deletingExpenseIdx === i ? (
                          // Confirm delete row
                          <tr key={i} className="border-b border-border bg-red-50">
                            <td colSpan={5} className="px-3 py-2.5 text-sm text-red-700 font-500">Supprimer cette dépense de {fmt(e.amount)} € ?</td>
                            <td className="px-2 py-2">
                              <div className="flex gap-1">
                                <button onClick={() => handleDeleteExpense(i)} className="p-1 bg-red-500 text-white rounded hover:bg-red-600"><Icon name="CheckIcon" size={12} /></button>
                                <button onClick={() => setDeletingExpenseIdx(null)} className="p-1 bg-muted text-muted-foreground rounded"><Icon name="XMarkIcon" size={12} /></button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          // Normal display row
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
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                <button onClick={() => setEditingExpense({ ...e, expenseDate: e.expenseDate || selectedDate, _idx: i })}
                                  className="p-1 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-colors">
                                  <Icon name="PencilIcon" size={13} />
                                </button>
                                <button onClick={() => setDeletingExpenseIdx(i)}
                                  className="p-1 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                                  <Icon name="TrashIcon" size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-red-50 border-t-2 border-red-200">
                        <td colSpan={4} className="px-3 py-2.5 text-sm font-700 text-red-700">Total dépenses</td>
                        <td className="px-3 py-2.5 text-right font-700 text-red-700 tabular-nums">{fmt(summary.totalExpenses)} €</td>
                        <td></td>
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
      {/* Deposit modal */}
      {showDepositModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-700 text-foreground">🏦 Enregistrer un dépôt en banque</h3>
              <button onClick={() => setShowDepositModal(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Montant déposé *</label>
              <input
                type="number" min="0" step="0.01" autoFocus
                value={depositForm.amount}
                onChange={(e) => setDepositForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Date</label>
              <input
                type="date"
                value={depositForm.date}
                onChange={(e) => setDepositForm(f => ({ ...f, date: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Référence bancaire</label>
              <input
                type="text"
                value={depositForm.reference}
                onChange={(e) => setDepositForm(f => ({ ...f, reference: e.target.value }))}
                placeholder="ex: virement, bordereau..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Notes</label>
              <input
                type="text"
                value={depositForm.notes}
                onChange={(e) => setDepositForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Notes optionnelles..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>

            {fondCompte > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Espèces en caisse</span>
                  <span className="font-700 text-blue-800 tabular-nums">{fmt(fondCompte)} €</span>
                </div>
                {depositForm.amount && parseFloat(depositForm.amount) > 0 && (
                  <div className="flex justify-between text-sm border-t border-blue-200 pt-1.5">
                    <span className="text-blue-700">Après dépôt</span>
                    <span className="font-700 text-blue-800 tabular-nums">
                      {fmt(Math.max(0, fondCompte - parseFloat(depositForm.amount)))} €
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowDepositModal(false)}
                className="flex-1 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleDepositSave}
                disabled={savingDeposit || !depositForm.amount || parseFloat(depositForm.amount) <= 0}
                className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2"
              >
                {savingDeposit ? (
                  <><Icon name="ArrowPathIcon" size={14} className="animate-spin" /> Enregistrement…</>
                ) : (
                  '🏦 Enregistrer'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
