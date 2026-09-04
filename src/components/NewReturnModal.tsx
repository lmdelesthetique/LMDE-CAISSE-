'use client';

import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { openAndPrint, loadSettingsFromCache } from '@/lib/utils/ticketPrinter';
import {
  returnsService,
  ReturnRecord,
  ReturnReason,
  ReturnRefundType,
  RETURN_REASON_LABELS,
  CreateReturnInput,
} from '@/lib/services/returnsService';
import { fetchStockProducts, fetchProductByBarcode, StockProduct } from '@/lib/services/stockService';
import { clientService, Client } from '@/lib/services/clientService';

// ─── Types ───────────────────────────────────────────────────────────────────

interface LineItem {
  id: string;
  product: StockProduct;
  quantity: number;
  unitPrice: number;
  discountPct: number;
}

type ReturnType = 'remboursement' | 'avoir' | 'exchange';
type PaymentMethod = 'cash' | 'card' | 'transfer';

const PAYMENT_METHODS: { id: PaymentMethod; label: string; icon: string }[] = [
  { id: 'cash', label: 'Espèces', icon: 'BanknotesIcon' },
  { id: 'card', label: 'Carte (CB)', icon: 'CreditCardIcon' },
  { id: 'transfer', label: 'Virement', icon: 'BuildingLibraryIcon' },
];

function lineTotal(li: LineItem): number {
  return Math.max(0, li.quantity * li.unitPrice * (1 - li.discountPct / 100));
}

function formatCurrency(v: number): string {
  return v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}

// ─── Public handle (for barcode routing from POS) ────────────────────────────

