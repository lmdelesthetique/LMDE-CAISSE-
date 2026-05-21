'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { categoryStore } from '@/lib/stores/dataStore';
import { supplierStore } from '@/lib/stores/dataStore';
import { type ProductRecord } from './mockProducts';

const supabase = createClient();

type EditField =
  | 'buy_price' | 'sell_price_ttc' | 'sell_price_ht' | 'tva' | 'category' | 'supplier' | 'min_stock' | 'status' | 'promo_price' | 'transport' | 'customs' | 'structure_pct';

interface FieldConfig {
  label: string;
  type: 'number' | 'text' | 'select';
  options?: string[];
  unit?: string;
  hint?: string;
}

const FIELD_CONFIG: Record<EditField, FieldConfig> = {
  buy_price:      { label: "Prix d'achat fournisseur", type: 'number', unit: '€', hint: 'Recalcule automatiquement la marge' },
  sell_price_ttc: { label: 'Prix de vente TTC',        type: 'number', unit: '€', hint: 'Met à jour le prix HT automatiquement' },
  sell_price_ht:  { label: 'Prix de vente HT',         type: 'number', unit: '€', hint: 'Met à jour le prix TTC automatiquement' },
  tva:            { label: 'TVA',                      type: 'select', options: ['0', '5.5', '8.5', '10', '20'], unit: '%' },
  category:       { label: 'Catégorie',                type: 'select', options: [] },
  supplier:       { label: 'Fournisseur',              type: 'select', options: [] },
  min_stock:      { label: 'Stock minimum',            type: 'number', unit: 'unités' },
  status:         { label: 'Statut produit',           type: 'select', options: ['active', 'inactive', 'archived'] },
  promo_price:    { label: 'Prix promotionnel',        type: 'number', unit: '€' },
  transport:      { label: 'Frais de transport',       type: 'number', unit: '€' },
  customs:        { label: 'Frais de douane',          type: 'number', unit: '€' },
  structure_pct:  { label: 'Frais de structure',       type: 'number', unit: '%', hint: 'Recalcule le coût réel et les marges automatiquement' },
};

interface BulkEditModalProps {
  products: ProductRecord[];
  onClose: () => void;
  onDone: () => void;
}

interface PreviewItem {
  id: string;
  name: string;
  oldValue: string;
  newValue: string;
  oldMargin?: string;
  newMargin?: string;
}

