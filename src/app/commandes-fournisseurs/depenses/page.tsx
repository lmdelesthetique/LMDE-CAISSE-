'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpenseCategory = 'daily' | 'fixed_monthly' | 'variable';
type ExpensePaymentMethod = 'cash' | 'card' | 'transfer' | 'check' | 'other';

interface BusinessExpense {
  id: string;
  category: ExpenseCategory;
  expense_type: string;
  label: string;
  amount: number;
  expense_date: string;
  payment_method: ExpensePaymentMethod;
  receipt_url?: string;
  note?: string;
  is_recurring: boolean;
  recurrence_day?: number;
  created_at: string;
}

interface StructureFeeConfig {
  id?: string;
  month_year: string;
  fixed_expenses: number;
  variable_expenses: number;
  reference_revenue: number;
  recommended_pct: number;
  applied_pct: number;
  notes?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<ExpenseCategory, { label: string; color: string; icon: string; bg: string }> = {
  daily: { label: 'Quotidiennes', color: 'text-blue-700', bg: 'bg-blue-50', icon: 'SunIcon' },
  fixed_monthly: { label: 'Fixes mensuelles', color: 'text-purple-700', bg: 'bg-purple-50', icon: 'CalendarDaysIcon' },
  variable: { label: 'Variables', color: 'text-amber-700', bg: 'bg-amber-50', icon: 'ArrowTrendingUpIcon' },
};

const EXPENSE_TYPES: Record<ExpenseCategory, { value: string; label: string }[]> = {
  daily: [
    { value: 'fuel', label: 'Essence' },
    { value: 'supplies', label: 'Petites fournitures' },
    { value: 'delivery', label: 'Livraison' },
    { value: 'urgent_purchase', label: 'Achat urgent' },
    { value: 'shop_fees', label: 'Frais boutique' },
    { value: 'other', label: 'Autre' },
  ],
  fixed_monthly: [
    { value: 'rent', label: 'Loyer' },
    { value: 'salary', label: 'Salaires' },
    { value: 'insurance', label: 'Assurance' },
    { value: 'internet', label: 'Internet' },
    { value: 'software', label: 'Logiciel' },
    { value: 'accounting', label: 'Comptabilité' },
    { value: 'electricity', label: 'Électricité' },
    { value: 'other', label: 'Autre' },
  ],
  variable: [
    { value: 'advertising', label: 'Publicité' },
    { value: 'exceptional_transport', label: 'Transport exceptionnel' },
    { value: 'repair', label: 'Réparation' },
    { value: 'one_time_purchase', label: 'Achat ponctuel' },
    { value: 'bank_fees', label: 'Frais bancaires' },
    { value: 'other', label: 'Autre' },
  ],
};

const PAYMENT_METHODS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Espèces' },
  { value: 'card', label: 'Carte' },
  { value: 'transfer', label: 'Virement' },
  { value: 'check', label: 'Chèque' },
  { value: 'other', label: 'Autre' },
];

// ─── Expense Form Modal ───────────────────────────────────────────────────────

interface ExpenseFormModalProps {
  expense?: BusinessExpense | null;
  onClose: () => void;
  onSave: (data: Partial<BusinessExpense>) => Promise<void>;
}