export interface NewReturnModalHandle {
  addProductByBarcode: (barcode: string) => Promise<void>;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface NewReturnModalProps {
  onClose: () => void;
  onCreated: (r: ReturnRecord) => void;
  initialClient?: Client | null;
}

// ─── Print avoir ticket ───────────────────────────────────────────────────────

function printAvoirTicket(r: ReturnRecord, lineItems: LineItem[]) {
  const s = loadSettingsFromCache();
  const now = new Date(r.createdAt);
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const refundLabel: Record<string, string> = {
    refund_cash: 'Remboursement espèces', refund_card: 'Remboursement CB',
    store_credit: 'Avoir client', exchange: 'Échange produit',
  };
  const w = s.paperWidth ?? '80mm';

  const itemsHtml = lineItems.map(li => `
    <div style="margin:2px 0 2px 4px;">
      <div class="bold">${li.product.name}</div>
      ${li.product.ref ? `<div style="font-size:10px;">Réf: ${li.product.ref}</div>` : ''}
      <div class="row">
        <span>Qté: ${li.quantity}</span>
        <span>${li.discountPct > 0 ? `Remise -${li.discountPct}%` : `${li.unitPrice.toFixed(2)} €/u`}</span>
        <span class="bold">${lineTotal(li).toFixed(2)} €</span>
      </div>
    </div>`).join('<div style="border-top:1px dotted #ccc;margin:3px 0;"></div>');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Avoir ${r.avoirNumber}</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; width: ${w}; background:#fff; color:#000; padding: 8px; }
.center { text-align: center; } .bold { font-weight: bold; }
.line { border-top: 1px dashed #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; margin: 2px 0; }
.title { font-size: 15px; font-weight: bold; text-align: center; margin: 6px 0; }
.avoir-num { font-size: 14px; font-weight: bold; text-align: center; color: #000; border: 2px solid #000; padding: 4px 8px; margin: 6px auto; display: inline-block; }
.amount { font-size: 16px; font-weight: bold; text-align: center; margin: 6px 0; }
.footer { font-size: 10px; text-align: center; margin-top: 6px; }
@media print { body { width: 100%; } @page { margin: 0; size: ${w} auto; } }
</style></head><body>
<div class="center bold">${s.companyName}</div>
${s.companyLine2 ? `<div class="center">${s.companyLine2}</div>` : ''}
${s.companyCity ? `<div class="center">${s.companyCity}</div>` : ''}
${s.companyPhone ? `<div class="center">Tél: ${s.companyPhone}</div>` : ''}
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
<div class="line"></div>
<div class="amount">Montant : ${r.totalAmount.toFixed(2)} €</div>
<div class="line"></div>
<div class="footer">
  ${s.returnConditions ? `<div style="margin-bottom:4px;">${s.returnConditions}</div>` : ''}
  <div>Document émis le ${dateStr}</div>
  <div>Conservez ce document pour tout litige.</div>
  <div style="margin-top:4px;">${s.receiptFooter ?? 'Merci de votre confiance !'}</div>
</div>
<script>window.onload = function(){ window.print(); }<\/script>
</body></html>`;

  openAndPrint(html);
}

// ─── Component ───────────────────────────────────────────────────────────────

const NewReturnModal = forwardRef<NewReturnModalHandle, NewReturnModalProps>(
  function NewReturnModal({ onClose, onCreated, initialClient }, ref) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [allProducts, setAllProducts] = useState<StockProduct[]>([]);
    const [allClients, setAllClients] = useState<Client[]>([]);

    // Step 1 — line items
    const [lineItems, setLineItems] = useState<LineItem[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [showProductDrop, setShowProductDrop] = useState(false);
    const [barcodeFlash, setBarcodeFlash] = useState<string | null>(null);

    // Step 2 — decision
    const [returnType, setReturnType] = useState<ReturnType>('remboursement');
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
    const [isDamaged, setIsDamaged] = useState(false);
    const [selectedClient, setSelectedClient] = useState<Client | null>(initialClient ?? null);
    const [clientSearch, setClientSearch] = useState('');
    const [freeClientName, setFreeClientName] = useState(initialClient?.fullName ?? '');
    const [originalReceipt, setOriginalReceipt] = useState('');
    const [reason, setReason] = useState<ReturnReason>('defective');
    const [reasonNotes, setReasonNotes] = useState('');

    // Exchange
    const [exchangeSearch, setExchangeSearch] = useState('');
    const [exchangeProduct, setExchangeProduct] = useState<StockProduct | null>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [createdReturn, setCreatedReturn] = useState<ReturnRecord | null>(null);

    useEffect(() => {
      fetchStockProducts().then(setAllProducts);
      clientService.getAll().then(setAllClients);
    }, []);

    // Expose barcode handler to parent (POS)
    useImperativeHandle(ref, () => ({
      addProductByBarcode: async (barcode: string) => {
        // First try already-loaded products
        let found = allProducts.find(p =>
          p.ref === barcode ||
          p.ref?.toLowerCase() === barcode.toLowerCase()
        );
        if (!found) {
          found = await fetchProductByBarcode(barcode) ?? undefined;
        }
        if (found) {
          addProduct(found);
          setBarcodeFlash(found.name);
          setTimeout(() => setBarcodeFlash(null), 2000);
        } else {
          setBarcodeFlash(`⚠ Inconnu: ${barcode}`);
          setTimeout(() => setBarcodeFlash(null), 2500);
        }
      },
    }));

    const filteredProducts = allProducts.filter(p =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.ref || '').toLowerCase().includes(productSearch.toLowerCase())
    ).slice(0, 8);

    const filteredClients = allClients.filter(c =>
      c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.phone || '').includes(clientSearch)
    ).slice(0, 6);

    const filteredExchange = allProducts.filter(p =>
      (p.name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
       (p.ref || '').toLowerCase().includes(exchangeSearch.toLowerCase())) &&
      !lineItems.some(li => li.product.id === p.id)
    ).slice(0, 6);

    const totalReturn = lineItems.reduce((s, li) => s + lineTotal(li), 0);

    const addProduct = (p: StockProduct) => {
      setLineItems(prev => {
        const existing = prev.find(li => li.product.id === p.id);
        if (existing) return prev.map(li => li.product.id === p.id ? { ...li, quantity: li.quantity + 1 } : li);
        return [...prev, { id: `${p.id}-${Date.now()}`, product: p, quantity: 1, unitPrice: p.sellPriceTtc, discountPct: 0 }];
      });
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
      if (paymentMethod === 'cash') return 'refund_cash';
      return 'refund_card'; // card and transfer both map to refund_card (no refund_transfer type in schema)
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
        setCreatedReturn(result);
        setStep(3);
        onCreated(result);
      } else {
        setError('Erreur lors de la création du retour. Veuillez réessayer.');
      }
    };

    const stepLabels = ['Produits retournés', 'Décision & Paiement', 'Confirmation'];

    // ── Step 3: success screen ──────────────────────────────────────────────
    if (step === 3 && createdReturn) {
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="flex flex-col items-center gap-3 px-8 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Icon name="CheckCircleIcon" size={32} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-700 text-foreground">Retour enregistré</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Avoir N° <span className="font-700 text-primary">{createdReturn.avoirNumber}</span>
                </p>
              </div>
              <div className="w-full p-4 rounded-xl bg-muted/40 text-sm space-y-2 text-left">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Décision</span>
                  <span className="font-600">{createdReturn.decision ?? getDecision()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Montant</span>
                  <span className="font-700">{formatCurrency(createdReturn.totalAmount)}</span>
                </div>
                {createdReturn.clientName && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-600">{createdReturn.clientName}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => printAvoirTicket(createdReturn, lineItems)}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-500 hover:bg-muted transition-colors"
              >
                <Icon name="PrinterIcon" size={15} />
                Imprimer l'avoir
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-600 hover:bg-primary/90 transition-colors"
              >
                Terminer
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon name="ArrowUturnLeftIcon" size={18} className="text-primary" />
              </div>
              <div>
                <h2 className="text-base font-600 text-foreground">Nouveau retour / Avoir</h2>
                <p className="text-xs text-muted-foreground">Étape {step} / 2 · {step === 1 ? 'Scanner ou chercher les articles' : 'Décision & remboursement'}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="px-6 pt-3 flex gap-2 shrink-0">
            {stepLabels.slice(0, 2).map((label, i) => (
              <div key={i} className="flex-1">
                <div className={`h-1.5 rounded-full transition-colors ${step > i ? 'bg-primary' : step === i + 1 ? 'bg-primary/60' : 'bg-muted'}`} />
                <p className={`text-[10px] mt-1 font-500 ${step === i + 1 ? 'text-primary' : 'text-muted-foreground'}`}>{label}</p>
              </div>
            ))}
          </div>

          {/* Barcode flash notification */}
          {barcodeFlash && (
            <div className={`mx-6 mt-3 px-3 py-2 rounded-xl text-xs font-600 text-center shrink-0 ${barcodeFlash.startsWith('⚠') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
              {barcodeFlash.startsWith('⚠') ? barcodeFlash : `✓ Ajouté : ${barcodeFlash}`}
            </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">

            {/* ── STEP 1: PRODUITS ── */}
            {step === 1 && (
              <>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">
                    Ajouter un produit <span className="text-muted-foreground font-400">(scanner le code-barres ou rechercher)</span>
                  </label>
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
                            <input type="number" min={0} step={0.01} value={li.unitPrice}
                              onChange={e => updateLine(li.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40" />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">Remise (%)</p>
                            <input type="number" min={0} max={100} step={1} value={li.discountPct}
                              onChange={e => updateLine(li.id, 'discountPct', parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className="w-full px-2 py-1 text-sm border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40" />
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
                    <Icon name="QrCodeIcon" size={32} className="text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Scannez le code-barres ou recherchez les produits</p>
                    <p className="text-xs text-muted-foreground mt-1 opacity-70">Le scanner de la caisse est actif</p>
                  </div>
                )}
              </>
            )}

            {/* ── STEP 2: DÉCISION ── */}
            {step === 2 && (
              <div className="space-y-4">
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

                {returnType === 'avoir' && (
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                    <span className="text-sm text-purple-700 font-500">Avoir crédité sur le compte client</span>
                    <span className="text-base font-700 text-purple-800">{formatCurrency(totalReturn)}</span>
                  </div>
                )}

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

                <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isDamaged ? 'border-red-300 bg-red-50' : 'border-border hover:border-red-200'}`}>
                  <input type="checkbox" checked={isDamaged} onChange={e => setIsDamaged(e.target.checked)}
                    className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500" />
                  <div>
                    <p className="text-sm font-600 text-foreground">Produit abîmé / ne retourne pas en stock</p>
                    <p className="text-xs text-muted-foreground">Le produit ne sera pas réintégré au stock vendable</p>
                  </div>
                </label>

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
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : onClose()}
              className="px-4 py-2.5 text-sm font-500 text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors">
              {step === 1 ? 'Annuler' : 'Retour'}
            </button>
            <div className="flex items-center gap-2">
              {step === 1 && (
                <span className="text-xs text-muted-foreground">
                  {lineItems.length === 0 ? 'Aucun article' : `${lineItems.length} article${lineItems.length > 1 ? 's' : ''} · ${formatCurrency(totalReturn)}`}
                </span>
              )}
              {step < 2 ? (
                <button onClick={() => {
                  if (step === 1 && lineItems.length === 0) { setError('Ajoutez au moins un produit.'); return; }
                  setError('');
                  setStep((step + 1) as 2 | 3);
                }} className="px-5 py-2.5 text-sm font-600 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors">
                  Suivant →
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
      </div>
    );
  }
);

NewReturnModal.displayName = 'NewReturnModal';
export default NewReturnModal;
