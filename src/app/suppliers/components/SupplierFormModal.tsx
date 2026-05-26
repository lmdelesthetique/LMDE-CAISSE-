'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { supplierService, Supplier, SupplierReliability } from '@/lib/services/supplierService';
import { createClient } from '@/lib/supabase/client';

interface Props {
  supplier?: Supplier;
  onClose: () => void;
  onSaved: () => void;
}

const COUNTRIES = ['Chine', 'France', 'Italie', 'Espagne', 'Allemagne', 'Corée du Sud', 'Japon', 'USA', 'Autre'];
const LANGUAGES = ['Chinois', 'Français', 'Anglais', 'Chinois / Anglais', 'Coréen', 'Japonais', 'Espagnol', 'Autre'];
const RELIABILITY_OPTIONS: { value: SupplierReliability; label: string }[] = [
  { value: 'unknown', label: 'Inconnu' },
  { value: 'poor', label: 'Faible' },
  { value: 'average', label: 'Moyen' },
  { value: 'good', label: 'Bon' },
  { value: 'excellent', label: 'Excellent' },
];

interface PortalCredentials {
  pin: string;
  supplierName: string;
}

function CredentialsModal({ credentials, onClose }: { credentials: PortalCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const portalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/supplier-portal/login`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-md">
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Icon name="CheckCircleIcon" size={22} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-700 text-foreground">Fournisseur créé avec succès</h3>
              <p className="text-xs text-muted-foreground">Code PIN d'accès portail généré</p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Accès portail fournisseur</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-lg px-3 py-3 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1">Code PIN à 6 chiffres</p>
                  <p className="text-2xl font-700 font-mono tracking-widest text-foreground">{credentials.pin}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(credentials.pin, 'pin')}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Copier le PIN"
                >
                  <Icon name={copied === 'pin' ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={16} />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-lg px-3 py-2">
                  <p className="text-[10px] text-muted-foreground mb-0.5">URL du portail</p>
                  <p className="text-sm font-mono text-foreground truncate">{portalUrl}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(portalUrl, 'url')}
                  className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Copier l'URL"
                >
                  <Icon name={copied === 'url' ? 'CheckIcon' : 'ClipboardDocumentIcon'} size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => copyToClipboard(
                `Portail fournisseur LMDE\nFournisseur: ${credentials.supplierName}\nURL: ${portalUrl}\nCode PIN: ${credentials.pin}`,
                'all'
              )}
              className="flex items-center justify-center gap-2 border border-border rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Icon name={copied === 'all' ? 'CheckIcon' : 'ClipboardDocumentListIcon'} size={15} />
              {copied === 'all' ? 'Copié !' : 'Tout copier'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Portail fournisseur LMDE\nFournisseur: ${credentials.supplierName}\nURL: ${portalUrl}\nCode PIN: ${credentials.pin}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors"
            >
              <Icon name="ChatBubbleLeftRightIcon" size={15} />
              WhatsApp
            </a>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="w-full bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SupplierFormModal({ supplier, onClose, onSaved }: Props) {
  const supabase = createClient();
  const isEdit = !!supplier;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(supplier?.categories || []);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    supabase
      .from('products')
      .select('category')
      .not('category', 'is', null)
      .order('category')
      .then(({ data }) => {
        const unique = Array.from(new Set((data || []).map((r: any) => r.category).filter(Boolean))) as string[];
        setCategories(unique);
      });
  }, []);
  const [createdCredentials, setCreatedCredentials] = useState<PortalCredentials | null>(null);

  const [form, setForm] = useState({
    companyName: supplier?.companyName || '',
    contactName: supplier?.contactName || '',
    email: supplier?.email || '',
    phone: supplier?.phone || '',
    whatsapp: supplier?.whatsapp || '',
    wechat: supplier?.wechat || '',
    address: supplier?.address || '',
    country: supplier?.country || 'Chine',
    language: supplier?.language || 'Chinois',
    website: supplier?.website || '',
    alibabaLink: supplier?.alibabaLink || '',
    bankDetails: supplier?.bankDetails || '',
    paymentConditions: supplier?.paymentConditions || '',
    productionDelayDays: supplier?.productionDelayDays || 14,
    shippingDelayDays: supplier?.shippingDelayDays || 21,
    minimumOrder: supplier?.minimumOrder || '',
    notes: supplier?.notes || '',
    reliability: supplier?.reliability || 'unknown' as SupplierReliability,
  });

  const set = (key: string, value: any) => setForm((p) => ({ ...p, [key]: value }));

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) { setError('Le nom de l\'entreprise est requis'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { ...form, categories: selectedCategories };
      if (isEdit && supplier) {
        await supplierService.update(supplier.id, payload);
        onSaved();
      } else {
        const created = await supplierService.create(payload);
        if (created && created.portalLogin) {
          setCreatedCredentials({
            pin: created.portalLogin,
            supplierName: created.companyName,
          });
        } else {
          onSaved();
        }
      }
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleCredentialsClose = () => {
    setCreatedCredentials(null);
    onSaved();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
            <div>
              <h2 className="font-700 text-foreground text-lg">{isEdit ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}</h2>
              {!isEdit && (
                <p className="text-xs text-muted-foreground mt-0.5">Un code PIN portail sera généré automatiquement</p>
              )}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <Icon name="XMarkIcon" size={18} />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">{error}</div>
            )}

            {/* Existing portal credentials (edit mode) */}
            {isEdit && supplier?.portalLogin && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-xs font-600 text-blue-800 mb-1">Accès portail existant</p>
                <p className="text-xs text-blue-700">Code PIN : <span className="font-mono font-700 tracking-widest">{supplier.portalLogin}</span></p>
              </div>
            )}

            {/* Identité */}
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Identité</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">Nom de l'entreprise *</label>
                  <input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ex: Guangzhou Nail Art Co." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Contact principal</label>
                  <input value={form.contactName} onChange={(e) => set('contactName', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Prénom Nom" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Fiabilité</label>
                  <select value={form.reliability} onChange={(e) => set('reliability', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {RELIABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Pays</label>
                  <select value={form.country} onChange={(e) => set('country', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Langue</label>
                  <select value={form.language} onChange={(e) => set('language', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Contact */}
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Contact</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="contact@fournisseur.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Téléphone</label>
                  <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="+86 138 0000 0000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">WhatsApp</label>
                  <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="+86 138 0000 0000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">WeChat</label>
                  <input value={form.wechat} onChange={(e) => set('wechat', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="ID WeChat" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Site internet</label>
                  <input value={form.website} onChange={(e) => set('website', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Lien Alibaba / 1688</label>
                  <input value={form.alibabaLink} onChange={(e) => set('alibabaLink', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="https://alibaba.com/..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-foreground mb-1">Adresse</label>
                  <input value={form.address} onChange={(e) => set('address', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Adresse complète" />
                </div>
              </div>
            </div>

            {/* Conditions commerciales */}
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Conditions commerciales</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Délai production (j)</label>
                  <input type="number" value={form.productionDelayDays} onChange={(e) => set('productionDelayDays', Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Délai expédition (j)</label>
                  <input type="number" value={form.shippingDelayDays} onChange={(e) => set('shippingDelayDays', Number(e.target.value))} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Minimum de commande</label>
                  <input value={form.minimumOrder} onChange={(e) => set('minimumOrder', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ex: 500 USD" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-foreground mb-1">Conditions de paiement</label>
                  <input value={form.paymentConditions} onChange={(e) => set('paymentConditions', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" placeholder="Ex: 30% acompte, 70% avant expédition" />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-foreground mb-1">Coordonnées bancaires / RIB</label>
                  <textarea value={form.bankDetails} onChange={(e) => set('bankDetails', e.target.value)} rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="IBAN, BIC, coordonnées Wise..." />
                </div>
              </div>
            </div>

            {/* Catégories */}
            <div>
              <p className="text-xs font-600 uppercase tracking-widest text-muted-foreground mb-3">Catégories fournies</p>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      selectedCategories.includes(cat)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-white text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">Notes internes</label>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" placeholder="Informations importantes sur ce fournisseur..." />
            </div>

            {/* Portal credentials info */}
            {!isEdit && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
                <div className="flex items-start gap-2">
                  <Icon name="KeyIcon" size={15} className="text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-600 text-primary">Accès portail fournisseur</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Un code PIN à 6 chiffres sera généré automatiquement et affiché après la création.</p>
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              Annuler
            </button>
            <button
              onClick={handleSubmit as any}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-5 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {isEdit ? 'Enregistrer' : 'Créer le fournisseur'}
            </button>
          </div>
        </div>
      </div>

      {createdCredentials && (
        <CredentialsModal credentials={createdCredentials} onClose={handleCredentialsClose} />
      )}
    </>
  );
}