export default function BulkEditModal({ products, onClose, onDone }: BulkEditModalProps) {
  const [field, setField] = useState<EditField>('buy_price');
  const [value, setValue] = useState('');
  const [step, setStep] = useState<'config' | 'preview' | 'applying' | 'done'>('config');
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  useEffect(() => {
    categoryStore.load().then((cats) => setCategories(cats.map((c) => c.name)));
    supplierStore.load().then((sups) => setSuppliers(sups.map((s) => s.companyName)));
  }, []);

  const fieldCfg = useMemo(() => {
    const cfg = { ...FIELD_CONFIG[field] };
    if (field === 'category') cfg.options = categories;
    if (field === 'supplier') cfg.options = suppliers;
    return cfg;
  }, [field, categories, suppliers]);

  function calcMargin(buyPrice: number, sellPriceTTC: number): string {
    const ht = sellPriceTTC / 1.085;
    if (ht <= 0) return '0%';
    return ((ht - buyPrice) / ht * 100).toFixed(1) + '%';
  }

  function calcFullMargin(p: ProductRecord, overrides: { structurePct?: number } = {}): string {
    const structurePct = overrides.structurePct !== undefined ? overrides.structurePct : (p.structurePct || 0);
    const baseCost = p.buyPrice + (p.transport || 0) + (p.customs || 0) + (p.otherFees || 0);
    const realCost = baseCost + baseCost * (structurePct / 100);
    const sellHT = p.sellPriceHT || p.sellPriceTTC / 1.085;
    if (sellHT <= 0) return '0%';
    return ((sellHT - realCost) / sellHT * 100).toFixed(1) + '%';
  }

  function getOldValue(p: ProductRecord): string {
    switch (field) {
      case 'buy_price':      return `${p.buyPrice.toFixed(2)} €`;
      case 'sell_price_ttc': return `${p.sellPriceTTC.toFixed(2)} €`;
      case 'sell_price_ht':  return `${p.sellPriceHT.toFixed(2)} €`;
      case 'tva':            return '8.5%';
      case 'category':       return p.category || '—';
      case 'supplier':       return p.supplier || '—';
      case 'min_stock':      return `${p.minStock}`;
      case 'status':         return p.status;
      case 'promo_price':    return '—';
      case 'transport':      return `${p.transport?.toFixed(2) ?? '0.00'} €`;
      case 'customs':        return `${p.customs?.toFixed(2) ?? '0.00'} €`;
      case 'structure_pct':  return `${(p.structurePct || 0).toFixed(1)} %`;
      default:               return '—';
    }
  }

  function buildPreview(): PreviewItem[] {
    return products.map((p) => {
      const item: PreviewItem = {
        id: p.id,
        name: p.name,
        oldValue: getOldValue(p),
        newValue: '',
      };
      const numVal = parseFloat(value) || 0;
      switch (field) {
        case 'buy_price':
          item.newValue = `${numVal.toFixed(2)} €`;
          item.oldMargin = calcMargin(p.buyPrice, p.sellPriceTTC);
          item.newMargin = calcMargin(numVal, p.sellPriceTTC);
          break;
        case 'sell_price_ttc':
          item.newValue = `${numVal.toFixed(2)} €`;
          item.oldMargin = calcMargin(p.buyPrice, p.sellPriceTTC);
          item.newMargin = calcMargin(p.buyPrice, numVal);
          break;
        case 'sell_price_ht':
          item.newValue = `${numVal.toFixed(2)} € HT → ${(numVal * 1.085).toFixed(2)} € TTC`;
          item.oldMargin = calcMargin(p.buyPrice, p.sellPriceTTC);
          item.newMargin = calcMargin(p.buyPrice, numVal * 1.085);
          break;
        case 'structure_pct':
          item.newValue = `${numVal.toFixed(1)} %`;
          item.oldMargin = calcFullMargin(p);
          item.newMargin = calcFullMargin(p, { structurePct: numVal });
          break;
        default:
          item.newValue = value;
      }
      return item;
    });
  }

  function handlePreview() {
    if (!value.trim()) { setError('Veuillez saisir une valeur.'); return; }
    setError('');
    setPreview(buildPreview());
    setStep('preview');
  }

  async function handleApply() {
    setStep('applying');
    setProgress(0);
    const batchSize = 50;
    const ids = products.map((p) => p.id);
    const numVal = parseFloat(value) || 0;

    // Build update payload
    const buildPayload = () => {
      switch (field) {
        case 'buy_price':      return { buy_price: numVal };
        case 'sell_price_ttc': return { sell_price_ttc: numVal, sell_price_ht: numVal / 1.085 };
        case 'sell_price_ht':  return { sell_price_ht: numVal, sell_price_ttc: numVal * 1.085 };
        case 'tva':            return { tva: numVal };
        case 'category':       return { category: value };
        case 'supplier':       return { supplier: value };
        case 'min_stock':      return { min_stock: numVal };
        case 'status':         return { product_status: value, status: value };
        case 'promo_price':    return { promo_price: numVal };
        case 'transport':      return { transport: numVal };
        case 'customs':        return { customs: numVal };
        case 'structure_pct':  return { structure_pct: numVal };
        default:               return {};
      }
    };

    const payload = buildPayload();
    let done = 0;

    try {
      // Process in batches
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error: updateError } = await supabase
          .from('products')
          .update(payload)
          .in('id', batch);
        if (updateError) throw updateError;
        done += batch.length;
        setProgress(Math.round((done / ids.length) * 100));
      }

      // Save audit history
      const oldValues: Record<string, string> = {};
      products.forEach((p) => { oldValues[p.id] = getOldValue(p); });

      await supabase.from('bulk_edit_history').insert({
        edit_type: field,
        product_ids: ids,
        product_count: ids.length,
        old_values: oldValues,
        new_value: { value, field },
        notes: `Modification en masse: ${FIELD_CONFIG[field].label} → ${value}`,
        edited_by: 'admin',
      });

      // If category changed, ensure it exists in categories table
      if (field === 'category' && value) {
        await categoryStore.ensureByName(value);
      }

      setStep('done');
      setTimeout(() => { onDone(); }, 1500);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la modification');
      setStep('preview');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="PencilSquareIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-700 text-foreground">Modification en masse</h2>
              <p className="text-xs text-muted-foreground">{products.length} produit{products.length > 1 ? 's' : ''} sélectionné{products.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          {step !== 'applying' && (
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="XMarkIcon" size={18} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Config step */}
          {step === 'config' && (
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Champ à modifier</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.entries(FIELD_CONFIG) as [EditField, FieldConfig][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => { setField(key); setValue(''); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${
                        field === key
                          ? 'border-primary bg-primary/5 text-primary' :'border-border text-foreground hover:border-primary/40 hover:bg-muted/30'
                      }`}
                    >
                      <span className="truncate">{cfg.label}</span>
                      {cfg.unit && <span className="text-xs text-muted-foreground ml-auto shrink-0">{cfg.unit}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">
                  Nouvelle valeur — {fieldCfg.label}
                </label>
                {fieldCfg.type === 'select' ? (
                  <select
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  >
                    <option value="">— Sélectionner —</option>
                    {fieldCfg.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder={`Ex: 12.50`}
                      className="w-full px-3.5 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary pr-10"
                    />
                    {fieldCfg.unit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{fieldCfg.unit}</span>
                    )}
                  </div>
                )}
                {fieldCfg.hint && (
                  <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <Icon name="InformationCircleIcon" size={13} />
                    {fieldCfg.hint}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <Icon name="ExclamationCircleIcon" size={15} />
                  {error}
                </div>
              )}

              {/* Product list preview */}
              <div>
                <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Produits concernés</p>
                <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {products.slice(0, 100).map((p, i) => (
                    <div key={p.id} className={`flex items-center justify-between px-3 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-muted/20'}`}>
                      <span className="font-medium text-foreground truncate">{p.name}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{getOldValue(p)}</span>
                    </div>
                  ))}
                  {products.length > 100 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                      + {products.length - 100} autres produits
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Preview step */}
          {step === 'preview' && (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <Icon name="ExclamationTriangleIcon" size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-600 text-amber-800">Confirmation requise</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Vous allez modifier <strong>{products.length} produit{products.length > 1 ? 's' : ''}</strong> — 
                    champ <strong>{FIELD_CONFIG[field].label}</strong> → <strong>{value}{fieldCfg.unit ? ` ${fieldCfg.unit}` : ''}</strong>
                  </p>
                </div>
              </div>

              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-4 gap-0 px-3 py-2 bg-muted/40 text-xs font-600 text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-2">Produit</span>
                  <span>Ancienne valeur</span>
                  <span>Nouvelle valeur</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {preview.slice(0, 200).map((item, i) => (
                    <div key={item.id} className={`grid grid-cols-4 gap-0 px-3 py-2 text-sm ${i % 2 === 0 ? 'bg-white' : 'bg-muted/10'}`}>
                      <span className="col-span-2 font-medium text-foreground truncate pr-2">{item.name}</span>
                      <span className="text-muted-foreground">{item.oldValue}</span>
                      <div>
                        <span className="text-emerald-700 font-medium">{item.newValue}</span>
                        {item.oldMargin && item.newMargin && (
                          <p className="text-xs text-muted-foreground">
                            Marge: {item.oldMargin} → <span className="text-emerald-600">{item.newMargin}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                  {preview.length > 200 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground text-center bg-muted/30">
                      + {preview.length - 200} autres produits
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <Icon name="ExclamationCircleIcon" size={15} />
                  {error}
                </div>
              )}
            </div>
          )}

          {/* Applying step */}
          {step === 'applying' && (
            <div className="p-8 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Icon name="ArrowPathIcon" size={24} className="text-primary animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-600 text-foreground">Application en cours…</p>
                <p className="text-sm text-muted-foreground mt-1">{progress}% — {Math.round(products.length * progress / 100)} / {products.length} produits</p>
              </div>
              <div className="w-full max-w-xs bg-muted rounded-full h-2">
                <div className="bg-primary h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Done step */}
          {step === 'done' && (
            <div className="p-8 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Icon name="CheckCircleIcon" size={28} className="text-emerald-600" />
              </div>
              <div className="text-center">
                <p className="font-600 text-foreground">Modification appliquée !</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {products.length} produit{products.length > 1 ? 's' : ''} mis à jour avec succès.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(step === 'config' || step === 'preview') && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border shrink-0 bg-muted/20">
            {step === 'config' ? (
              <>
                <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Annuler
                </button>
                <button
                  onClick={handlePreview}
                  className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Icon name="EyeIcon" size={15} />
                  Prévisualiser les changements
                </button>
              </>
            ) : (
              <>
                <button onClick={() => setStep('config')} className="flex items-center gap-1.5 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <Icon name="ArrowLeftIcon" size={14} />
                  Retour
                </button>
                <button
                  onClick={handleApply}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
                >
                  <Icon name="CheckIcon" size={15} />
                  Confirmer et appliquer
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
