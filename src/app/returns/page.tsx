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

function printAvoirTicket(r: ReturnRecord): void {
  const s = loadSettingsFromCache();
  const now = new Date(r.createdAt);
  const dateStr = formatDate(r.createdAt);
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const conditionLabel: Record<string, string> = { good: 'Bon état', damaged: 'Abîmé', unknown: 'Inconnu' };
  const refundLabel: Record<string, string> = {
    refund_cash: 'Remboursement espèces',
    refund_card: 'Remboursement carte',
    store_credit: 'Avoir client',
    exchange: 'Échange produit',
  };

  const w = s.paperWidth ?? '80mm';
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
  <div class="bold">Produit retourné :</div>
  <div style="margin:3px 0 3px 4px;">
    <div>${r.productName}</div>
    ${r.productRef ? `<div style="font-size:10px;">Réf: ${r.productRef}</div>` : ''}
    <div class="row"><span>Quantité :</span><span>${r.quantity}</span></div>
    <div class="row"><span>État :</span><span>${conditionLabel[r.productCondition] ?? r.productCondition}</span></div>
  </div>

  <div class="line"></div>
  <div class="row"><span>Type de retour :</span><span class="bold">${refundLabel[r.refundType] ?? r.refundType}</span></div>
  ${r.decision ? `<div class="row"><span>Décision :</span><span>${r.decision}</span></div>` : ''}
  ${r.exchangeProductName ? `<div class="row"><span>Échange avec :</span><span>${r.exchangeProductName}</span></div>` : ''}
  ${r.reasonNotes ? `<div style="margin-top:3px;font-size:10px;">Note : ${r.reasonNotes}</div>` : ''}

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

// ─── Return Case Selector ────────────────────────────────────────────────────

type ReturnCase = 'good_condition' | 'exchange' | 'store_credit' | 'damaged';

const RETURN_CASES: { id: ReturnCase; label: string; icon: string; desc: string; color: string }[] = [
  { id: 'good_condition', label: 'Bon état', icon: 'CheckCircleIcon', desc: 'Produit retourne en stock. Remboursement ou avoir.', color: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  { id: 'exchange', label: 'Échange', icon: 'ArrowPathIcon', desc: 'Le client échange contre un autre produit.', color: 'border-blue-300 bg-blue-50 text-blue-800' },
  { id: 'store_credit', label: 'Avoir client', icon: 'GiftIcon', desc: 'Crédit enregistré sur la fiche client.', color: 'border-purple-300 bg-purple-50 text-purple-800' },
  { id: 'damaged', label: 'Abîmé / Perte', icon: 'ExclamationTriangleIcon', desc: 'Ne retourne pas en stock. Perte interne enregistrée.', color: 'border-red-300 bg-red-50 text-red-800' },
];

// ─── New Return Modal ────────────────────────────────────────────────────────

interface NewReturnModalProps {
  onClose: () => void;
  onCreated: (r: ReturnRecord) => void;
}

function NewReturnModal({ onClose, onCreated }: NewReturnModalProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [products, setProducts] = useState<StockProduct[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [exchangeSearch, setExchangeSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<StockProduct | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedExchangeProduct, setSelectedExchangeProduct] = useState<StockProduct | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [reason, setReason] = useState<ReturnReason>('defective');
  const [reasonNotes, setReasonNotes] = useState('');
  const [returnCase, setReturnCase] = useState<ReturnCase>('good_condition');
  const [refundType, setRefundType] = useState<ReturnRefundType>('refund_cash');
  const [isInternalLoss, setIsInternalLoss] = useState(false);
  const [originalReceipt, setOriginalReceipt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStockProducts().then(setProducts);
    clientService.getAll().then(setClients);
  }, []);

  // Auto-set refund type based on case
  useEffect(() => {
    if (returnCase === 'store_credit') setRefundType('store_credit');
    else if (returnCase === 'exchange') setRefundType('exchange');
    else if (returnCase === 'good_condition') setRefundType('refund_cash');
  }, [returnCase]);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
    p.ref.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredExchangeProducts = products.filter(p =>
    (p.name.toLowerCase().includes(exchangeSearch.toLowerCase()) ||
    p.ref.toLowerCase().includes(exchangeSearch.toLowerCase())) &&
    p.id !== selectedProduct?.id
  );

  const filteredClients = clients.filter(c =>
    c.fullName.toLowerCase().includes(clientSearch.toLowerCase()) ||
    (c.phone || '').includes(clientSearch)
  );

  const totalAmount = quantity * unitPrice;
  const exchangePriceDiff = selectedExchangeProduct ? selectedExchangeProduct.sellPriceTtc - totalAmount : 0;

  const getProductCondition = (): ProductCondition => {
    if (returnCase === 'damaged') return 'damaged';
    if (returnCase === 'good_condition' || returnCase === 'store_credit') return 'good';
    if (returnCase === 'exchange') return 'good'; // exchange assumes good unless noted
    return 'unknown';
  };

  const getReturnToStock = (): boolean => {
    return returnCase !== 'damaged';
  };

  const handleSubmit = async () => {
    if (!selectedProduct) { setError('Veuillez sélectionner un produit.'); return; }
    if (quantity < 1) { setError('La quantité doit être au moins 1.'); return; }
    if (returnCase === 'store_credit' && !selectedClient) { setError('Un avoir nécessite un client sélectionné.'); return; }
    setLoading(true);
    setError('');

    const input: CreateReturnInput = {
      clientId: selectedClient?.id,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      productRef: selectedProduct.ref,
      quantity,
      unitPrice,
      reason,
      reasonNotes: reasonNotes || undefined,
      refundType,
      productCondition: getProductCondition(),
      returnToStock: getReturnToStock(),
      isInternalLoss: returnCase === 'damaged' && isInternalLoss,
      exchangeProductId: selectedExchangeProduct?.id,
      exchangeProductName: selectedExchangeProduct?.name,
      exchangePriceDiff: returnCase === 'exchange' ? exchangePriceDiff : 0,
      decision: RETURN_CASES.find(c => c.id === returnCase)?.label,
      originalReceipt: originalReceipt || undefined,
    };

    const result = await returnsService.create(input);
    setLoading(false);
    if (result) {
      onCreated(result);
    } else {
      setError('Erreur lors de la création du retour. Veuillez réessayer.');
    }
  };

  const stepLabels = ['Produit & Client', 'Cas de retour', 'Motif', 'Confirmation'];

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
              <h2 className="text-base font-600 text-foreground">Nouveau retour</h2>
              <p className="text-xs text-muted-foreground">Étape {step} / 4</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex gap-2">
          {stepLabels.map((label, i) => (
            <div key={i} className="flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${step > i ? 'bg-primary' : step === i + 1 ? 'bg-primary/60' : 'bg-muted'}`} />
              <p className={`text-[10px] mt-1 font-500 ${step === i + 1 ? 'text-primary' : 'text-muted-foreground'}`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* STEP 1: Product & Client */}
          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Produit retourné *</label>
                {selectedProduct ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-primary/30 bg-primary/5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground truncate">{selectedProduct.name}</p>
                      <p className="text-xs text-muted-foreground">Réf: {selectedProduct.ref} · Stock actuel: {selectedProduct.stock}</p>
                    </div>
                    <button onClick={() => setSelectedProduct(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Icon name="MagnifyingGlassIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="Rechercher un produit..." value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    {productSearch && (
                      <div className="absolute top-full left-0 right-0 z-10 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                        {filteredProducts.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun produit trouvé</p>
                          : filteredProducts.slice(0, 8).map(p => (
                            <button key={p.id} onClick={() => { setSelectedProduct(p); setUnitPrice(p.sellPriceTtc); setProductSearch(''); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-500 text-foreground truncate">{p.name}</p>
                                <p className="text-xs text-muted-foreground">Réf: {p.ref} · {formatCurrency(p.sellPriceTtc)}</p>
                              </div>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-500 text-foreground mb-1.5">Quantité *</label>
                    <input type="number" min={1} value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                  <div>
                    <label className="block text-sm font-500 text-foreground mb-1.5">Prix unitaire (€) *</label>
                    <input type="number" min={0} step={0.01} value={unitPrice} onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </div>
              )}

              {selectedProduct && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <span className="text-sm text-muted-foreground">Montant total du retour</span>
                  <span className="text-base font-700 text-foreground">{formatCurrency(totalAmount)}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Client (optionnel)</label>
                {selectedClient ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                      <span className="text-xs font-600 text-primary">{selectedClient.firstName[0]}{selectedClient.lastName[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-600 text-foreground">{selectedClient.fullName}</p>
                      <p className="text-xs text-muted-foreground">{selectedClient.phone || selectedClient.email || ''}</p>
                    </div>
                    <button onClick={() => setSelectedClient(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <Icon name="XMarkIcon" size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Icon name="UserIcon" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" placeholder="Rechercher un client..." value={clientSearch} onChange={e => setClientSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    {clientSearch && (
                      <div className="absolute top-full left-0 right-0 z-10 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                        {filteredClients.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">Aucun client trouvé</p>
                          : filteredClients.slice(0, 6).map(c => (
                            <button key={c.id} onClick={() => { setSelectedClient(c); setClientSearch(''); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left">
                              <p className="text-sm font-500 text-foreground">{c.fullName}</p>
                              <p className="text-xs text-muted-foreground ml-auto">{c.phone || ''}</p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">N° ticket original (optionnel)</label>
                <input type="text" placeholder="Ex: TK-2024-0042" value={originalReceipt} onChange={e => setOriginalReceipt(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </>
          )}

          {/* STEP 2: Return case */}
          {step === 2 && (
            <div className="space-y-3">
              <p className="text-sm font-600 text-foreground">Quel est le cas de retour ?</p>
              {RETURN_CASES.map(rc => (
                <button key={rc.id} onClick={() => setReturnCase(rc.id)}
                  className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all ${returnCase === rc.id ? rc.color : 'border-border hover:border-primary/30'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${returnCase === rc.id ? 'bg-white/60' : 'bg-muted'}`}>
                    <Icon name={rc.icon as Parameters<typeof Icon>[0]['name']} size={20} className={returnCase === rc.id ? '' : 'text-muted-foreground'} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-700">{rc.label}</p>
                    <p className="text-xs opacity-80 mt-0.5">{rc.desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${returnCase === rc.id ? 'border-current' : 'border-muted-foreground'}`}>
                    {returnCase === rc.id && <div className="w-2.5 h-2.5 rounded-full bg-current" />}
                  </div>
                </button>
              ))}

              {/* Exchange product selector */}
              {returnCase === 'exchange' && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                  <p className="text-sm font-600 text-blue-800">Produit de remplacement</p>
                  {selectedExchangeProduct ? (
                    <div className="flex items-center gap-3 p-3 rounded-xl border border-blue-300 bg-white">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-600 text-foreground">{selectedExchangeProduct.name}</p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(selectedExchangeProduct.sellPriceTtc)}</p>
                      </div>
                      <button onClick={() => setSelectedExchangeProduct(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                        <Icon name="XMarkIcon" size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <input type="text" placeholder="Rechercher le produit d'échange..." value={exchangeSearch} onChange={e => setExchangeSearch(e.target.value)}
                        className="w-full px-3 py-2.5 text-sm border border-blue-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white" />
                      {exchangeSearch && (
                        <div className="absolute top-full left-0 right-0 z-10 bg-white border border-border rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                          {filteredExchangeProducts.slice(0, 6).map(p => (
                            <button key={p.id} onClick={() => { setSelectedExchangeProduct(p); setExchangeSearch(''); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-left">
                              <p className="text-sm font-500 text-foreground">{p.name}</p>
                              <p className="text-xs text-muted-foreground ml-auto">{formatCurrency(p.sellPriceTtc)}</p>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedExchangeProduct && (
                    <div className={`p-3 rounded-lg text-sm font-600 ${exchangePriceDiff > 0 ? 'bg-amber-50 text-amber-800' : exchangePriceDiff < 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-gray-50 text-gray-700'}`}>
                      {exchangePriceDiff > 0 ? `Supplément à payer : ${formatCurrency(exchangePriceDiff)}` :
                       exchangePriceDiff < 0 ? `Avoir à rendre : ${formatCurrency(Math.abs(exchangePriceDiff))}` :
                       'Échange sans différence de prix'}
                    </div>
                  )}
                </div>
              )}

              {/* Damaged — internal loss option */}
              {returnCase === 'damaged' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-3">
                  <p className="text-sm font-600 text-red-800">Ce produit ne retournera pas en stock vendable.</p>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={isInternalLoss} onChange={e => setIsInternalLoss(e.target.checked)}
                      className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500" />
                    <span className="text-sm text-red-700">Le problème vient de la boutique (perte interne)</span>
                  </label>
                  {isInternalLoss && (
                    <div className="flex items-center gap-2 p-2.5 bg-red-100 rounded-lg">
                      <Icon name="ExclamationTriangleIcon" size={14} className="text-red-600 shrink-0" />
                      <p className="text-xs text-red-700">La perte de {formatCurrency(totalAmount)} sera enregistrée comme perte interne boutique.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Reason */}
          {step === 3 && (
            <>
              <div>
                <label className="block text-sm font-500 text-foreground mb-3">Motif du retour *</label>
                <div className="grid grid-cols-2 gap-2.5">
                  {(Object.entries(RETURN_REASON_LABELS) as [ReturnReason, string][]).map(([key, label]) => (
                    <button key={key} onClick={() => setReason(key)}
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${reason === key ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/40 text-foreground'}`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${reason === key ? 'border-primary' : 'border-muted-foreground'}`}>
                        {reason === key && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <span className="text-sm font-500">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Notes complémentaires (optionnel)</label>
                <textarea rows={3} placeholder="Décrivez le problème en détail..." value={reasonNotes} onChange={e => setReasonNotes(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
              </div>
            </>
          )}

          {/* STEP 4: Confirmation */}
          {step === 4 && (
            <div className="space-y-4">
              <div className={`p-4 rounded-xl border-2 ${RETURN_CASES.find(c => c.id === returnCase)?.color || ''}`}>
                <p className="text-sm font-700 mb-1">Cas : {RETURN_CASES.find(c => c.id === returnCase)?.label}</p>
                <p className="text-xs opacity-80">{RETURN_CASES.find(c => c.id === returnCase)?.desc}</p>
              </div>

              <div className="p-4 rounded-xl bg-muted/40 space-y-2">
                <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-2">Récapitulatif</p>
                {[
                  { label: 'Produit', value: selectedProduct?.name },
                  { label: 'Quantité', value: quantity },
                  { label: 'Motif', value: RETURN_REASON_LABELS[reason] },
                  { label: 'État produit', value: PRODUCT_CONDITION_LABELS[getProductCondition()] },
                  { label: 'Retour en stock', value: getReturnToStock() ? '✅ Oui' : '❌ Non' },
                  returnCase === 'exchange' && selectedExchangeProduct ? { label: 'Échange avec', value: selectedExchangeProduct.name } : null,
                  returnCase === 'exchange' && exchangePriceDiff !== 0 ? { label: 'Différence prix', value: formatCurrency(Math.abs(exchangePriceDiff)) } : null,
                  returnCase === 'damaged' && isInternalLoss ? { label: 'Perte interne', value: formatCurrency(totalAmount) } : null,
                  selectedClient ? { label: 'Client', value: selectedClient.fullName } : null,
                ].filter(Boolean).map((item: any, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-500 text-foreground">{item.value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm border-t border-border pt-2 mt-2">
                  <span className="text-muted-foreground font-600">Montant</span>
                  <span className="font-700 text-foreground">{formatCurrency(totalAmount)}</span>
                </div>
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
          <button onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3 | 4) : onClose()}
            className="px-4 py-2.5 text-sm font-500 text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted transition-colors">
            {step === 1 ? 'Annuler' : 'Retour'}
          </button>
          {step < 4 ? (
            <button onClick={() => {
              if (step === 1 && !selectedProduct) { setError('Veuillez sélectionner un produit.'); return; }
              if (step === 2 && returnCase === 'store_credit' && !selectedClient) { setError('Un avoir nécessite un client sélectionné.'); return; }
              setError('');
              setStep((step + 1) as 2 | 3 | 4);
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
              <h3 className="font-600 text-foreground mb-4">Répartition par cas de retour</h3>
              <div className="grid grid-cols-4 gap-4">
                {RETURN_CASES.map(rc => {
                  const count = returns.filter(r => r.decision === rc.label).length;
                  const pct = returns.length > 0 ? Math.round((count / returns.length) * 100) : 0;
                  return (
                    <div key={rc.id} className={`p-4 rounded-xl border-2 ${rc.color}`}>
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
