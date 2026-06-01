'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';
import { clientService, type Client, type CreateClientInput } from '@/lib/services/clientService';

interface ClientFormModalProps {
  client?: Client | null;
  onClose: () => void;
  onSaved: (client: Client) => void;
}

const GENDER_OPTIONS = [
  { value: 'female', label: 'Femme' },
  { value: 'male', label: 'Homme' },
  { value: 'other', label: 'Autre' },
  { value: 'not_specified', label: 'Non précisé' },
];

const CLIENT_TYPE_OPTIONS = [
  { value: 'particulier', label: 'Particulier' },
  { value: 'professionnel', label: 'Professionnel' },
  { value: 'vip', label: 'VIP' },
  { value: 'abonne', label: 'Abonné' },
  { value: 'non_abonne', label: 'Non abonné' },
];

const DISCOUNT_TYPE_OPTIONS = [
  { value: '', label: 'Aucune remise' },
  { value: 'pro_5', label: 'Pro -5%' },
  { value: 'pro_10', label: 'Pro -10%' },
  { value: 'pro_15', label: 'Pro -15%' },
  { value: 'vip', label: 'Avantages VIP' },
  { value: 'classic', label: 'Fidélité classique' },
  { value: 'custom', label: 'Remise personnalisée' },
];

export default function ClientFormModal({ client, onClose, onSaved }: ClientFormModalProps) {
  const isEdit = !!client;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<CreateClientInput & { loyaltyDiscountValue: number }>({
    firstName: client?.firstName ?? '',
    lastName: client?.lastName ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    whatsapp: client?.whatsapp ?? '',
    dateOfBirth: client?.dateOfBirth ?? '',
    gender: client?.gender ?? 'not_specified',
    address: client?.address ?? '',
    city: client?.city ?? '',
    postalCode: client?.postalCode ?? '',
    country: client?.country ?? 'France',
    notes: client?.notes ?? '',
    clientType: client?.clientType ?? 'particulier',
    loyaltyDiscountType: client?.loyaltyDiscountType ?? null,
    loyaltyDiscountValue: client?.loyaltyDiscountValue ?? 0,
  });

  const set = (field: string, value: any) => setForm((p) => ({ ...p, [field]: value }));

  const showDiscountValue = form.loyaltyDiscountType === 'custom' || form.loyaltyDiscountType === 'vip' || form.loyaltyDiscountType === 'classic';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    setLoading(true);
    try {
      let saved: Client | null = null;
      const payload: CreateClientInput = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone?.trim() || undefined,
        whatsapp: form.whatsapp?.trim() || undefined,
        email: form.email?.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender,
        address: form.address?.trim() || undefined,
        city: form.city?.trim() || undefined,
        postalCode: form.postalCode?.trim() || undefined,
        country: form.country || 'France',
        notes: form.notes?.trim() || undefined,
        clientType: form.clientType,
        loyaltyDiscountType: (form.loyaltyDiscountType || null) as any,
        loyaltyDiscountValue: form.loyaltyDiscountValue,
      };
      if (isEdit && client) {
        saved = await clientService.update(client.id, payload);
      } else {
        saved = await clientService.create(payload);
      }
      if (saved) {
        toast.success(isEdit ? 'Client enregistré' : 'Client créé');
        onSaved(saved);
      } else {
        toast.error('Erreur lors de l\'enregistrement — vérifiez la console');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-[16px] font-700 text-foreground">
            {isEdit ? 'Modifier le client' : 'Nouveau client'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Prénom *</label>
              <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Nom *</label>
              <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Type de client</label>
              <select value={form.clientType} onChange={(e) => set('clientType', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {CLIENT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Genre</label>
              <select value={form.gender} onChange={(e) => set('gender', e.target.value as any)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
                {GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Téléphone</label>
              <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="06 00 00 00 00"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">WhatsApp</label>
              <input value={form.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="06 00 00 00 00"
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Email</label>
            <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="client@email.com"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          {/* Loyalty discount */}
          <div className="border border-border rounded-xl p-3 space-y-2 bg-muted/20">
            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Remise fidélité</p>
            <select value={form.loyaltyDiscountType ?? ''} onChange={(e) => set('loyaltyDiscountType', e.target.value || null)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white">
              {DISCOUNT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {showDiscountValue && (
              <div className="flex items-center gap-2">
                <input type="number" min={0} max={100} value={form.loyaltyDiscountValue}
                  onChange={(e) => set('loyaltyDiscountValue', parseFloat(e.target.value) || 0)}
                  placeholder="Ex: 10"
                  className="w-24 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                <span className="text-sm text-muted-foreground">% de remise</span>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Date de naissance</label>
            <input type="date" value={form.dateOfBirth ?? ''} onChange={(e) => set('dateOfBirth', e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Adresse</label>
            <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Rue, numéro..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Code postal</label>
              <input value={form.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Ville</label>
              <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
            </div>
          </div>

          <div>
            <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide block mb-1">Notes internes</label>
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={2} placeholder="Préférences, informations importantes..."
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
          </div>
        </form>

        <div className="flex gap-3 px-6 pb-6 pt-4 border-t border-border shrink-0">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-border rounded-xl text-sm font-600 text-muted-foreground hover:bg-muted transition-colors">
            Annuler
          </button>
          <button type="button" onClick={handleSubmit as any} disabled={loading || !form.firstName.trim() || !form.lastName.trim()}
            className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading ? <><Icon name="ArrowPathIcon" size={14} className="animate-spin" />Enregistrement…</> : <><Icon name="CheckIcon" size={14} />{isEdit ? 'Enregistrer' : 'Créer le client'}</>}
          </button>
        </div>
      </div>
    </div>
  );
}
