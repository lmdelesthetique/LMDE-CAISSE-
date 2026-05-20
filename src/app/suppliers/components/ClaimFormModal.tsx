'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';
import { supplierService, SupplierOrder, ClaimType, ClaimAction } from '@/lib/services/supplierService';

interface Props {
  supplierId: string;
  orders: SupplierOrder[];
  onClose: () => void;
  onSaved: () => void;
}

const CLAIM_TYPES: { value: ClaimType; label: string }[] = [
  { value: 'defective', label: 'Produit défectueux' },
  { value: 'wrong_color', label: 'Mauvaise couleur' },
  { value: 'wrong_reference', label: 'Mauvaise référence' },
  { value: 'bad_quality', label: 'Mauvaise qualité' },
  { value: 'broken', label: 'Produit cassé' },
  { value: 'wrong_packaging', label: 'Mauvais packaging' },
  { value: 'missing_quantity', label: 'Quantité manquante' },
  { value: 'other', label: 'Autre' },
];

const CLAIM_ACTIONS: { value: ClaimAction; label: string }[] = [
  { value: 'refund', label: 'Remboursement' },
  { value: 'credit', label: 'Avoir' },
  { value: 'replacement', label: 'Remplacement' },
  { value: 'future_modification', label: 'Modification future' },
];

export default function ClaimFormModal({ supplierId, orders, onClose, onSaved }: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    orderId: '',
    claimType: 'defective' as ClaimType,
    requestedAction: 'refund' as ClaimAction,
    productName: '',
    description: '',
    affectedQuantity: 1,
    estimatedLoss: 0,
  });

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.description.trim()) { setError('La description est requise'); return; }
    setSaving(true);
    setError(null);
    try {
      await supplierService.createClaim({
        supplierId,
        orderId: form.orderId || undefined,
        claimType: form.claimType,
        claimStatus: 'draft',
        requestedAction: form.requestedAction,
        productName: form.productName,
        description: form.description,
        affectedQuantity: Number(form.affectedQuantity),
        estimatedLoss: Number(form.estimatedLoss),
        photoUrls: [],
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-700 text-foreground text-lg">Nouvelle réclamation</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors"><Icon name="XMarkIcon" size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">
          {error && <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Type de problème</label>
              <select value={form.claimType} onChange={(e) => set('claimType', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                {CLAIM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Action demandée</label>
              <select value={form.requestedAction} onChange={(e) => set('requestedAction', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                {CLAIM_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Commande concernée (optionnel)</label>
            <select value={form.orderId} onChange={(e) => set('orderId', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
              <option value="">— Aucune commande spécifique —</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.orderNumber}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Produit concerné</label>
            <input value={form.productName} onChange={(e) => set('productName', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Nom du produit" />
          </div>

          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Description du problème *</label>
            <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={4} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Décrivez le problème en détail..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Quantité concernée</label>
              <input type="number" min="1" value={form.affectedQuantity} onChange={(e) => set('affectedQuantity', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Perte estimée (€)</label>
              <input type="number" min="0" step="0.01" value={form.estimatedLoss} onChange={(e) => set('estimatedLoss', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
            <Icon name="InformationCircleIcon" size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">Vous pourrez ajouter des photos preuves après la création de la réclamation.</p>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Annuler</button>
          <button onClick={handleSubmit as any} disabled={saving} className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60">
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Créer la réclamation
          </button>
        </div>
      </div>
    </div>
  );
}