function ExpenseFormModal({ expense, onClose, onSave }: ExpenseFormModalProps) {
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'daily');
  const [expenseType, setExpenseType] = useState(expense?.expense_type ?? 'other');
  const [label, setLabel] = useState(expense?.label ?? '');
  const [amount, setAmount] = useState(expense?.amount?.toString() ?? '');
  const [date, setDate] = useState(expense?.expense_date ?? new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<ExpensePaymentMethod>(expense?.payment_method ?? 'cash');
  const [note, setNote] = useState(expense?.note ?? '');
  const [isRecurring, setIsRecurring] = useState(expense?.is_recurring ?? false);
  const [recurrenceDay, setRecurrenceDay] = useState(expense?.recurrence_day?.toString() ?? '1');
  const [saving, setSaving] = useState(false);

  const types = EXPENSE_TYPES[category];

  const handleSave = async () => {
    if (!label.trim() || !amount) return;
    setSaving(true);
    try {
      await onSave({
        category,
        expense_type: expenseType,
        label: label.trim(),
        amount: parseFloat(amount),
        expense_date: date,
        payment_method: paymentMethod,
        note: note.trim() || undefined,
        is_recurring: isRecurring,
        recurrence_day: isRecurring ? parseInt(recurrenceDay) : undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{expense ? 'Modifier la dépense' : 'Nouvelle dépense'}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {/* Category */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Catégorie</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(CATEGORY_CONFIG) as ExpenseCategory[]).map((cat) => {
                const cfg = CATEGORY_CONFIG[cat];
                return (
                  <button
                    key={cat}
                    onClick={() => { setCategory(cat); setExpenseType('other'); }}
                    className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-xs font-medium transition-all ${
                      category === cat ? `border-primary ${cfg.bg} ${cfg.color}` : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    <Icon name={cfg.icon as any} size={16} />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type + Label */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type</label>
              <select
                value={expenseType}
                onChange={(e) => setExpenseType(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Libellé *</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Description de la dépense"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Amount + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Montant (€) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Mode de paiement</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setPaymentMethod(m.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    paymentMethod === m.value ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note optionnelle..."
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Recurring */}
          {category === 'fixed_monthly' && (
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
              <input
                type="checkbox"
                id="recurring"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-4 h-4 accent-purple-600"
              />
              <label htmlFor="recurring" className="text-sm text-purple-700 font-medium flex-1">Dépense récurrente mensuelle</label>
              {isRecurring && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600">Jour :</span>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={recurrenceDay}
                    onChange={(e) => setRecurrenceDay(e.target.value)}
                    className="w-14 border border-purple-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none"
                  />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Annuler</button>
          <button
            onClick={handleSave}
            disabled={saving || !label.trim() || !amount}
            className="px-5 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Structure Fee Panel ──────────────────────────────────────────────────────

interface StructureFeePanelProps {
  expenses: BusinessExpense[];
}

function StructureFeePanel({ expenses }: StructureFeePanelProps) {
  const supabase = createClient();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [config, setConfig] = useState<StructureFeeConfig>({
    month_year: currentMonth,
    fixed_expenses: 0,
    variable_expenses: 0,
    reference_revenue: 0,
    recommended_pct: 0,
    applied_pct: 0,
  });
  const [revenue, setRevenue] = useState('');
  const [saving, setSaving] = useState(false);

  // Auto-calculate from expenses
  const monthExpenses = expenses.filter((e) => e.expense_date.startsWith(currentMonth));
  const autoFixed = monthExpenses.filter((e) => e.category === 'fixed_monthly').reduce((s, e) => s + e.amount, 0);
  const autoVariable = monthExpenses.filter((e) => e.category === 'variable').reduce((s, e) => s + e.amount, 0);
  const autoDaily = monthExpenses.filter((e) => e.category === 'daily').reduce((s, e) => s + e.amount, 0);
  const totalExpenses = autoFixed + autoVariable + autoDaily;
  const refRevenue = parseFloat(revenue) || 1;
  const recommendedPct = refRevenue > 0 ? (totalExpenses / refRevenue) * 100 : 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = {
        month_year: currentMonth,
        fixed_expenses: autoFixed,
        variable_expenses: autoVariable + autoDaily,
        reference_revenue: parseFloat(revenue) || 0,
        recommended_pct: recommendedPct,
        applied_pct: parseFloat(revenue) > 0 ? recommendedPct : config.applied_pct,
        notes: config.notes,
      };
      const { error } = await supabase
        .from('structure_fee_config')
        .upsert(data, { onConflict: 'month_year' });
      if (!error) {
        setConfig((prev) => ({ ...prev, ...data }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-card p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center">
          <Icon name="CalculatorIcon" size={17} className="text-violet-600" />
        </div>
        <div>
          <h3 className="font-600 text-foreground">Calcul frais structure</h3>
          <p className="text-xs text-muted-foreground">Pourcentage recommandé pour les commandes</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Fixes', value: autoFixed, color: 'text-purple-600 bg-purple-50' },
          { label: 'Variables', value: autoVariable, color: 'text-amber-600 bg-amber-50' },
          { label: 'Quotidiennes', value: autoDaily, color: 'text-blue-600 bg-blue-50' },
          { label: 'Total dépenses', value: totalExpenses, color: 'text-red-600 bg-red-50' },
        ].map((item) => (
          <div key={item.label} className={`rounded-xl p-3 ${item.color.split(' ')[1]}`}>
            <p className={`text-lg font-700 ${item.color.split(' ')[0]}`}>{item.value.toFixed(0)} €</p>
            <p className="text-xs text-muted-foreground">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-3 mb-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">CA de référence du mois (€)</label>
          <input
            type="number"
            min="0"
            step="100"
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
            placeholder="Ex: 30000"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">% frais structure recommandé</label>
          <div className={`w-full border rounded-lg px-3 py-2 text-sm font-700 ${
            recommendedPct > 40 ? 'border-red-300 bg-red-50 text-red-700' :
            recommendedPct > 25 ? 'border-amber-300 bg-amber-50 text-amber-700': 'border-emerald-300 bg-emerald-50 text-emerald-700'
          }`}>
            {recommendedPct.toFixed(1)} %
          </div>
        </div>
      </div>

      {parseFloat(revenue) > 0 && (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4">
          <p className="text-sm font-600 text-violet-800 mb-1">Résumé du calcul</p>
          <p className="text-xs text-violet-700">
            Dépenses totales : <strong>{totalExpenses.toFixed(0)} €</strong> ÷ CA : <strong>{parseFloat(revenue).toFixed(0)} €</strong> = <strong>{recommendedPct.toFixed(1)} %</strong> de frais structure
          </p>
          <p className="text-xs text-violet-600 mt-1">
            Ce pourcentage sera proposé automatiquement dans les nouvelles commandes fournisseurs.
          </p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Enregistrement...' : 'Sauvegarder le calcul du mois'}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ─── CSV import helpers ───────────────────────────────────────────────────────

const CAT_MAP: Record<string, string> = {
  'fixes mensuelles': 'fixed_monthly',
  'quotidiennes': 'daily',
  'variables': 'variable',
};

const TYPE_MAP: Record<string, string> = {
  'essence': 'fuel', 'petites fournitures': 'supplies', 'livraison': 'delivery',
  'achat urgent': 'urgent_purchase', 'frais boutique': 'shop_fees',
  'loyer': 'rent', 'salaires': 'salary', 'assurance': 'insurance',
  'internet': 'internet', 'abonnement logiciel': 'software', 'logiciel': 'software',
  'comptabilité': 'accounting', 'électricité': 'electricity',
  'publicité': 'advertising', 'transport exceptionnel': 'exceptional_transport',
  'réparation': 'repair', 'achat ponctuel': 'one_time_purchase',
  'frais bancaires': 'bank_fees',
};

const PAY_MAP: Record<string, string> = {
  'espèces': 'cash', 'especes': 'cash', 'carte': 'card',
  'virement': 'transfer', 'chèque': 'check', 'cheque': 'check',
};

interface CsvRow {
  date: string;
  categorie: string;
  type: string;
  libelle: string;
  montant: number;
  modePaiement: string;
  note: string;
  category: string;
  expense_type: string;
  payment_method: string;
  valid: boolean;
  skipReason?: string;
}

function parseCSV(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/["﻿]/g, ''));
  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur); cur = ''; }
      else { cur += ch; }
    }
    cols.push(cur);

    const get = (key: string) => (cols[headers.indexOf(key)] ?? '').trim().replace(/^"|"$/g, '');
    const cat = get('categorie').toLowerCase();
    const montant = parseFloat(get('montant_eur') || '0');
    const category = CAT_MAP[cat] ?? '';
    const rawType = get('type').toLowerCase();
    const expense_type = TYPE_MAP[rawType] ?? 'other';
    const rawPay = get('mode_paiement').toLowerCase();
    const payment_method = PAY_MAP[rawPay] ?? 'other';

    const skipReason = !category
      ? `Catégorie ignorée : "${get('categorie')}"`
      : montant <= 0 ? 'Montant invalide'
      : !get('date') ? 'Date manquante'
      : undefined;

    rows.push({
      date: get('date'),
      categorie: get('categorie'),
      type: get('type'),
      libelle: get('libelle'),
      montant,
      modePaiement: get('mode_paiement'),
      note: get('note'),
      category,
      expense_type,
      payment_method,
      valid: !skipReason,
      skipReason,
    });
  }
  return rows;
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DepensesFournisseursPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<'supplier' | 'business'>('supplier');
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editExpense, setEditExpense] = useState<BusinessExpense | null>(null);
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7));

  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Supplier analysis state (existing)
  const [orders, setOrders] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [filterSupplier, setFilterSupplier] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all');

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('business_expenses')
        .select('*')
        .order('expense_date', { ascending: false });
      setExpenses(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    try {
      const { supplierOrderService } = await import('@/lib/services/supplierOrderService');
      const { supplierService } = await import('@/lib/services/supplierService');
      const [o, s] = await Promise.all([supplierOrderService.getAll(), supplierService.getAll()]);
      setOrders(o);
      setSuppliers(s);
    } finally {
      setLoadingOrders(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    loadExpenses();
  }, [loadOrders, loadExpenses]);

  const handleSaveExpense = async (data: Partial<BusinessExpense>) => {
    if (editExpense) {
      await supabase.from('business_expenses').update(data).eq('id', editExpense.id);
    } else {
      await supabase.from('business_expenses').insert(data);
    }
    setEditExpense(null);
    await loadExpenses();
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    await supabase.from('business_expenses').delete().eq('id', id);
    await loadExpenses();
  };

  const exportCSV = () => {
    const PAYMENT_LABEL: Record<string, string> = {
      cash: 'Espèces', card: 'Carte', transfer: 'Virement', check: 'Chèque', other: 'Autre',
    };
    const CAT_LABEL: Record<string, string> = {
      daily: 'Quotidiennes', fixed_monthly: 'Fixes mensuelles', variable: 'Variables',
    };
    const TYPE_LABELS: Record<string, string> = {
      fuel: 'Essence', supplies: 'Petites fournitures', delivery: 'Livraison',
      urgent_purchase: 'Achat urgent', shop_fees: 'Frais boutique', rent: 'Loyer',
      salary: 'Salaires', insurance: 'Assurance', internet: 'Internet',
      software: 'Abonnement logiciel', accounting: 'Comptabilité', electricity: 'Électricité',
      advertising: 'Publicité', exceptional_transport: 'Transport exceptionnel',
      repair: 'Réparation', one_time_purchase: 'Achat ponctuel', bank_fees: 'Frais bancaires',
      other: 'Autre',
    };

    const rows: string[] = ['date,categorie,type,libelle,montant_eur,mode_paiement,note'];

    // Supplier orders
    const allOrders = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    allOrders.forEach((o: any) => {
      const date = new Date(o.createdAt).toISOString().slice(0, 10);
      const supplierName = o.supplierName || 'Fournisseur';
      const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      if (o.subtotal > 0) rows.push([date, 'Dépenses fournisseurs', 'Achat produits', esc(`${supplierName} - produits`), o.subtotal.toFixed(2), 'Virement', esc(`Commande ${date}`)].join(','));
      if (o.transportCost > 0) rows.push([date, 'Dépenses fournisseurs', 'Fret', esc(`${supplierName} - transport`), o.transportCost.toFixed(2), 'Virement', ''].join(','));
      if (o.customsCost > 0) rows.push([date, 'Dépenses fournisseurs', 'Douane', esc(`Douane - ${supplierName}`), o.customsCost.toFixed(2), 'Virement', ''].join(','));
      if (o.vatImport > 0) rows.push([date, 'Dépenses fournisseurs', 'TVA import', esc(`TVA import - ${supplierName}`), o.vatImport.toFixed(2), 'Virement', ''].join(','));
      const otherCost = (o.freightForwarderCost || 0) + (o.bankFees || 0) + (o.exchangeFees || 0) + (o.localDelivery || 0) + (o.otherCosts || 0);
      if (otherCost > 0) rows.push([date, 'Dépenses fournisseurs', 'Frais divers', esc(`Frais divers - ${supplierName}`), otherCost.toFixed(2), 'Virement', ''].join(','));
    });

    // Business expenses
    const allExpenses = [...expenses].sort((a, b) => a.expense_date.localeCompare(b.expense_date));
    allExpenses.forEach((e) => {
      const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      rows.push([
        e.expense_date,
        CAT_LABEL[e.category] || e.category,
        TYPE_LABELS[e.expense_type] || e.expense_type,
        esc(e.label),
        e.amount.toFixed(2),
        PAYMENT_LABEL[e.payment_method] || e.payment_method,
        esc(e.note || ''),
      ].join(','));
    });

    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = `beautypos-depenses-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setCsvRows(rows);
      setImportResult(null);
      setShowImport(true);
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    const validRows = csvRows.filter((r) => r.valid);
    if (validRows.length === 0) return;
    setImporting(true);
    try {
      const payload = validRows.map((r) => ({
        category: r.category,
        expense_type: r.expense_type,
        label: r.libelle,
        amount: r.montant,
        expense_date: r.date,
        payment_method: r.payment_method,
        note: r.note || null,
        is_recurring: false,
      }));
      const res = await fetch('/api/expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erreur import');
      setImportResult(`✅ ${json.inserted} dépenses importées avec succès`);
      await loadExpenses();
    } catch (err: any) {
      setImportResult(`❌ Erreur : ${err.message}`);
    } finally {
      setImporting(false);
    }
  };

  // Filter expenses
  const filteredExpenses = expenses.filter((e) => {
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    if (filterMonth && !e.expense_date.startsWith(filterMonth)) return false;
    return true;
  });

  const totalByCategory = {
    daily: filteredExpenses.filter((e) => e.category === 'daily').reduce((s, e) => s + e.amount, 0),
    fixed_monthly: filteredExpenses.filter((e) => e.category === 'fixed_monthly').reduce((s, e) => s + e.amount, 0),
    variable: filteredExpenses.filter((e) => e.category === 'variable').reduce((s, e) => s + e.amount, 0),
  };
  const totalAll = Object.values(totalByCategory).reduce((s, v) => s + v, 0);

  // Supplier analysis
  const filteredOrders = orders.filter((o) => {
    if (filterSupplier && o.supplierId !== filterSupplier) return false;
    if (filterPeriod !== 'all') {
      const now = new Date();
      const created = new Date(o.createdAt);
      if (filterPeriod === '30d' && (now.getTime() - created.getTime()) > 30 * 86400000) return false;
      if (filterPeriod === '90d' && (now.getTime() - created.getTime()) > 90 * 86400000) return false;
      if (filterPeriod === '1y' && (now.getTime() - created.getTime()) > 365 * 86400000) return false;
    }
    return true;
  });

  const totalSpent = filteredOrders.reduce((s: number, o: any) => s + (o.totalRealCost || 0), 0);
  const totalProducts = filteredOrders.reduce((s: number, o: any) => s + (o.subtotal || 0), 0);
  const totalTransport = filteredOrders.reduce((s: number, o: any) => s + (o.transportCost || 0), 0);
  const totalCustoms = filteredOrders.reduce((s: number, o: any) => s + (o.customsCost || 0), 0);
  const totalVat = filteredOrders.reduce((s: number, o: any) => s + (o.vatImport || 0), 0);
  const totalOther = filteredOrders.reduce((s: number, o: any) => s + ((o.freightForwarderCost || 0) + (o.bankFees || 0) + (o.exchangeFees || 0) + (o.localDelivery || 0) + (o.otherCosts || 0)), 0);

  const bySupplier: Record<string, any> = {};
  filteredOrders.forEach((o: any) => {
    const key = o.supplierId || 'unknown';
    if (!bySupplier[key]) {
      bySupplier[key] = { supplierId: key, supplierName: o.supplierName || 'Inconnu', orderCount: 0, totalSpent: 0, totalProducts: 0, totalTransport: 0, totalCustoms: 0, totalVat: 0, totalOther: 0, avgOrder: 0 };
    }
    const e = bySupplier[key];
    e.orderCount++;
    e.totalSpent += o.totalRealCost || 0;
    e.totalProducts += o.subtotal || 0;
    e.totalTransport += o.transportCost || 0;
    e.totalCustoms += o.customsCost || 0;
    e.totalVat += o.vatImport || 0;
    e.totalOther += (o.freightForwarderCost || 0) + (o.bankFees || 0) + (o.exchangeFees || 0) + (o.localDelivery || 0) + (o.otherCosts || 0);
  });
  Object.values(bySupplier).forEach((e: any) => { e.avgOrder = e.orderCount > 0 ? e.totalSpent / e.orderCount : 0; });
  const supplierList = Object.values(bySupplier).sort((a: any, b: any) => b.totalSpent - a.totalSpent);

  const paidOrders = filteredOrders.filter((o: any) => ['paid', 'payment_received_by_supplier'].includes(o.orderStatus));
  const unpaidOrders = filteredOrders.filter((o: any) => ['payment_pending', 'payment_in_progress'].includes(o.orderStatus));
  const totalPaid = paidOrders.reduce((s: number, o: any) => s + (o.supplierPaymentAmount || 0), 0);
  const totalUnpaid = unpaidOrders.reduce((s: number, o: any) => s + (o.totalRealCost || 0), 0);

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <Link href="/commandes-fournisseurs" className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="ArrowLeftIcon" size={18} />
            </Link>
            <div>
              <h1 className="text-2xl font-700 text-foreground">Dépenses</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Analyse fournisseurs + dépenses entreprise</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Icon name="ArrowUpTrayIcon" size={16} />
              Importer CSV
            </button>
            <button
              onClick={exportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Icon name="ArrowDownTrayIcon" size={16} />
              Exporter CSV
            </button>
            {activeTab === 'business' && (
              <button
                onClick={() => { setEditExpense(null); setShowForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
              >
                <Icon name="PlusIcon" size={16} />
                Nouvelle dépense
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl mb-6 w-fit">
          {[
            { id: 'supplier', label: 'Dépenses fournisseurs', icon: 'TruckIcon' },
            { id: 'business', label: 'Dépenses entreprise', icon: 'BuildingOfficeIcon' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon name={tab.icon as any} size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── SUPPLIER ANALYSIS TAB ── */}
        {activeTab === 'supplier' && (
          <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <select value={filterSupplier} onChange={(e) => setFilterSupplier(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="">Tous les fournisseurs</option>
                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.companyName}</option>)}
              </select>
              <select value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                <option value="all">Toute la période</option>
                <option value="30d">30 derniers jours</option>
                <option value="90d">90 derniers jours</option>
                <option value="1y">12 derniers mois</option>
              </select>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {[
                { label: 'Total dépensé', value: `${totalSpent.toFixed(0)} €`, icon: 'BanknotesIcon', color: 'text-primary bg-primary/10' },
                { label: 'Produits', value: `${totalProducts.toFixed(0)} €`, icon: 'ShoppingBagIcon', color: 'text-blue-600 bg-blue-50' },
                { label: 'Transport', value: `${totalTransport.toFixed(0)} €`, icon: 'TruckIcon', color: 'text-cyan-600 bg-cyan-50' },
                { label: 'Douane', value: `${totalCustoms.toFixed(0)} €`, icon: 'DocumentTextIcon', color: 'text-amber-600 bg-amber-50' },
                { label: 'TVA import', value: `${totalVat.toFixed(0)} €`, icon: 'ReceiptPercentIcon', color: 'text-purple-600 bg-purple-50' },
                { label: 'Autres frais', value: `${totalOther.toFixed(0)} €`, icon: 'EllipsisHorizontalCircleIcon', color: 'text-gray-600 bg-gray-100' },
                { label: 'Payé', value: `${totalPaid.toFixed(0)} €`, icon: 'CheckCircleIcon', color: 'text-emerald-600 bg-emerald-50' },
                { label: 'Non payé', value: `${totalUnpaid.toFixed(0)} €`, icon: 'ClockIcon', color: 'text-red-600 bg-red-50' },
              ].map((k) => (
                <div key={k.label} className="bg-white border border-border rounded-xl p-3 shadow-card">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${k.color}`}>
                    <Icon name={k.icon as any} size={15} />
                  </div>
                  <p className="text-sm font-700 text-foreground">{k.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{k.label}</p>
                </div>
              ))}
            </div>

            {/* Cost breakdown */}
            {totalSpent > 0 && (
              <div className="bg-white border border-border rounded-xl p-5 shadow-card">
                <h3 className="font-600 text-foreground mb-3">Répartition des coûts</h3>
                <div className="flex rounded-full overflow-hidden h-4 mb-3">
                  {[
                    { value: totalProducts, color: 'bg-blue-500' },
                    { value: totalTransport, color: 'bg-cyan-500' },
                    { value: totalCustoms, color: 'bg-amber-500' },
                    { value: totalVat, color: 'bg-purple-500' },
                    { value: totalOther, color: 'bg-gray-400' },
                  ].filter((s) => s.value > 0).map((seg, i) => (
                    <div key={i} className={`${seg.color} transition-all`} style={{ width: `${(seg.value / totalSpent) * 100}%` }} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-4 text-xs">
                  {[
                    { value: totalProducts, color: 'bg-blue-500', label: 'Produits' },
                    { value: totalTransport, color: 'bg-cyan-500', label: 'Transport' },
                    { value: totalCustoms, color: 'bg-amber-500', label: 'Douane' },
                    { value: totalVat, color: 'bg-purple-500', label: 'TVA' },
                    { value: totalOther, color: 'bg-gray-400', label: 'Autres' },
                  ].map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${seg.color}`} />
                      <span className="text-muted-foreground">{seg.label}: <strong className="text-foreground">{totalSpent > 0 ? ((seg.value / totalSpent) * 100).toFixed(1) : 0}%</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-supplier table */}
            {loadingOrders ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : supplierList.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <Icon name="ChartBarIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-500 text-foreground">Aucune dépense fournisseur enregistrée</p>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="font-600 text-foreground">Détail par fournisseur</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Fournisseur</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Commandes</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Total dépensé</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Produits</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Transport</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Douane</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">TVA</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Cmd moy.</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">% total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {supplierList.map((e: any) => (
                        <tr key={e.supplierId} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-primary font-700 text-xs">{e.supplierName.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="font-500 text-foreground">{e.supplierName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-500">{e.orderCount}</td>
                          <td className="px-4 py-3 text-right font-700 text-foreground">{e.totalSpent.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{e.totalProducts.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{e.totalTransport.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{e.totalCustoms.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{e.totalVat.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{e.avgOrder.toFixed(2)} €</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-muted rounded-full h-1.5">
                                <div className="bg-primary rounded-full h-1.5" style={{ width: `${totalSpent > 0 ? (e.totalSpent / totalSpent) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs font-500 text-foreground w-10 text-right">
                                {totalSpent > 0 ? ((e.totalSpent / totalSpent) * 100).toFixed(1) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td className="px-4 py-3 font-700 text-foreground">Total</td>
                        <td className="px-4 py-3 text-right font-700">{filteredOrders.length}</td>
                        <td className="px-4 py-3 text-right font-700 text-primary">{totalSpent.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-700">{totalProducts.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-700">{totalTransport.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-700">{totalCustoms.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-700">{totalVat.toFixed(2)} €</td>
                        <td className="px-4 py-3 text-right font-700">—</td>
                        <td className="px-4 py-3 text-right font-700">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BUSINESS EXPENSES TAB ── */}
        {activeTab === 'business' && (
          <div className="space-y-6">
            {/* Structure fee calculator */}
            <StructureFeePanel expenses={expenses} />

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total dépenses', value: totalAll, color: 'text-foreground bg-muted/40', icon: 'BanknotesIcon' },
                { label: 'Fixes mensuelles', value: totalByCategory.fixed_monthly, color: 'text-purple-700 bg-purple-50', icon: 'CalendarDaysIcon' },
                { label: 'Variables', value: totalByCategory.variable, color: 'text-amber-700 bg-amber-50', icon: 'ArrowTrendingUpIcon' },
                { label: 'Quotidiennes', value: totalByCategory.daily, color: 'text-blue-700 bg-blue-50', icon: 'SunIcon' },
              ].map((k) => (
                <div key={k.label} className={`rounded-xl p-4 border border-border ${k.color}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <Icon name={k.icon as any} size={15} />
                    <p className="text-xs font-medium">{k.label}</p>
                  </div>
                  <p className="text-xl font-700">{k.value.toFixed(2)} €</p>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <input
                type="month"
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                {([['all', 'Toutes'], ['daily', 'Quotidiennes'], ['fixed_monthly', 'Fixes'], ['variable', 'Variables']] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => setFilterCategory(val as any)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      filterCategory === val ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Expenses list */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="bg-white border border-border rounded-xl p-12 text-center">
                <Icon name="BanknotesIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
                <p className="font-500 text-foreground mb-2">Aucune dépense enregistrée</p>
                <button
                  onClick={() => { setEditExpense(null); setShowForm(true); }}
                  className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Ajouter une dépense
                </button>
              </div>
            ) : (
              <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Date</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Catégorie</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Libellé</th>
                        <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Paiement</th>
                        <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Montant</th>
                        <th className="text-center px-4 py-3 font-600 text-muted-foreground text-xs uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredExpenses.map((e) => {
                        const catCfg = CATEGORY_CONFIG[e.category as ExpenseCategory] ?? { label: e.category, color: 'text-gray-600', bg: 'bg-gray-50', icon: 'TagIcon' };
                        return (
                          <tr key={e.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {new Date(e.expense_date).toLocaleDateString('fr-FR')}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${catCfg.bg} ${catCfg.color}`}>
                                <Icon name={catCfg.icon as any} size={10} />
                                {catCfg.label}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <p className="font-500 text-foreground">{e.label}</p>
                                {e.note && <p className="text-xs text-muted-foreground">{e.note}</p>}
                                {e.is_recurring && (
                                  <span className="text-xs text-purple-600 flex items-center gap-1">
                                    <Icon name="ArrowPathIcon" size={10} />
                                    Récurrent (jour {e.recurrence_day})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs capitalize">
                              {PAYMENT_METHODS.find((m) => m.value === e.payment_method)?.label ?? e.payment_method}
                            </td>
                            <td className="px-4 py-3 text-right font-700 text-foreground">{e.amount.toFixed(2)} €</td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => { setEditExpense(e); setShowForm(true); }}
                                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <Icon name="PencilIcon" size={14} />
                                </button>
                                <button
                                  onClick={() => handleDeleteExpense(e.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                >
                                  <Icon name="TrashIcon" size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={4} className="px-4 py-3 font-700 text-foreground">Total ({filteredExpenses.length} dépenses)</td>
                        <td className="px-4 py-3 text-right font-700 text-primary">{totalAll.toFixed(2)} €</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expense form modal */}
      {showForm && (
        <ExpenseFormModal
          expense={editExpense}
          onClose={() => { setShowForm(false); setEditExpense(null); }}
          onSave={handleSaveExpense}
        />
      )}

      {/* CSV Import modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-lg font-700 text-foreground">Importer des dépenses</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {csvRows.filter((r) => r.valid).length} ligne(s) à importer ·{' '}
                  {csvRows.filter((r) => !r.valid).length} ignorée(s)
                </p>
              </div>
              <button onClick={() => setShowImport(false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-6">
              {importResult ? (
                <div className={`rounded-xl p-4 text-sm font-medium ${importResult.startsWith('✅') ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                  {importResult}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Statut</th>
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Date</th>
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Catégorie</th>
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Libellé</th>
                        <th className="text-right px-3 py-2 font-600 text-muted-foreground">Montant</th>
                        <th className="text-left px-3 py-2 font-600 text-muted-foreground">Paiement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.map((row, i) => (
                        <tr key={i} className={`border-b border-border/50 ${row.valid ? '' : 'opacity-40'}`}>
                          <td className="px-3 py-2">
                            {row.valid
                              ? <span className="text-emerald-600 font-600">✓</span>
                              : <span className="text-muted-foreground text-[10px]">{row.skipReason}</span>}
                          </td>
                          <td className="px-3 py-2 text-foreground">{row.date}</td>
                          <td className="px-3 py-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-600 ${
                              row.category === 'fixed_monthly' ? 'bg-purple-100 text-purple-700' :
                              row.category === 'daily' ? 'bg-blue-100 text-blue-700' :
                              row.category === 'variable' ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'
                            }`}>
                              {row.categorie}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{row.type}</td>
                          <td className="px-3 py-2 text-foreground max-w-[200px] truncate">{row.libelle}</td>
                          <td className="px-3 py-2 text-right font-600 text-foreground">{row.montant.toFixed(2)} €</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.modePaiement}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {!importResult && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button onClick={() => setShowImport(false)} className="px-4 py-2 border border-border rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                  Annuler
                </button>
                <button
                  onClick={handleImportConfirm}
                  disabled={importing || csvRows.filter((r) => r.valid).length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Icon name="ArrowUpTrayIcon" size={15} />
                  {importing ? 'Import en cours...' : `Importer ${csvRows.filter((r) => r.valid).length} dépense(s)`}
                </button>
              </div>
            )}
            {importResult && (
              <div className="px-6 py-4 border-t border-border">
                <button onClick={() => setShowImport(false)} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
                  Fermer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
