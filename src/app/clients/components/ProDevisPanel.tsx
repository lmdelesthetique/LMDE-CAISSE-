'use client';

import React, { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { type Client } from '@/lib/services/clientService';
import { normalizePhone } from '@/lib/utils/phoneUtils';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ReassortItem {
  id: string;
  name: string;
  ref?: string;
  imageUrl?: string | null;
  sellPrice: number;
  qty: number;
  isCustom: boolean;
}

interface SearchProduct {
  id: string;
  name: string;
  ref: string;
  imageUrl: string | null;
  sellPrice: number;
  stock: number;
}

// ── Budget PRO tiers ───────────────────────────────────────────────────────────

const BUDGET_PRO_TIERS = [
  { min: 150,  bonus: 15  },
  { min: 200,  bonus: 25  },
  { min: 300,  bonus: 40  },
  { min: 400,  bonus: 55  },
  { min: 500,  bonus: 70  },
  { min: 600,  bonus: 85  },
  { min: 750,  bonus: 110 },
  { min: 1000, bonus: 150 },
  { min: 1250, bonus: 190 },
  { min: 1500, bonus: 225 },
  { min: 2000, bonus: 290 },
  { min: 2500, bonus: 350 },
] as const;

function getTier(total: number) {
  let result: (typeof BUDGET_PRO_TIERS)[number] | null = null;
  for (const t of BUDGET_PRO_TIERS) {
    if (total >= t.min) result = t;
  }
  return result;
}

function getNextTier(total: number) {
  for (const t of BUDGET_PRO_TIERS) {
    if (total < t.min) return t;
  }
  return null;
}

// ── PDF generation (dynamic import to avoid SSR) ───────────────────────────────

async function generateDevisPdf(client: Client, items: ReassortItem[], discountPct: number) {
  const jsPDFModule = await import('jspdf');
  const jsPDF = jsPDFModule.default || (jsPDFModule as any).jsPDF;
  const autoTableModule = await import('jspdf-autotable');
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;

  const INDIGO  = [79, 70, 229]   as [number, number, number];
  const PURPLE  = [109, 40, 217]  as [number, number, number];
  const WHITE   = [255, 255, 255] as [number, number, number];
  const GREEN   = [22, 163, 74]   as [number, number, number];
  const MUTED   = [107, 114, 128] as [number, number, number];
  const LIGHT   = [238, 242, 255] as [number, number, number];

  // Header
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageW, 36, 'F');

  // Try to embed logo
  try {
    const img = new Image();
    img.src = '/assets/images/app_logo.png';
    await new Promise<void>((resolve) => {
      img.onload = () => {
        try { doc.addImage(img, 'PNG', margin, 8, 16, 16); } catch (_) {}
        resolve();
      };
      img.onerror = () => resolve();
      setTimeout(resolve, 800);
    });
  } catch (_) {}

  doc.setTextColor(...WHITE);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('MY BEAUTY POS — Devis Réassort PRO', margin + 20, 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Cliente : ${client.fullName}`, margin + 20, 23);
  doc.text(`Date : ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, margin + 20, 29);

  // Calculations
  const subtotal = items.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tier = getTier(afterDiscount);
  const credit = tier?.bonus ?? 0;
  const clientPays = Math.max(0, afterDiscount - credit);

  // Products table
  const rows = items.map((item) => [
    item.name + (item.ref ? `\n${item.ref}` : '') + (item.isCustom ? '\n(à sourcer)' : ''),
    String(item.qty),
    `${item.sellPrice.toFixed(2)} €`,
    `${(item.sellPrice * item.qty).toFixed(2)} €`,
  ]);

  autoTable(doc, {
    startY: 44,
    head: [['Produit', 'Qté', 'Prix unit.', 'Total']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: INDIGO, textColor: WHITE, fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableBottom = (doc as any).lastAutoTable.finalY + 6;

  // Summary
  const summaryRows: [string, string][] = [['Sous-total produits', `${subtotal.toFixed(2)} €`]];
  if (discountPct > 0) {
    summaryRows.push([`Offre commerciale (-${discountPct}%)`, `-${discountAmount.toFixed(2)} €`]);
    summaryRows.push(['Total après offre', `${afterDiscount.toFixed(2)} €`]);
  }
  if (credit > 0) {
    summaryRows.push([`\u{1F381} CRÉDIT BUDGET PRO (palier ${tier!.min} €)`, `-${credit.toFixed(2)} €`]);
  }
  summaryRows.push(['TOTAL — VOUS PAYEZ', `${clientPays.toFixed(2)} €`]);

  autoTable(doc, {
    startY: tableBottom,
    body: summaryRows,
    theme: 'plain',
    bodyStyles: { fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 130 },
      1: { cellWidth: 40, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data: any) => {
      const isTotal = data.row.index === summaryRows.length - 1;
      const isCredit = credit > 0 && data.row.index === summaryRows.length - 2;
      if (isTotal) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 13;
        data.cell.styles.fillColor = LIGHT;
      }
      if (isCredit) {
        data.cell.styles.textColor = GREEN;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const rulesY = (doc as any).lastAutoTable.finalY + 8;

  // Budget PRO mini-table
  if (credit > 0) {
    doc.setFillColor(...LIGHT);
    doc.roundedRect(margin, rulesY, pageW - margin * 2, 22, 3, 3, 'F');
    doc.setTextColor(...INDIGO);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CRÉDIT BUDGET PRO — Règles d\'utilisation', margin + 4, rulesY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      'Ce crédit est valable uniquement sur ce devis. Non cumulable · Non reportable · Non convertible en espèces.',
      margin + 4, rulesY + 12, { maxWidth: pageW - margin * 2 - 8 }
    );
    doc.text(
      `Le montant de votre commande (${afterDiscount.toFixed(2)} €) vous ouvre droit à un crédit de ${credit.toFixed(0)} € à utiliser entièrement sur ce devis.`,
      margin + 4, rulesY + 18, { maxWidth: pageW - margin * 2 - 8 }
    );
  }

  // Footer
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...MUTED);
  doc.text('MY BEAUTY POS SXM — Devis valable 30 jours à compter de la date d\'émission.', margin, pageH - 8);

  const filename = `devis-pro-${client.lastName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ProDevisPanel({ client }: { client: Client }) {
  const [items, setItems] = useState<ReassortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Custom product
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  // Discount
  const [discountPct, setDiscountPct] = useState(0);
  const [customDiscountInput, setCustomDiscountInput] = useState('');
  const [showCustomDiscount, setShowCustomDiscount] = useState(false);

  // Modals
  const [showDecouverteModal, setShowDecouverteModal] = useState(false);
  const [showBudgetTable, setShowBudgetTable] = useState(false);

  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Load saved reassort list
  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${client.id}/pro-profile`)
      .then((r) => r.json())
      .then(({ profile }) => {
        if (profile?.produits_reassort && Array.isArray(profile.produits_reassort)) {
          setItems(profile.produits_reassort);
        }
      })
      .finally(() => setLoading(false));
  }, [client.id]);

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); setShowResults(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products/search?q=${encodeURIComponent(searchQuery)}&limit=12`);
        const data = await res.json();
        const products: SearchProduct[] = (data.products ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          ref: p.ref ?? '',
          imageUrl: p.image_url ?? null,
          sellPrice: Number(p.sell_price_ttc) || 0,
          stock: Number(p.stock) || 0,
        }));
        setSearchResults(products);
        setShowResults(true);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const addProduct = (p: SearchProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === p.id);
      if (existing) return prev.map((i) => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, ref: p.ref, imageUrl: p.imageUrl, sellPrice: p.sellPrice, qty: 1, isCustom: false }];
    });
    setSearchQuery('');
    setShowResults(false);
  };

  const addCustomProduct = () => {
    if (!customName.trim() || !customPrice) return;
    const price = parseFloat(customPrice.replace(',', '.'));
    if (isNaN(price) || price <= 0) return;
    setItems((prev) => [...prev, { id: `custom-${Date.now()}`, name: customName.trim(), imageUrl: null, sellPrice: price, qty: 1, isCustom: true }]);
    setCustomName(''); setCustomPrice(''); setShowCustomForm(false);
  };

  const updateQty = (id: string, delta: number) =>
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, qty: Math.max(1, i.qty + delta) } : i));

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));

  const saveReassort = async () => {
    setSaving(true);
    try {
      await fetch(`/api/clients/${client.id}/pro-profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ produits_reassort: items }),
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  // ── Calculations ──────────────────────────────────────────────────────────────
  const subtotal = items.reduce((s, i) => s + i.sellPrice * i.qty, 0);
  const discountAmount = subtotal * (discountPct / 100);
  const afterDiscount = subtotal - discountAmount;
  const tier = getTier(afterDiscount);
  const nextTier = getNextTier(afterDiscount);
  const credit = tier?.bonus ?? 0;
  const clientPays = Math.max(0, afterDiscount - credit);

  const handleWhatsApp = () => {
    const phone = normalizePhone(client.whatsapp || client.phone || '');
    if (!phone) {
      import('sonner').then(({ toast }) => toast.error('Numéro WhatsApp manquant — vérifier la fiche cliente'));
      return;
    }
    const lines = items.map((i) => `• ${i.name}${i.ref ? ` (${i.ref})` : ''} × ${i.qty} — ${(i.sellPrice * i.qty).toFixed(2)} €`).join('\n');
    const creditLine = credit > 0 ? `\n🎁 *Crédit Budget Pro* : -${credit.toFixed(2)} €` : '';
    const discLine = discountPct > 0 ? `\nOffre commerciale : -${discountPct}% (-${discountAmount.toFixed(2)} €)` : '';
    const msg = `Coucou ${client.firstName} 🌸 je prépare ton réassort du mois.\n\nVoici les produits :\n${lines}\n\nSous-total : ${subtotal.toFixed(2)} €${discLine}${creditLine}\n*Tu paies : ${clientPays.toFixed(2)} €*\n\n${credit > 0 ? '⚠️ _Crédit Budget Pro valable uniquement sur ce devis — non cumulable, non reportable._\n\n' : ''}Tu veux repartir sur la même chose ou modifier quelque chose ? 😊`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handlePdf = async () => {
    setGeneratingPdf(true);
    try {
      await generateDevisPdf(client, items, discountPct);
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Icon name="ArrowPathIcon" size={22} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── PRODUCT SEARCH ──────────────────────────────────────────────────────── */}
      <div className="border border-indigo-100 rounded-xl p-4 bg-indigo-50/30 space-y-3">
        <h3 className="text-xs font-700 uppercase tracking-wide text-indigo-600 flex items-center gap-1.5">
          <Icon name="MagnifyingGlassIcon" size={13} />
          Ajouter des produits au réassort
        </h3>

        <div className="relative" ref={searchRef}>
          <div className="flex items-center gap-2 px-3 py-2.5 border border-border rounded-lg bg-white focus-within:ring-2 focus-within:ring-indigo-300">
            <Icon name="MagnifyingGlassIcon" size={14} className="text-muted-foreground shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchResults.length > 0 && setShowResults(true)}
              placeholder="Rechercher par nom ou référence…"
              className="flex-1 text-sm outline-none bg-transparent"
            />
            {searching && <Icon name="ArrowPathIcon" size={14} className="animate-spin text-muted-foreground shrink-0" />}
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-xl shadow-xl max-h-64 overflow-y-auto">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => addProduct(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left border-b border-border/40 last:border-0"
                >
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon name="PhotoIcon" size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {p.ref} · {p.sellPrice.toFixed(2)} €
                      {p.stock <= 0 ? ' · ⚠️ Rupture' : p.stock <= 5 ? ` · Stock faible (${p.stock})` : ''}
                    </p>
                  </div>
                  <Icon name="PlusCircleIcon" size={20} className="text-indigo-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {showResults && searchQuery.length >= 2 && !searching && searchResults.length === 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-border rounded-xl shadow-xl px-4 py-4 text-center">
              <p className="text-sm text-muted-foreground">Aucun produit trouvé</p>
            </div>
          )}
        </div>

        {/* Custom product */}
        {!showCustomForm ? (
          <button
            onClick={() => setShowCustomForm(true)}
            className="flex items-center gap-1.5 text-xs font-600 text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Icon name="PlusIcon" size={13} />
            Ajouter un produit hors-stock / à sourcer fournisseur
          </button>
        ) : (
          <div className="border border-indigo-200 rounded-xl p-3 bg-white space-y-2">
            <p className="text-xs font-700 text-indigo-700">Produit hors-stock (à sourcer)</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nom du produit"
                className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              <div className="relative">
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-28 px-2.5 py-2 pr-7 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={addCustomProduct} disabled={!customName.trim() || !customPrice}
                className="flex-1 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-700 hover:bg-indigo-700 transition-colors disabled:opacity-40">
                Ajouter
              </button>
              <button onClick={() => { setShowCustomForm(false); setCustomName(''); setCustomPrice(''); }}
                className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors">
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── REASSORT LIST ─────────────────────────────────────────────────────────── */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-indigo-100 rounded-xl">
          <Icon name="ShoppingBagIcon" size={32} className="text-indigo-200 mb-2" />
          <p className="text-sm text-muted-foreground font-500">Liste de réassort vide</p>
          <p className="text-xs text-muted-foreground mt-1">Utilisez la recherche ci-dessus pour ajouter des produits</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-700 uppercase tracking-wide text-muted-foreground flex items-center justify-between">
            <span>{items.length} produit{items.length > 1 ? 's' : ''}</span>
            <span className="font-800 text-foreground text-sm">{subtotal.toFixed(2)} €</span>
          </p>
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 bg-white border border-border rounded-xl p-3 hover:border-indigo-200 transition-colors">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0 border border-border" />
              ) : (
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${item.isCustom ? 'bg-amber-50 border border-amber-200' : 'bg-muted'}`}>
                  <Icon name={item.isCustom ? 'MagnifyingGlassIcon' : 'PhotoIcon'} size={20} className={item.isCustom ? 'text-amber-400' : 'text-muted-foreground'} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-foreground truncate">{item.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {item.ref && `${item.ref} · `}
                  {item.sellPrice.toFixed(2)} € / unité
                  {item.isCustom && <span className="ml-1 text-amber-600 font-600">· à sourcer</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => updateQty(item.id, -1)}
                  className="w-7 h-7 rounded-full border border-border flex items-center justify-center hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                  <Icon name="MinusIcon" size={11} />
                </button>
                <span className="w-7 text-center text-sm font-800 tabular-nums">{item.qty}</span>
                <button onClick={() => updateQty(item.id, 1)}
                  className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center hover:bg-indigo-700 transition-colors text-white">
                  <Icon name="PlusIcon" size={11} />
                </button>
              </div>
              <span className="text-sm font-700 tabular-nums w-18 text-right shrink-0">{(item.sellPrice * item.qty).toFixed(2)} €</span>
              <button onClick={() => removeItem(item.id)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors shrink-0">
                <Icon name="TrashIcon" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── DEVIS SUMMARY ─────────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <>
          {/* Commercial offer */}
          <div className="border border-amber-100 rounded-xl p-4 bg-amber-50/30 space-y-3">
            <h3 className="text-xs font-700 uppercase tracking-wide text-amber-700 flex items-center gap-1.5">
              <Icon name="TagIcon" size={13} />
              Offre commerciale
            </h3>
            <div className="flex flex-wrap gap-2">
              {[0, 5, 10, 15].map((pct) => (
                <button key={pct}
                  onClick={() => { setDiscountPct(pct); setShowCustomDiscount(false); setCustomDiscountInput(''); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-700 border transition-colors ${
                    discountPct === pct && !showCustomDiscount
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'border-border text-muted-foreground hover:border-amber-300 hover:text-amber-600'
                  }`}
                >
                  {pct === 0 ? 'Aucune' : `-${pct}%`}
                </button>
              ))}
              <button
                onClick={() => setShowCustomDiscount(!showCustomDiscount)}
                className={`px-3 py-1.5 rounded-lg text-xs font-700 border transition-colors ${
                  showCustomDiscount ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:border-amber-300'
                }`}
              >
                Autre %
              </button>
            </div>
            {showCustomDiscount && (
              <div className="flex items-center gap-2">
                <input
                  type="number" value={customDiscountInput}
                  onChange={(e) => setCustomDiscountInput(e.target.value)}
                  placeholder="Ex: 7" min="0" max="100"
                  className="w-24 px-2.5 py-1.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <button
                  onClick={() => { const v = parseFloat(customDiscountInput); if (!isNaN(v) && v >= 0 && v <= 100) setDiscountPct(v); }}
                  className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-700 hover:bg-amber-600"
                >
                  Appliquer
                </button>
              </div>
            )}
            {discountPct > 0 && (
              <p className="text-xs text-amber-600 font-600">
                Offre appliquée : -{discountPct}% = -{discountAmount.toFixed(2)} €
              </p>
            )}
          </div>

          {/* Budget PRO credit block */}
          <div className="rounded-xl overflow-hidden border border-indigo-200">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-700 uppercase tracking-widest opacity-75">Crédit Budget Pro</p>
                  {tier ? (
                    <>
                      <p className="text-4xl font-800 mt-1">+{credit} €</p>
                      <p className="text-xs opacity-75 mt-1">palier {tier.min} € atteint ✓</p>
                    </>
                  ) : (
                    <>
                      <p className="text-xl font-700 mt-1 opacity-60">Pas encore qualifié</p>
                      {nextTier && (
                        <p className="text-xs opacity-75 mt-1">
                          Encore {(nextTier.min - afterDiscount).toFixed(2)} € pour obtenir +{nextTier.bonus} € de crédit
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="bg-white/15 rounded-xl p-3">
                  <Icon name="GiftIcon" size={28} className="opacity-80" />
                </div>
              </div>
              {tier && nextTier && (
                <div className="mt-3">
                  <div className="flex justify-between text-[10px] opacity-60 mb-1">
                    <span>{tier.min} €</span>
                    <span>Prochain : {nextTier.min} € (+{nextTier.bonus} €)</span>
                  </div>
                  <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{ width: `${Math.min(100, ((afterDiscount - tier.min) / (nextTier.min - tier.min)) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Totals */}
            <div className="bg-white p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Sous-total produits</span>
                <span className="font-600 tabular-nums">{subtotal.toFixed(2)} €</span>
              </div>
              {discountPct > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-amber-600">Offre commerciale -{discountPct}%</span>
                  <span className="font-600 tabular-nums text-amber-600">-{discountAmount.toFixed(2)} €</span>
                </div>
              )}
              {credit > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-emerald-600 font-700">🎁 Crédit Budget Pro</span>
                  <span className="font-800 tabular-nums text-emerald-600">-{credit.toFixed(2)} €</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between items-center">
                <span className="text-base font-700 text-foreground">Vous payez</span>
                <span className="text-2xl font-800 tabular-nums text-indigo-700">{clientPays.toFixed(2)} €</span>
              </div>
              {credit > 0 && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Valeur totale des produits</span>
                  <span className="tabular-nums">{afterDiscount.toFixed(2)} €</span>
                </div>
              )}
            </div>

            {/* Rules */}
            {credit > 0 && (
              <div className="bg-indigo-50 border-t border-indigo-100 px-4 py-2.5">
                <p className="text-[10px] text-indigo-500 leading-relaxed">
                  ⚠️ Crédit valable uniquement sur ce devis · Non cumulable · Non reportable · Non convertible en espèces · À utiliser entièrement sur ce devis
                </p>
              </div>
            )}
          </div>

          {/* Budget PRO full table */}
          <button
            onClick={() => setShowBudgetTable(!showBudgetTable)}
            className="w-full flex items-center justify-between text-xs font-600 text-indigo-600 hover:text-indigo-800 transition-colors py-1"
          >
            <span>Voir tous les paliers Budget Pro</span>
            <Icon name={showBudgetTable ? 'ChevronUpIcon' : 'ChevronDownIcon'} size={14} />
          </button>

          {showBudgetTable && (
            <div className="border border-indigo-100 rounded-xl overflow-hidden">
              <div className="bg-indigo-600 px-3 py-2 grid grid-cols-4 text-[10px] font-700 text-white uppercase tracking-wide">
                <span>Commande</span>
                <span className="text-right">Crédit</span>
                <span className="text-right">Total produits</span>
                <span className="text-right">%</span>
              </div>
              {BUDGET_PRO_TIERS.map((t, i) => {
                const isCurrent = tier?.min === t.min;
                const isNext = nextTier?.min === t.min && !isCurrent;
                return (
                  <div
                    key={t.min}
                    className={`px-3 py-2 grid grid-cols-4 text-xs border-b border-indigo-50 last:border-0 ${
                      isCurrent ? 'bg-emerald-50 font-700' : isNext ? 'bg-indigo-50/50' : i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                    }`}
                  >
                    <span className={isCurrent ? 'text-emerald-700' : isNext ? 'text-indigo-600 font-600' : 'text-foreground'}>
                      {t.min} €{isCurrent ? ' ✓' : ''}
                    </span>
                    <span className={`text-right ${isCurrent ? 'text-emerald-700' : 'text-indigo-600'}`}>+{t.bonus} €</span>
                    <span className={`text-right tabular-nums ${isCurrent ? 'text-emerald-700' : 'text-foreground'}`}>{t.min + t.bonus} €</span>
                    <span className={`text-right ${isCurrent ? 'text-emerald-700' : 'text-muted-foreground'}`}>
                      {((t.bonus / t.min) * 100).toFixed(1)}%
                    </span>
                  </div>
                );
              })}
              <div className="bg-indigo-50 px-3 py-2">
                <p className="text-[10px] text-indigo-500">Crédit valable uniquement sur le devis concerné · Non cumulable · Non reportable · Non convertible</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── ACTIONS ───────────────────────────────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <button onClick={saveReassort} disabled={saving}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-700 hover:bg-indigo-700 transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
          {saving
            ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</>
            : savedOk
            ? <><Icon name="CheckIcon" size={14} />Liste enregistrée !</>
            : <><Icon name="BookmarkIcon" size={14} />Enregistrer la liste réassort</>}
        </button>

        {items.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleWhatsApp}
              className="flex items-center justify-center gap-2 py-3 bg-green-500 text-white rounded-xl text-sm font-700 hover:bg-green-600 transition-colors">
              <Icon name="ChatBubbleLeftRightIcon" size={16} />
              WhatsApp réassort
            </button>
            <button onClick={handlePdf} disabled={generatingPdf}
              className="flex items-center justify-center gap-2 py-3 bg-rose-600 text-white rounded-xl text-sm font-700 hover:bg-rose-700 transition-colors disabled:opacity-50">
              {generatingPdf
                ? <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                : <Icon name="DocumentArrowDownIcon" size={16} />}
              PDF devis
            </button>
          </div>
        )}

        <button onClick={() => setShowDecouverteModal(true)}
          className="w-full py-2.5 border-2 border-indigo-200 text-indigo-600 rounded-xl text-sm font-700 hover:bg-indigo-50 transition-colors flex items-center justify-center gap-2">
          <Icon name="SparklesIcon" size={15} />
          Présenter le concept LMDE Pro à la cliente
        </button>
      </div>

      {/* ── DÉCOUVERTE MODAL ──────────────────────────────────────────────────────── */}
      {showDecouverteModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowDecouverteModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-t-2xl text-white">
              <div className="flex items-start gap-3">
                <Icon name="SparklesIcon" size={28} className="mt-0.5 opacity-80" />
                <div>
                  <h2 className="text-xl font-800">MY BEAUTY POS — LMDE Pro</h2>
                  <p className="text-sm opacity-75 mt-0.5">Votre partenaire beauté professionnel à Saint-Martin</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-5">

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-800 flex items-center justify-center shrink-0">1</div>
                  <h3 className="text-sm font-700 text-foreground">Votre réassort simplifié, chaque mois</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">
                  Nous gardons en mémoire vos produits habituels. Chaque mois, on vous envoie un message WhatsApp avec votre liste pré-remplie. Vous confirmez, on prépare.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-800 flex items-center justify-center shrink-0">2</div>
                  <h3 className="text-sm font-700 text-foreground">Le Crédit Budget Pro — plus vous commandez, plus vous gagnez</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">
                  Avec LMDE Pro, chaque commande vous donne accès à un crédit supplémentaire en euros. Ce crédit vous permet de repartir avec davantage de produits, sans dépasser votre budget réel.
                </p>
                <div className="pl-11 space-y-1.5">
                  {BUDGET_PRO_TIERS.slice(0, 5).map((t) => (
                    <div key={t.min} className="flex items-center justify-between bg-indigo-50 rounded-lg px-3 py-1.5 text-xs">
                      <span className="text-indigo-700 font-600">Vous commandez {t.min} €</span>
                      <span className="text-emerald-600 font-800">→ +{t.bonus} € de crédit offert</span>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground text-center">Jusqu&apos;à +350 € de crédit à partir de 2 500 €</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 text-sm font-800 flex items-center justify-center shrink-0">3</div>
                  <h3 className="text-sm font-700 text-foreground">Devis instantané, envoi WhatsApp</h3>
                </div>
                <p className="text-sm text-muted-foreground pl-11">
                  Votre devis est prêt en quelques secondes. Vous recevez le détail des produits, le crédit appliqué, et le montant final à payer. En PDF ou directement par WhatsApp.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-xs font-700 text-amber-700 mb-1">Conditions du Crédit Budget Pro</p>
                <ul className="text-xs text-amber-600 space-y-1">
                  <li>• Valable uniquement sur le devis concerné</li>
                  <li>• Non cumulable avec d&apos;autres avantages</li>
                  <li>• Non reportable sur une commande ultérieure</li>
                  <li>• Non convertible en espèces</li>
                  <li>• À utiliser entièrement sur ce devis</li>
                </ul>
              </div>

              <button onClick={() => setShowDecouverteModal(false)}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-700 hover:bg-indigo-700 transition-colors">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
