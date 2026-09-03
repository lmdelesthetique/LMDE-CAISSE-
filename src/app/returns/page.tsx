'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { openAndPrint, loadSettingsFromCache } from '@/lib/utils/ticketPrinter';
import {
  returnsService,
  ReturnRecord,
  ReturnReason,
  ReturnRefundType,
  ProductCondition,
  RETURN_REASON_LABELS,
  RETURN_REFUND_TYPE_LABELS,
  RETURN_STATUS_LABELS,
  PRODUCT_CONDITION_LABELS,
  AVOIR_STATUS_LABELS,
  CreateReturnInput,
} from '@/lib/services/returnsService';
import { fetchStockProducts, StockProduct } from '@/lib/services/stockService';
import { clientService, Client } from '@/lib/services/clientService';

function formatCurrency(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function parseReturnNotes(reasonNotes: string | null): {
  lineItems?: Array<{productName: string; productRef?: string; qty: number; unitPrice: number; discountPct: number; lineTotal: number}>;
  paymentMethod?: string;
  userNotes?: string;
} | null {
  if (!reasonNotes || !reasonNotes.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(reasonNotes);
    if (parsed.__v !== 1) return null;
    return {
      lineItems: parsed.line_items,
      paymentMethod: parsed.payment_method,
      userNotes: parsed.user_notes,
    };
  } catch { return null; }
}

function printAvoirTicket(r: ReturnRecord): void {
  const s = loadSettingsFromCache();
  const now = new Date(r.createdAt);
  const dateStr = formatDate(r.createdAt);
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const conditionLabel: Record<string, string> = { good: 'Bon état', damaged: 'Abîmé', unknown: 'Inconnu' };
  const refundLabel: Record<string, string> = {
    refund_cash: 'Remboursement espèces',
    refund_card: 'Remboursement CB',
    store_credit: 'Avoir client',
    exchange: 'Échange produit',
  };

  const parsed = parseReturnNotes(r.reasonNotes);
  const lineItems = parsed?.lineItems;
  const paymentMethodLabel: Record<string, string> = { cash: 'Espèces', card: 'CB', transfer: 'Virement' };
  const pmLabel = parsed?.paymentMethod ? paymentMethodLabel[parsed.paymentMethod] ?? parsed.paymentMethod : null;
  const userNotes = parsed?.userNotes || (!parsed ? r.reasonNotes : null);

  const w = s.paperWidth ?? '80mm';

  const itemsHtml = lineItems && lineItems.length > 0
    ? lineItems.map(li => `
      <div style="margin:2px 0 2px 4px;">
        <div class="bold">${li.productName}</div>
        ${li.productRef ? `<div style="font-size:10px;">Réf: ${li.productRef}</div>` : ''}
        <div class="row">
          <span>Qté: ${li.qty}</span>
          <span>${li.discountPct > 0 ? `Prix remisé -${li.discountPct}%` : `${li.unitPrice.toFixed(2)} €/u`}</span>
          <span class="bold">${li.lineTotal.toFixed(2)} €</span>
        </div>
      </div>`).join('<div style="border-top:1px dotted #ccc;margin:3px 0;"></div>')
    : `<div style="margin:3px 0 3px 4px;">
        <div>${r.productName}</div>
        ${r.productRef ? `<div style="font-size:10px;">Réf: ${r.productRef}</div>` : ''}
        <div class="row"><span>Quantité :</span><span>${r.quantity}</span></div>
        <div class="row"><span>État :</span><span>${conditionLabel[r.productCondition] ?? r.productCondition}</span></div>
      </div>`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8"/>
  <title>Avoir ${r.avoirNumber}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; width: ${w}; background:#fff; color:#000; padding: 8px; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .line { border-top: 1px dashed #000; margin: 6px 0; }
    .row { display: flex; justify-content: space-between; margin: 2px 0; }
    .title { font-size: 15px; font-weight: bold; text-align: center; margin: 6px 0; }
    .avoir-num { font-size: 14px; font-weight: bold; text-align: center; color: #000; border: 2px solid #000; padding: 4px 8px; margin: 6px auto; display: inline-block; }
    .amount { font-size: 16px; font-weight: bold; text-align: center; margin: 6px 0; }
    .footer { font-size: 10px; text-align: center; margin-top: 6px; }
    @media print {
      body { width: 100%; }
      @page { margin: 0; size: ${w} auto; }
    }
  </style>
</head>
<body>
  <div class="center bold">${s.companyName}</div>
  ${s.companyLine2 ? `<div class="center">${s.companyLine2}</div>` : ''}
  ${s.companyCity ? `<div class="center">${s.companyCity}</div>` : ''}
  ${s.companyPhone ? `<div class="center">Tél: ${s.companyPhone}</div>` : ''}
  ${s.companySiret ? `<div class="center">SIRET: ${s.companySiret}</div>` : ''}

  <div class="line"></div>
  <div class="title">★ AVOIR / BON DE RETOUR ★</div>
  <div class="center"><span class="avoir-num">${r.avoirNumber}</span></div>
  <div class="line"></div>

  <div class="row"><span>Date :</span><span>${dateStr} ${timeStr}</span></div>
  ${r.clientName ? `<div class="row"><span>Client :</span><span class="bold">${r.clientName}</span></div>` : ''}

  <div class="line"></div>
  <div class="bold">Produit(s) retourné(s) :</div>
  ${itemsHtml}

  <div class="line"></div>
  <div class="row"><span>Décision :</span><span class="bold">${r.decision ?? refundLabel[r.refundType] ?? r.refundType}</span></div>
  ${pmLabel ? `<div class="row"><span>Mode de paiement :</span><span class="bold">${pmLabel}</span></div>` : ''}
  ${r.exchangeProductName ? `<div class="row"><span>Échange avec :</span><span>${r.exchangeProductName}</span></div>` : ''}
  ${userNotes ? `<div style="margin-top:3px;font-size:10px;">Note : ${userNotes}</div>` : ''}

  <div class="line"></div>
  <div class="amount">Montant : ${formatCurrency(r.totalAmount)}</div>

  <div class="line"></div>
  <div class="footer">
    ${s.returnConditions ? `<div style="margin-bottom:4px;">${s.returnConditions}</div>` : ''}
    <div>Document émis le ${dateStr}</div>
    <div>Conservez ce document pour tout litige.</div>
    <div style="margin-top:4px;">${s.receiptFooter ?? 'Merci de votre confiance !'}</div>
  </div>

  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  openAndPrint(html);
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  completed: 'bg-green-100 text-green-800',
};

const CONDITION_COLORS: Record<ProductCondition, string> = {
  good: 'bg-emerald-100 text-emerald-800',
  damaged: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-700',
};

const AVOIR_STATUS_COLORS: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-blue-100 text-blue-800',
  used: 'bg-gray-100 text-gray-700',
  expired: 'bg-red-100 text-red-800',
};

const REFUND_ICONS: Record<string, string> = {
  refund_cash: 'BanknotesIcon',
  refund_card: 'CreditCardIcon',
  store_credit: 'GiftIcon',
  exchange: 'ArrowPathIcon',
};

// ─── New Return Modal ────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  product: StockProduct;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

function lineTotal(li: LineItem): number {
  return Math.max(0, li.quantity * li.unitPrice * (1 - li.discountPct / 100));
}

type ReturnType = 'remboursement' | 'avoir' | 'exchange';
type PaymentMethod = 'cash' | 'card' | 'transfer';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'Espèces', icon: 'BanknotesIcon' },
  { id: 'card', label: 'Carte (CB)', icon: 'CreditCardIcon' },
  { id: 'transfer', label: 'Virement', icon: 'BuildingLibraryIcon' },
];

