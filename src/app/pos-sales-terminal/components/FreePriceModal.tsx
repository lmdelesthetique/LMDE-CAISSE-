'use client';

import React, { useState } from 'react';
import Icon from '@/components/ui/AppIcon';

interface FreePriceModalProps {
  onClose: () => void;
  onConfirm: (name: string, price: number) => void;
}

export default function FreePriceModal({ onClose, onConfirm }: FreePriceModalProps) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) { setError('Le nom du produit est requis.'); return; }
    const p = parseFloat(price);
    if (!p || p <= 0) { setError('Le prix doit être supérieur à 0.'); return; }
    onConfirm(name.trim(), p);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-sm mx-4 animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Icon name="TagIcon" size={16} className="text-violet-600" />
            </div>
            <h2 className="text-[15px] font-700 text-foreground">Produit à prix libre</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">
              Nom du produit <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(''); }}
              placeholder="Ex: Prestation personnalisée"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1.5">
              Prix TTC (€) <span className="text-destructive">*</span>
            </label>
            <input
              type="number"
              value={price}
              onChange={(e) => { setPrice(e.target.value); setError(''); }}
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <Icon name="ExclamationTriangleIcon" size={14} />
              {error}
            </div>
          )}

          <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5">
            <p className="text-xs text-violet-700 font-500">
              Ce produit sera affiché avec la mention <span className="font-700">"Produit à prix libre"</span> sur le ticket.
            </p>
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl text-sm font-700 hover:bg-violet-700 transition-colors active:scale-95"
          >
            Ajouter au panier
          </button>
        </div>
      </div>
    </div>
  );
}