interface NewReturnModalProps {
  onClose: () => void;
  onCreated: (r: ReturnRecord) => void;
}

function NewReturnModal({ onClose, onCreated }: NewReturnModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [allProducts, setAllProducts] = useState<StockProduct[]>([]);
  const [allClients, setAllClients] = useState<Client[]>([]);

  // Step 1 — line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [showProductDrop, setShowProductDrop] = useState(false);

  // Step 2 — decision
  const [returnType, setReturnType] = useState<ReturnType>('remboursement');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isDamaged, setIsDamaged] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [freeClientName, setFreeClientName] = useState('');
  const [originalReceipt, setOriginalReceipt] = useState('');
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [reasonNotes, setReasonNotes] = useState('');

  // Exchange
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [exchangeProduct, setExchangeProduct] = useState<StockProduct | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStockProducts().then(setAllProducts);
    clientService.getAll().then(setAllClients);
  }, []);

  const filteredProducts = allProducts.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.ref.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 8);

  const filteredClients = allClients.filter(c =>
    c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone || '').includes(clientSearch)
  ).slice(0, 6);

  const filteredExchange = allProducts.filter(p =>
    (p.name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
     p.ref.toLowerCase().includes(exchangeSearch.toLowerCase())) &&
    !lineItems.some(li => li.product.id === p.id)
  ).slice(0, 6);

  const totalReturn = lineItems.reduce((s, li) => s + lineTotal(li), 0);

  const addProduct = (p: StockProduct) => {
    const existing = lineItems.find(li => li.product.id === p.id);
    if (existing) {
      setLineItems(prev => prev.map(li => li.product.id === p.id ? { ...li, quantity: li.quantity + 1 } : li));
    } else {
      setLineItems(prev => [...prev, {
        id: `${p.id}-${Date.now()}`,
        product: p,
        quantity: 1,
        unitPrice: p.sellPriceTtc,
        discountPct: 0,
      }]);
    }
    setProductSearch('');
    setShowProductDrop(false);
  };

  const updateLine = (id: string, field: 'quantity' | 'unitPrice' | 'discountPct', value: number) => {
    setLineItems(prev => prev.map(li => li.id === id ? { ...li, [field]: Math.max(0, value) } : li));
  };

  const removeLine = (id: string) => setLineItems(prev => prev.filter(li => li.id !== id));

  const exchangePriceDiff = exchangeProduct ? exchangeProduct.sellPriceTtc - totalReturn : 0;

  const getRefundType = (): ReturnRefundType => {
    if (returnType === 'avoir') return 'store_credit';
    if (returnType === 'exchange') return 'exchange';
    return paymentMethod === 'cash' ? 'refund_cash' : 'refund_card';
  };

  const getDecision = (): string => {
    if (returnType === 'avoir') return 'Avoir client';
    if (returnType === 'exchange') return 'Échange';
    const pm = PAYMENT_METHODS.find(m => m.id === paymentMethod);
    return `Remboursement ${pm?.label ?? ''}`;
  };

  const handleSubmit = async () => {
    if (lineItems.length === 0) { setError('Ajoutez au moins un produit.'); return; }
    if (returnType === 'avoir' && !selectedClient) { setError('Un avoir nécessite un client sélectionné.'); return; }
    setLoading(true);
    setError('');

    const lineItemsPayload = lineItems.map(li => ({
      productId: li.product.id,
      productName: li.product.name,
      productRef: li.product.ref,
      qty: li.quantity,
      unitPrice: li.unitPrice,
      discountPct: li.discountPct,
      lineTotal: lineTotal(li),
    }));

    const firstItem = lineItems[0];
    const input: CreateReturnInput = {
      clientId: selectedClient?.id,
      clientName: freeClientName.trim() || selectedClient?.fullName || undefined,
      productId: firstItem.product.id,
      productName: lineItems.length === 1
        ? firstItem.product.name
        : `${firstItem.product.name} + ${lineItems.length - 1} autre(s)`,
      productRef: firstItem.product.ref,
      quantity: lineItems.reduce((s, li) => s + li.quantity, 0),
      unitPrice: firstItem.unitPrice * (1 - firstItem.discountPct / 100),
      reason,
      reasonNotes: reasonNotes || undefined,
      refundType: getRefundType(),
      paymentMethod: returnType === 'remboursement' ? paymentMethod : undefined,
      productCondition: isDamaged ? 'damaged' : 'good',
      returnToStock: !isDamaged,
      isInternalLoss: false,
      exchangeProductId: exchangeProduct?.id,
      exchangeProductName: exchangeProduct?.name,
      exchangePriceDiff: returnType === 'exchange' ? exchangePriceDiff : 0,
      decision: getDecision(),
      originalReceipt: originalReceipt || undefined,
      lineItems: lineItemsPayload,
    };

    const result = await returnsService.create(input);
    setLoading(false);
    if (result) {
      onCreated(result);
    } else {
      setError('Erreur lors de la création du retour. Veuillez réessayer.');
    }
  };

  const stepLabels = ['Produits retournés', 'Décision & Paiement', 'Confirmation'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="ArrowUturnLeftIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-600 text-foreground">Nouveau retour / Avoir</h2>
              <p className="text-xs text-muted-foreground">Étape {step} / 3</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-3 flex gap-2">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${step > i ? 'bg-primary' : step === i + 1 ? 'bg-primary/60' : 'bg-muted'}`} />
              <p className={`text-[10px] mt-1 font-500 ${step === i + 1 ? 'text-primary' : 'text-muted-foreground'}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* ── STEP 1: PRODUITS ── */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Ajouter un produit *</label>
                <div className="relative">
                  <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Rechercher par nom ou référence..."
                    value={productSearch}
                    onChange={e => { setProductSearch(e.target.value); setShowProductDrop(true); }}
                    onFocus={() => setShowProductDrop(true)}
                    className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {showProductDrop && productSearch && (
                    <div className="absolute top-full left-0 right-0 z-20 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                      {filteredProducts.length === 0
                        ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun produit trouvé</p>
                        : filteredProducts.map(p => (
                          <button key={p.id} onClick={() => addProduct(p)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted text-left">
                            <div className="min-w-0">
                              <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                              <p className="text-xs text-muted-foreground">Réf: {p.ref}</p>
                            </div>
                            <span className="text-sm font-600 text-foreground shrink-0">{formatCurrency(p.sellPriceTtc)}</span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Line items list */}
              {lineItems.length > 0 && (
                <div className="space-y-2">
                  {lineItems.map(li => (
                    <div key={li.id} className="p-3 rounded-xl border border-border bg-muted/20">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-600 text-foreground truncate">{li.product.name}</p>
                          <p className="text-xs text-muted-foreground">Réf: {li.product.ref} · Prix catalogue: {formatCurrency(li.product.sellPriceTtc)}</p>
                        </div>
                        <button onClick={() => removeLine(li.id)} className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 shrink-0">
                          <Icon name="XMarkIcon" size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Quantité</p>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateLine(li.id, 'quantity', li.quantity - 1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-xs">
                              <Icon name="MinusIcon" size={10} />
                            </button>
                            <span className="w-8 text-center text-sm font-600">{li.quantity}</span>
                            <button onClick={() => updateLine(li.id, 'quantity', li.quantity + 1)}
                              className="w-6 h-6 rounded border border-border flex items-center justify-center hover:bg-muted text-xs">
                              <Icon name="PlusIcon" size={10} />
                            </button>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Prix unitaire (€)</p>
                          <input
                            type="number" min={0} step={0.01}
                            value={li.unitPrice}
                            onChange={e => updateLine(li.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">Remise (%)</p>
                          <input
                            type="number" min={0} max={100} step={1}
                            value={li.discountPct}
                            onChange={e => updateLine(li.id, 'discountPct', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-border">
                        <span className="text-xs text-muted-foreground">
                          {li.discountPct > 0 ? `Après remise de ${li.discountPct}%` : 'Total ligne'}
                        </span>
                        <span className="text-sm font-700 text-foreground">{formatCurrency(lineTotal(li))}</span>
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between p-3 rounded-xl bg-primary/5 border border-primary/20">
                    <span className="text-sm font-600 text-foreground">Total à rembourser / avoir</span>
                    <span className="text-lg font-700 text-primary">{formatCurrency(totalReturn)}</span>
                  </div>
                </div>
              )}

              {lineItems.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-center border-2 border-dashed border-border rounded-xl">
                  <Icon name="ArchiveBoxIcon" size={32} className="text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Recherchez et ajoutez les produits retournés</p>
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: DÉCISION ── */}
          {step === 2 && (
            <div className="space-y-4">

              {/* Type principal */}
              <div>
                <p className="text-sm font-600 text-foreground mb-2">Que doit-on donner au client ?</p>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'remboursement' as ReturnType, label: 'Remboursement', icon: 'BanknotesIcon', color: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
                    { id: 'avoir' as ReturnType, label: 'Avoir client', icon: 'GiftIcon', color: 'border-purple-300 bg-purple-50 text-purple-800' },
                    { id: 'exchange' as ReturnType, label: 'Échange', icon: 'ArrowPathIcon', color: 'border-blue-300 bg-blue-50 text-blue-800' },
                  ]).map(rt => (
                    <button key={rt.id} onClick={() => setReturnType(rt.id)}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${returnType === rt.id ? rt.color : 'border-border hover:border-primary/30'}`}>
                      <Icon name={rt.icon as Parameters<typeof Icon>[0]['name']} size={22} className={returnType === rt.id ? '' : 'text-muted-foreground'} />
                      <span className="text-xs font-700 text-center">{rt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment method — only for remboursement */}
              {returnType === 'remboursement' && (
                <div>
                  <p className="text-sm font-600 text-foreground mb-2">Mode de paiement du remboursement</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button key={m.id} onClick={() => setPaymentMethod(m.id)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${paymentMethod === m.id ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 text-muted-foreground'}`}>
                        <Icon name={m.icon as Parameters<typeof Icon>[0]['name']} size={20} />
                        <span className="text-xs font-600">{m.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                    <span className="text-sm text-emerald-700 font-500">Montant à rembourser</span>
                    <span className="text-base font-700 text-emerald-800">{formatCurrency(totalReturn)}</span>
                  </div>
                </div>
              )}

              {/* Avoir amount info */}
              {returnType === 'avoir' && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                  <span className="text-sm text-purple-700 font-500">Avoir crédité sur le compte client</span>
                  <span className="text-base font-700 text-purple-800">{formatCurrency(totalReturn)}</span>
                </div>
              )}

              {/* Exchange product */}
              {returnType === 'exchange' && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                  <p className="text-sm font-600 text-blue-800">Produit de remplacement</p>
                  {exchangeProduct ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-blue-300 bg-white">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-600 text-foreground">{exchangeProduct.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(exchangeProduct.sellPriceTtc)}</p>
                      </div>
                      <button onClick={() => setExchangeProduct(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" placeholder="Rechercher le produit d'échange..." value={exchangeSearch}
                        onChange={e => setExchangeSearch(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                      {exchangeSearch && (
                        <div className="absolute top-full left-0 right-0 z-20 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {filteredExchange.map(p => (
                            <button key={p.id} onClick={() => { setExchangeProduct(p); setExchangeSearch(''); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left">
                              <p className="text-sm font-500 text-foreground">{p.name}</p>
                              <p className="text-xs text-muted-foreground ml-auto">{formatCurrency(p.sellPriceTtc)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {exchangeProduct && (
                    <div className={`p-3 rounded-lg text-sm font-600 ${exchangePriceDiff > 0 ? 'bg-amber-50 text-amber-800' : exchangePriceDiff < 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-700'}`}>
                      {exchangePriceDiff > 0 ? `Supplément à payer par le client : ${formatCurrency(exchangePriceDiff)}` :
                       exchangePriceDiff < 0 ? `Avoir à rendre au client : ${formatCurrency(Math.abs(exchangePriceDiff))}` :
                       'Échange à valeur égale'}
                    </div>
                  )}
                </div>
              )}

              {/* Damaged checkbox */}
              <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isDamaged ? 'border-red-300 bg-red-50' : 'border-border hover:border-red-200'}`}>
                <input type="checkbox" checked={isDamaged} onChange={e => setIsDamaged(e.target.checked)}
                  className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500" />
                <div>
                  <p className="text-sm font-600 text-foreground">Produit abîmé / ne retourne pas en stock</p>
                  <p className="text-xs text-muted-foreground">Le produit ne sera pas réintégré au stock vendable</p>
                </div>
              </label>

              {/* Client */}
              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">
                  Client {returnType === 'avoir' ? '*' : '(optionnel)'}
                </label>
                {selectedClient ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-600 text-primary">{selectedClient.firstName[0]}{selectedClient.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground">{selectedClient.fullName}</p>
                      <p className="text-xs text-muted-foreground">{selectedClient.phone || selectedClient.email || ''}</p>
                    </div>
                    <button onClick={() => { setSelectedClient(null); setFreeClientName(''); }}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="relative">
                      <Icon name="UserIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input type="text" placeholder="Rechercher un client..." value={clientSearch}
                        onChange={e => setClientSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                      {clientSearch && (
                        <div className="absolute top-full left-0 right-0 z-10 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {filteredClients.length === 0
                            ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun client trouvé</p>
                            : filteredClients.map(c => (
                              <button key={c.id} onClick={() => { setSelectedClient(c); setFreeClientName(c.fullName); setClientSearch(''); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left">
                                <p className="text-sm font-500 text-foreground">{c.fullName}</p>
                                <p className="text-xs text-muted-foreground ml-auto">{c.phone || ''}</p>
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <input type="text" placeholder="Nom du client (saisie libre)" value={freeClientName}
                      onChange={e => setFreeClientName(e.target.value)}
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                )}
              </div>

              {/* Ticket original + motif */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">N° ticket original</label>
                  <input type="text" placeholder="TK-2024-0042" value={originalReceipt}
                    onChange={e => setOriginalReceipt(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/30" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Motif</label>
                  <select value={reason} onChange={e => setReason(e.target.value as ReturnReason)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/30 bg-white">
                    {(Object.entries(RETURN_REASON_LABELS) as [ReturnReason, string][]).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Notes (optionnel)</label>
                <textarea rows={2} placeholder="Informations complémentaires..." value={reasonNotes}
                  onChange={e => setReasonNotes(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none" />
              </div>
            </div>
          )}

          {/* ── STEP 3: CONFIRMATION ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Decision badge */}
              <div className={`p-4 rounded-xl border-2 ${
                returnType === 'avoir' ? 'border-purple-300 bg-purple-50 text-purple-800' :
                returnType === 'exchange' ? 'border-blue-300 bg-blue-50 text-blue-800' :
                'border-emerald-300 bg-emerald-50 text-emerald-800'
              }`}>
                <p className="text-sm font-700">{getDecision()}</p>
                {returnType === 'avoir' && selectedClient && (
                  <p className="text-xs opacity-80 mt-0.5">Crédit sur le compte de {selectedClient.fullName}</p>
                )}
              </div>

              {/* Items recap */}
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b border-border">
                  <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground">Articles retournés</p>
                </div>
                <div className="divide-y divide-border">
                  {lineItems.map(li => (
                    <div key={li.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground truncate">{li.product.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {li.quantity} × {formatCurrency(li.unitPrice)}
                          {li.discountPct > 0 && <span className="ml-1 text-amber-600">−{li.discountPct}%</span>}
                        </p>
                      </div>
                      <span className="text-sm font-700 text-foreground">{formatCurrency(lineTotal(li))}</span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-3 bg-muted/20 flex justify-between border-t border-border">
                  <span className="text-sm font-600 text-foreground">Total</span>
                  <span className="text-base font-700 text-foreground">{formatCurrency(totalReturn)}</span>
                </div>
              </div>

              {/* Details */}
              <div className="p-4 rounded-xl bg-muted/40 space-y-2">
                {[
                  selectedClient ? { label: 'Client', value: selectedClient.fullName } :
                  freeClientName ? { label: 'Client', value: freeClientName } : null,
                  { label: 'Motif', value: RETURN_REASON_LABELS[reason] },
                  { label: 'État produit', value: isDamaged ? '❌ Abîmé — ne retourne pas en stock' : '✅ Bon état — retour en stock' },
                  originalReceipt ? { label: 'Ticket original', value: originalReceipt } : null,
                ].filter(Boolean).map((item: any, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-500 text-foreground">{item.value}</span>
                  </div>
                ))}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
                  <Icon name="ExclamationCircleIcon" size={16} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : onClose()}
            className="px-4 py-2.5 text-sm font-500 text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors">
            {step === 1 ? 'Annuler' : 'Retour'}
          </button>
          {step < 3 ? (
            <button onClick={() => {
              if (step === 1 && lineItems.length === 0) { setError('Ajoutez au moins un produit.'); return; }
              if (step === 2 && returnType === 'avoir' && !selectedClient) { setError('Un avoir nécessite un client sélectionné.'); return; }
              setError('');
              setStep((step + 1) as 2 | 3);
            }} className="px-5 py-2.5 text-sm font-600 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors">
              Suivant
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="px-5 py-2.5 text-sm font-600 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2">
              {loading && <Icon name="ArrowPathIcon" size={14} className="animate-spin" />}
              Créer le retour
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Process Return Modal ────────────────────────────────────────────────────

interface ProcessReturnModalProps {
  returnRecord: ReturnRecord;
  onClose: () => void;
  onProcessed: () => void;
}

function ProcessReturnModal({ returnRecord, onClose, onProcessed }: ProcessReturnModalProps) {
  const [product, setProduct] = useState<StockProduct | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (returnRecord.productId) {
      fetchStockProducts().then(products => {
        const p = products.find(x => x.id === returnRecord.productId);
        setProduct(p || null);
      });
    }
  }, [returnRecord.productId]);

  const handleProcess = async () => {
    setLoading(true);
    setError('');
    const result = await returnsService.updateStockAndComplete(
      returnRecord.id,
      returnRecord.productId || '',
      returnRecord.productName,
      product?.stock || 0,
      returnRecord.quantity,
      returnRecord.clientId,
      returnRecord.refundType,
      returnRecord.totalAmount,
      returnRecord.returnToStock,
      returnRecord.isInternalLoss,
      returnRecord.productCondition
    );
    setLoading(false);
    if (result.success) {
      onProcessed();
    } else {
      setError(result.error || 'Erreur lors du traitement.');
    }
  };

  const conditionColor = CONDITION_COLORS[returnRecord.productCondition] || 'bg-gray-100 text-gray-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-600 text-foreground">Traiter le retour</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="p-4 rounded-xl bg-muted/40 space-y-2.5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Avoir N°</span>
              <span className="font-700 text-primary">{returnRecord.avoirNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Produit</span>
              <span className="font-500 text-foreground">{returnRecord.productName}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">État produit</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-600 ${conditionColor}`}>
                {PRODUCT_CONDITION_LABELS[returnRecord.productCondition]}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Quantité retournée</span>
              <span className="font-500 text-foreground">{returnRecord.quantity}</span>
            </div>
            {product && returnRecord.returnToStock && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Impact stock</span>
                <span className="font-500 text-emerald-600">{product.stock} → {product.stock + returnRecord.quantity} (+{returnRecord.quantity})</span>
              </div>
            )}
            {!returnRecord.returnToStock && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Impact stock</span>
                <span className="font-500 text-red-600">Aucun — produit abîmé</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-border pt-2">
              <span className="text-muted-foreground">Remboursement</span>
              <span className="font-600 text-foreground">{RETURN_REFUND_TYPE_LABELS[returnRecord.refundType]}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Montant</span>
              <span className="font-700 text-foreground">{formatCurrency(returnRecord.totalAmount)}</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
            <p className="text-sm text-blue-800 font-500">Actions qui seront effectuées :</p>
            <ul className="mt-1.5 space-y-1">
              {returnRecord.returnToStock && returnRecord.productCondition !== 'damaged' ? (
                <li className="flex items-center gap-2 text-xs text-blue-700">
                  <Icon name="CheckCircleIcon" size={13} className="text-blue-500 shrink-0" />
                  Remise en stock de {returnRecord.quantity} unité(s) — Statut : Retour bon état
                </li>
              ) : (
                <li className="flex items-center gap-2 text-xs text-red-700">
                  <Icon name="XCircleIcon" size={13} className="text-red-500 shrink-0" />
                  Produit abîmé — ne retourne pas en stock vendable
                </li>
              )}
              {returnRecord.isInternalLoss && (
                <li className="flex items-center gap-2 text-xs text-red-700">
                  <Icon name="ExclamationTriangleIcon" size={13} className="text-red-500 shrink-0" />
                  Perte interne boutique enregistrée : {formatCurrency(returnRecord.totalAmount)}
                </li>
              )}
              {returnRecord.refundType === 'store_credit' && returnRecord.clientId && (
                <li className="flex items-center gap-2 text-xs text-blue-700">
                  <Icon name="CheckCircleIcon" size={13} className="text-blue-500 shrink-0" />
                  Avoir de {formatCurrency(returnRecord.totalAmount)} appliqué au compte client
                </li>
              )}
              {returnRecord.exchangeProductName && (
                <li className="flex items-center gap-2 text-xs text-blue-700">
                  <Icon name="ArrowPathIcon" size={13} className="text-blue-500 shrink-0" />
                  Échange avec : {returnRecord.exchangeProductName}
                </li>
              )}
              <li className="flex items-center gap-2 text-xs text-blue-700">
                <Icon name="CheckCircleIcon" size={13} className="text-blue-500 shrink-0" />
                Mouvement de stock et historique enregistrés
              </li>
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200">
              <Icon name="ExclamationCircleIcon" size={16} className="text-red-500 shrink-0" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-500 border border-border rounded-xl hover:bg-muted transition-colors">Annuler</button>
          <button onClick={handleProcess} disabled={loading}
            className="px-5 py-2.5 text-sm font-600 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors disabled:opacity-60 flex items-center gap-2">
            {loading && <Icon name="ArrowPathIcon" size={14} className="animate-spin" />}
            Confirmer le traitement
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

type PageTab = 'list' | 'dashboard';

export default function ReturnsPage() {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [processTarget, setProcessTarget] = useState<ReturnRecord | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [pageTab, setPageTab] = useState<PageTab>('list');
  const [dashStats, setDashStats] = useState<any>(null);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    const [data, stats] = await Promise.all([
      returnsService.getAll(),
      returnsService.getDashboardStats(),
    ]);
    setReturns(data);
    setDashStats(stats);
    setLoading(false);
  }, []);

  useEffect(() => { loadReturns(); }, [loadReturns]);

  const filtered = returns.filter(r => {
    const matchSearch =
      r.avoirNumber.toLowerCase().includes(search.toLowerCase()) ||
      r.productName.toLowerCase().includes(search.toLowerCase()) ||
      (r.clientName || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || r.returnStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalReturns = returns.length;
  const pendingCount = returns.filter(r => r.returnStatus === 'pending').length;
  const completedCount = returns.filter(r => r.returnStatus === 'completed').length;
  const totalRefunded = returns.filter(r => r.returnStatus === 'completed').reduce((s, r) => s + r.totalAmount, 0);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white">
          <div>
            <h1 className="text-xl font-700 text-foreground">Retours & Avoirs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Gérez les retours produits et les avoirs clients</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-muted rounded-xl p-1">
              {(['list', 'dashboard'] as PageTab[]).map(t => (
                <button key={t} onClick={() => setPageTab(t)}
                  className={`px-3 py-1.5 text-xs font-600 rounded-lg transition-colors ${pageTab === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                  {t === 'list' ? 'Liste' : 'Dashboard'}
                </button>
              ))}
            </div>
            <button onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-sm font-600 rounded-xl hover:bg-primary/90 transition-colors">
              <Icon name="PlusIcon" size={16} />
              Nouveau retour
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-white border-b border-border">
          {[
            { label: 'Total retours', value: totalReturns, icon: 'ArrowUturnLeftIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'En attente', value: pendingCount, icon: 'ClockIcon', color: 'text-yellow-600 bg-yellow-50' },
            { label: 'Traités', value: completedCount, icon: 'CheckCircleIcon', color: 'text-green-600 bg-green-50' },
            { label: 'Montant remboursé', value: formatCurrency(totalRefunded), icon: 'BanknotesIcon', color: 'text-purple-600 bg-purple-50' },
          ].map((kpi, i) => (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-white">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpi.color}`}>
                <Icon name={kpi.icon as Parameters<typeof Icon>[0]['name']} size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-lg font-700 text-foreground">{kpi.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Dashboard tab */}
        {pageTab === 'dashboard' && dashStats && (
          <div className="flex-1 overflow-auto px-6 py-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {[
                { label: 'Retours bon état', value: dashStats.goodCondition, icon: 'CheckCircleIcon', color: 'text-emerald-600 bg-emerald-50', desc: 'Réintégrés au stock' },
                { label: 'Retours abîmés', value: dashStats.damaged, icon: 'ExclamationTriangleIcon', color: 'text-red-600 bg-red-50', desc: 'Non réintégrés' },
                { label: 'Pertes internes', value: dashStats.internalLosses, icon: 'XCircleIcon', color: 'text-red-700 bg-red-100', desc: 'Faute boutique' },
                { label: 'Avoirs émis', value: formatCurrency(dashStats.totalAvoirAmount), icon: 'GiftIcon', color: 'text-purple-600 bg-purple-50', desc: 'Crédits clients' },
                { label: 'Unités réintégrées', value: dashStats.reintegratedStock, icon: 'ArchiveBoxIcon', color: 'text-blue-600 bg-blue-50', desc: 'Retour en stock' },
                { label: 'Produits perdus', value: dashStats.lostProducts, icon: 'TrashIcon', color: 'text-gray-600 bg-gray-100', desc: 'Unités perdues' },
                { label: 'Montant pertes', value: formatCurrency(dashStats.totalLossAmount), icon: 'BanknotesIcon', color: 'text-red-600 bg-red-50', desc: 'Impact sur marge' },
                { label: 'Total retours', value: dashStats.totalReturns, icon: 'ArrowUturnLeftIcon', color: 'text-primary bg-primary/10', desc: 'Tous statuts' },
              ].map((stat, i) => (
                <div key={i} className="bg-white border border-border rounded-xl p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${stat.color}`}>
                      <Icon name={stat.icon as Parameters<typeof Icon>[0]['name']} size={16} />
                    </div>
                    <div>
                      <p className="text-lg font-700 text-foreground">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{stat.desc}</p>
                </div>
              ))}
            </div>

            {/* Returns by case breakdown */}
            <div className="bg-white border border-border rounded-2xl p-5">
              <h3 className="font-600 text-foreground mb-4">Répartition par décision</h3>
              <div className="grid grid-cols-4 gap-4">
                {([
                  { label: 'Remboursement', icon: 'BanknotesIcon', color: 'border-emerald-300 bg-emerald-50 text-emerald-800', match: (d: string) => d?.startsWith('Remboursement') },
                  { label: 'Avoir client', icon: 'GiftIcon', color: 'border-purple-300 bg-purple-50 text-purple-800', match: (d: string) => d === 'Avoir client' || d === 'Avoir / Crédit client' },
                  { label: 'Échange', icon: 'ArrowPathIcon', color: 'border-blue-300 bg-blue-50 text-blue-800', match: (d: string) => d === 'Échange' || d === 'Échange produit' },
                  { label: 'Abîmé / Perte', icon: 'ExclamationTriangleIcon', color: 'border-red-300 bg-red-50 text-red-800', match: (d: string) => d === 'Abîmé / Perte' },
                ] as const).map(rc => {
                  const count = returns.filter(r => rc.match(r.decision ?? '')).length;
                  const pct = returns.length > 0 ? Math.round((count / returns.length) * 100) : 0;
                  return (
                    <div key={rc.label} className={`p-4 rounded-xl border-2 ${rc.color}`}>
                      <Icon name={rc.icon as Parameters<typeof Icon>[0]['name']} size={20} className="mb-2" />
                      <p className="text-2xl font-700">{count}</p>
                      <p className="text-sm font-600">{rc.label}</p>
                      <p className="text-xs opacity-70 mt-1">{pct}% des retours</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* List tab */}
        {pageTab === 'list' && (
          <>
            {/* Filters */}
            <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-border">
              <div className="relative flex-1 max-w-xs">
                <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input type="text" placeholder="Rechercher avoir, produit, client..." value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div className="flex gap-1.5">
                {(['all', 'pending', 'approved', 'completed', 'rejected'] as const).map(s => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`px-3 py-1.5 text-xs font-500 rounded-lg transition-colors ${statusFilter === s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                    {s === 'all' ? 'Tous' : RETURN_STATUS_LABELS[s as keyof typeof RETURN_STATUS_LABELS]}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-6 py-4">
              {loading ? (
                <div className="flex items-center justify-center h-48">
                  <Icon name="ArrowPathIcon" size={24} className="animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                    <Icon name="ArrowUturnLeftIcon" size={24} className="text-muted-foreground" />
                  </div>
                  <p className="text-sm font-500 text-foreground">Aucun retour trouvé</p>
                  <p className="text-xs text-muted-foreground mt-1">Créez votre premier retour en cliquant sur "Nouveau retour"</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-border overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">N° Avoir</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Produit</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">État</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Cas</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Avoir</th>
                        <th className="text-right px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Montant</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Statut</th>
                        <th className="text-left px-4 py-3 text-xs font-600 uppercase tracking-wider text-muted-foreground">Date</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map(r => (
                        <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3">
                            <span className="text-sm font-700 text-primary">{r.avoirNumber}</span>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-sm font-500 text-foreground">{r.productName}</p>
                            {r.productRef && <p className="text-xs text-muted-foreground">Réf: {r.productRef} · Qté: {r.quantity}</p>}
                          </td>
                          <td className="px-4 py-3">
                            {r.clientName ? <p className="text-sm text-foreground">{r.clientName}</p>
                              : <span className="text-xs text-muted-foreground italic">Sans client</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-600 ${CONDITION_COLORS[r.productCondition]}`}>
                              {PRODUCT_CONDITION_LABELS[r.productCondition]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{r.decision || RETURN_REFUND_TYPE_LABELS[r.refundType]}</span>
                          </td>
                          <td className="px-4 py-3">
                            {r.refundType === 'store_credit' ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-600 ${AVOIR_STATUS_COLORS[r.avoirStatus]}`}>
                                {AVOIR_STATUS_LABELS[r.avoirStatus]}
                              </span>
                            ) : <span className="text-xs text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-700 text-foreground">{formatCurrency(r.totalAmount)}</span>
                            {r.isInternalLoss && <p className="text-xs text-red-600">Perte interne</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-600 ${STATUS_COLORS[r.returnStatus]}`}>
                              {RETURN_STATUS_LABELS[r.returnStatus]}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {r.returnStatus === 'pending' && (
                                <button onClick={() => setProcessTarget(r)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-600 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                                  <Icon name="CheckIcon" size={12} />
                                  Traiter
                                </button>
                              )}
                              {r.returnStatus === 'completed' && (
                                <div className="flex items-center gap-1 text-xs text-green-600">
                                  <Icon name="CheckCircleIcon" size={13} />
                                  <span>Traité</span>
                                </div>
                              )}
                              <button
                                onClick={() => printAvoirTicket(r)}
                                title="Imprimer le ticket avoir"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-600 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors shrink-0"
                              >
                                <Icon name="PrinterIcon" size={13} />
                                Ticket
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {showNewModal && (
        <NewReturnModal onClose={() => setShowNewModal(false)} onCreated={(r) => { setReturns(prev => [r, ...prev]); setShowNewModal(false); }} />
      )}

      {processTarget && (
        <ProcessReturnModal returnRecord={processTarget} onClose={() => setProcessTarget(null)} onProcessed={() => { setProcessTarget(null); loadReturns(); }} />
      )}
    </AppLayout>
  );
}
