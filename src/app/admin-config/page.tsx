'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';

type Tab = 'company' | 'payment' | 'tva' | 'receipt' | 'magasin' | 'fournisseurs';

// ── Types ──────────────────────────────────────────────────────────────────────

interface CompanyInfo {
  name: string;
  legalName: string;
  siret: string;
  rcs: string;
  legalForm: string;
  capital: string;
  owner: string;
  tvaNumber: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logo: string;
}

interface PaymentMethod {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  fees: number;
  minAmount: number;
  maxAmount: number;
}

interface TVARate {
  id: string;
  label: string;
  rate: number;
  isDefault: boolean;
  description: string;
}

interface ReceiptTemplate {
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showTVADetails: boolean;
  showBarcode: boolean;
  showPoints: boolean;
  showNextTier: boolean;
  thankYouMessage: string;
  fontSize: 'small' | 'medium' | 'large';
  paperWidth: '58mm' | '80mm';
}

interface MagasinSettings {
  storeName: string;
  storeCode: string;
  openingHours: { day: string; open: string; close: string; closed: boolean }[];
  currency: string;
  timezone: string;
  language: string;
  taxIncluded: boolean;
  autoBackup: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lowStockAlert: number;
}

// ── Default Data ───────────────────────────────────────────────────────────────

const defaultCompany: CompanyInfo = {
  name: 'LE MONDE DE L\'ESTHETIQUE',
  legalName: 'LE MONDE DE L\'ESTHETIQUE',
  siret: '927 747 725',
  rcs: '927 747 725 Fort-de-France',
  legalForm: 'SAS (Société par actions simplifiée)',
  capital: '100,00 Euros',
  owner: 'L\'HOMME Christy Aurélie Miriam',
  tvaNumber: 'FR71 927747 725',
  address: 'Baie des Flamands Appt 306 9 avenue Loulou Boislaville',
  city: 'Fort-de-France',
  postalCode: '97200',
  country: 'France',
  phone: '',
  email: '',
  website: '',
  logo: '',
};

const defaultPaymentMethods: PaymentMethod[] = [
  { id: 'cash', label: 'Espèces', icon: '💵', enabled: true, fees: 0, minAmount: 0, maxAmount: 999999 },
  { id: 'card', label: 'Carte bancaire', icon: '💳', enabled: true, fees: 0, minAmount: 1, maxAmount: 999999 },
  { id: 'check', label: 'Chèque', icon: '📝', enabled: true, fees: 0, minAmount: 0, maxAmount: 999999 },
  { id: 'transfer', label: 'Virement', icon: '🏦', enabled: false, fees: 0, minAmount: 50, maxAmount: 999999 },
  { id: 'voucher', label: 'Bon cadeau', icon: '🎁', enabled: true, fees: 0, minAmount: 0, maxAmount: 500 },
  { id: 'loyalty', label: 'Points fidélité', icon: '⭐', enabled: true, fees: 0, minAmount: 0, maxAmount: 200 },
];

const defaultTVARates: TVARate[] = [
  { id: 'tva-20', label: 'TVA 20%', rate: 20, isDefault: true, description: 'Taux normal — produits cosmétiques, accessoires' },
  { id: 'tva-10', label: 'TVA 10%', rate: 10, isDefault: false, description: 'Taux intermédiaire — certains services' },
  { id: 'tva-5.5', label: 'TVA 5,5%', rate: 5.5, isDefault: false, description: 'Taux réduit — produits essentiels' },
  { id: 'tva-2.1', label: 'TVA 2,1%', rate: 2.1, isDefault: false, description: 'Taux super réduit — médicaments remboursables' },
  { id: 'tva-0', label: 'Exonéré', rate: 0, isDefault: false, description: 'Exonération de TVA' },
];

const defaultReceipt: ReceiptTemplate = {
  headerText: 'LE MONDE DE L\'ESTHETIQUE\nBaie des Flamands Appt 306 9 avenue Loulou Boislaville\n97200 Fort-de-France\nTVA : FR71 927747 725',
  footerText: 'Conservez ce ticket pour tout échange.\nRCS Fort-de-France 927 747 725',
  showLogo: true,
  showTVADetails: true,
  showBarcode: true,
  showPoints: true,
  showNextTier: true,
  thankYouMessage: '✨ Merci et à très bientôt !',
  fontSize: 'medium',
  paperWidth: '80mm',
};

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const defaultMagasin: MagasinSettings = {
  storeName: 'BeautyPOS Paris',
  storeCode: 'BP-001',
  openingHours: DAYS_FR.map((day, i) => ({
    day,
    open: '09:00',
    close: '19:00',
    closed: i === 6,
  })),
  currency: 'EUR',
  timezone: 'Europe/Paris',
  language: 'fr',
  taxIncluded: true,
  autoBackup: true,
  backupFrequency: 'daily',
  lowStockAlert: 5,
};

// ── Section: Company Info ──────────────────────────────────────────────────────

function CompanySection({ data, onChange }: { data: CompanyInfo; onChange: (d: CompanyInfo) => void }) {
  const field = (key: keyof CompanyInfo, label: string, placeholder?: string, type = 'text') => (
    <div>
      <label className="block text-xs font-500 text-muted-foreground mb-1">{label}</label>
      <input
        type={type}
        value={data[key] as string}
        onChange={(e) => onChange({ ...data, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon name="BuildingStorefrontIcon" size={13} className="text-primary" />
          </span>
          Identité de l'entreprise
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('name', 'Nom commercial', 'LE MONDE DE L\'ESTHETIQUE')}
          {field('legalName', 'Raison sociale', 'LE MONDE DE L\'ESTHETIQUE')}
          {field('legalForm', 'Forme juridique', 'SAS')}
          {field('capital', 'Capital social', '100,00 Euros')}
          {field('rcs', 'N° RCS', '927 747 725 Fort-de-France')}
          {field('siret', 'SIRET / Immatriculation', '927 747 725')}
          {field('tvaNumber', 'N° TVA intracommunautaire', 'FR71 927747 725')}
          {field('owner', 'Dirigeant / Président(e)', 'L\'HOMME Christy Aurélie Miriam')}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
            <Icon name="MapPinIcon" size={13} className="text-blue-500" />
          </span>
          Adresse
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">{field('address', 'Adresse', 'aie des Flamands Appt 306 9 avenue Loulou Boislaville')}</div>
          {field('postalCode', 'Code postal', '97200')}
          {field('city', 'Ville', 'Fort-de-France')}
          {field('country', 'Pays', 'France')}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
            <Icon name="PhoneIcon" size={13} className="text-emerald-500" />
          </span>
          Contact
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {field('phone', 'Téléphone', '+596 ...', 'tel')}
          {field('email', 'Email', 'contact@lemondeesthetique.fr', 'email')}
          {field('website', 'Site web', 'www.lemondeesthetique.fr')}
        </div>
      </div>

      {/* Legal summary card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-xs font-700 text-primary mb-3 flex items-center gap-2">
          <Icon name="DocumentTextIcon" size={13} className="text-primary" />
          Récapitulatif légal (aperçu documents)
        </h3>
        <div className="text-xs text-foreground space-y-1 font-mono">
          <p className="font-700">{data.legalName || '—'}</p>
          {data.legalForm && <p>{data.legalForm} — Capital : {data.capital}</p>}
          {data.address && <p>{data.address}, {data.postalCode} {data.city}</p>}
          {data.rcs && <p>RCS {data.rcs}</p>}
          {data.tvaNumber && <p>TVA : {data.tvaNumber}</p>}
          {data.owner && <p>Présidente : {data.owner}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Section: Payment Methods ───────────────────────────────────────────────────

function PaymentSection({ methods, onChange }: { methods: PaymentMethod[]; onChange: (m: PaymentMethod[]) => void }) {
  const update = (id: string, patch: Partial<PaymentMethod>) => {
    onChange(methods.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-4">
        Activez ou désactivez les modes de paiement acceptés en caisse. Configurez les frais et limites par méthode.
      </p>
      {methods.map((method) => (
        <div
          key={method.id}
          className={`border rounded-xl p-4 transition-all ${method.enabled ? 'border-border bg-background' : 'border-border/50 bg-muted/30 opacity-60'}`}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">{method.icon}</span>
              <span className="text-sm font-600 text-foreground">{method.label}</span>
            </div>
            <button
              onClick={() => update(method.id, { enabled: !method.enabled })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${method.enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span
                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${method.enabled ? 'translate-x-4.5' : 'translate-x-0.5'}`}
              />
            </button>
          </div>
          {method.enabled && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-500 text-muted-foreground mb-1">Frais (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={method.fees}
                  onChange={(e) => update(method.id, { fees: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-500 text-muted-foreground mb-1">Montant min (€)</label>
                <input
                  type="number"
                  min={0}
                  value={method.minAmount}
                  onChange={(e) => update(method.id, { minAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-[10px] font-500 text-muted-foreground mb-1">Montant max (€)</label>
                <input
                  type="number"
                  min={0}
                  value={method.maxAmount}
                  onChange={(e) => update(method.id, { maxAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Section: TVA Rates ─────────────────────────────────────────────────────────

function TVASection({ rates, onChange }: { rates: TVARate[]; onChange: (r: TVARate[]) => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newRate, setNewRate] = useState<Omit<TVARate, 'id'>>({ label: '', rate: 0, isDefault: false, description: '' });

  const setDefault = (id: string) => {
    onChange(rates.map((r) => ({ ...r, isDefault: r.id === id })));
  };

  const remove = (id: string) => {
    onChange(rates.filter((r) => r.id !== id));
  };

  const add = () => {
    if (!newRate.label || newRate.rate < 0) return;
    const id = `tva-${Date.now()}`;
    const updated = newRate.isDefault
      ? rates.map((r) => ({ ...r, isDefault: false }))
      : [...rates];
    onChange([...updated, { ...newRate, id }]);
    setNewRate({ label: '', rate: 0, isDefault: false, description: '' });
    setShowAdd(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-4">
        Gérez les taux de TVA applicables. Le taux par défaut est appliqué automatiquement aux nouveaux produits.
      </p>
      {rates.map((rate) => (
        <div key={rate.id} className="flex items-center gap-4 border border-border rounded-xl p-4 bg-background">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-600 text-foreground">{rate.label}</span>
              {rate.isDefault && (
                <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Défaut
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{rate.description}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-lg font-700 text-foreground">{rate.rate}%</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!rate.isDefault && (
              <button
                onClick={() => setDefault(rate.id)}
                className="text-[11px] px-2 py-1 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                Défaut
              </button>
            )}
            <button
              onClick={() => remove(rate.id)}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              <Icon name="TrashIcon" size={13} />
            </button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <div className="border border-primary/30 rounded-xl p-4 bg-primary/5 space-y-3">
          <h4 className="text-xs font-600 text-foreground">Nouveau taux TVA</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-500 text-muted-foreground mb-1">Libellé</label>
              <input
                type="text"
                value={newRate.label}
                onChange={(e) => setNewRate({ ...newRate, label: e.target.value })}
                placeholder="TVA 8%"
                className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-[10px] font-500 text-muted-foreground mb-1">Taux (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={newRate.rate}
                onChange={(e) => setNewRate({ ...newRate, rate: parseFloat(e.target.value) || 0 })}
                className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[10px] font-500 text-muted-foreground mb-1">Description</label>
              <input
                type="text"
                value={newRate.description}
                onChange={(e) => setNewRate({ ...newRate, description: e.target.value })}
                placeholder="Description du taux..."
                className="w-full px-2 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newRate.isDefault}
                onChange={(e) => setNewRate({ ...newRate, isDefault: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-border text-primary focus:ring-primary/30"
              />
              <span className="text-xs text-muted-foreground">Définir comme taux par défaut</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={add}
              className="px-3 py-1.5 text-xs font-600 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              Ajouter
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-3 py-1.5 text-xs font-500 border border-border text-muted-foreground rounded-lg hover:bg-muted transition-colors"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-border rounded-xl text-xs font-500 text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
        >
          <Icon name="PlusIcon" size={13} />
          Ajouter un taux TVA
        </button>
      )}
    </div>
  );
}

// ── Section: Receipt Template ──────────────────────────────────────────────────

function ReceiptSection({ template, onChange }: { template: ReceiptTemplate; onChange: (t: ReceiptTemplate) => void }) {
  const toggle = (key: keyof ReceiptTemplate) => {
    onChange({ ...template, [key]: !template[key as keyof ReceiptTemplate] });
  };

  const toggleItem = (label: string, key: keyof ReceiptTemplate, description: string) => (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div>
        <p className="text-sm font-500 text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        onClick={() => toggle(key)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${template[key] ? 'bg-primary' : 'bg-muted-foreground/30'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${template[key] ? 'translate-x-4.5' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Config */}
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-amber-50 flex items-center justify-center">
                <Icon name="DocumentTextIcon" size={13} className="text-amber-500" />
              </span>
              Textes du ticket
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">En-tête du ticket</label>
                <textarea
                  rows={3}
                  value={template.headerText}
                  onChange={(e) => onChange({ ...template, headerText: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Pied de page</label>
                <textarea
                  rows={3}
                  value={template.footerText}
                  onChange={(e) => onChange({ ...template, footerText: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Message de remerciement</label>
                <input
                  type="text"
                  value={template.thankYouMessage}
                  onChange={(e) => onChange({ ...template, thankYouMessage: e.target.value })}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
                <Icon name="AdjustmentsHorizontalIcon" size={13} className="text-purple-500" />
              </span>
              Format d'impression
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Largeur papier</label>
                <select
                  value={template.paperWidth}
                  onChange={(e) => onChange({ ...template, paperWidth: e.target.value as ReceiptTemplate['paperWidth'] })}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="58mm">58 mm</option>
                  <option value="80mm">80 mm</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-500 text-muted-foreground mb-1">Taille de police</label>
                <select
                  value={template.fontSize}
                  onChange={(e) => onChange({ ...template, fontSize: e.target.value as ReceiptTemplate['fontSize'] })}
                  className="w-full px-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                >
                  <option value="small">Petite</option>
                  <option value="medium">Normale</option>
                  <option value="large">Grande</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-600 text-foreground mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
                <Icon name="EyeIcon" size={13} className="text-emerald-500" />
              </span>
              Éléments affichés
            </h3>
            <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
              {toggleItem('Logo de l\'entreprise', 'showLogo', 'Afficher le logo en haut du ticket')}
              {toggleItem('Détails TVA', 'showTVADetails', 'Afficher le détail des taxes par ligne')}
              {toggleItem('Code-barres / QR code', 'showBarcode', 'Ajouter un code-barres de traçabilité')}
              {toggleItem('Points fidélité', 'showPoints', 'Afficher les points gagnés et le solde')}
              {toggleItem('Prochain palier fidélité', 'showNextTier', 'Afficher la progression vers la prochaine récompense')}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div>
          <h3 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center">
              <Icon name="PrinterIcon" size={13} className="text-slate-500" />
            </span>
            Aperçu du ticket
          </h3>
          <div className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div
              className={`mx-auto font-mono bg-white border border-dashed border-slate-200 rounded p-3 space-y-1 ${template.paperWidth === '58mm' ? 'max-w-[160px]' : 'max-w-[220px]'} ${template.fontSize === 'small' ? 'text-[9px]' : template.fontSize === 'large' ? 'text-[12px]' : 'text-[10px]'}`}
            >
              {template.showLogo && (
                <div className="text-center font-bold border-b border-dashed border-slate-200 pb-1 mb-1">
                  🌸 BeautyPOS
                </div>
              )}
              <div className="text-center whitespace-pre-wrap text-slate-600 border-b border-dashed border-slate-200 pb-1 mb-1">
                {template.headerText}
              </div>
              <div className="border-b border-dashed border-slate-200 pb-1 mb-1">
                <div className="flex justify-between"><span>Produit A</span><span>25,00€</span></div>
                <div className="flex justify-between"><span>Produit B</span><span>12,50€</span></div>
                {template.showTVADetails && (
                  <div className="text-slate-400 mt-0.5">
                    <div className="flex justify-between"><span>TVA 20%</span><span>6,25€</span></div>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold border-b border-dashed border-slate-200 pb-1 mb-1">
                <span>TOTAL</span><span>37,50€</span>
              </div>
              {template.showPoints && (
                <div className="text-slate-500 border-b border-dashed border-slate-200 pb-1 mb-1">
                  <div>⭐ +37 points gagnés</div>
                  <div>Total : 412 pts</div>
                </div>
              )}
              {template.showNextTier && (
                <div className="text-slate-500 border-b border-dashed border-slate-200 pb-1 mb-1">
                  <div>🎁 Encore 88 pts → cadeau</div>
                </div>
              )}
              {template.showBarcode && (
                <div className="text-center text-slate-400 border-b border-dashed border-slate-200 pb-1 mb-1">
                  ▌▌▌▌▌▌▌▌▌▌▌▌▌▌▌
                </div>
              )}
              <div className="text-center whitespace-pre-wrap text-slate-600 border-b border-dashed border-slate-200 pb-1 mb-1">
                {template.footerText}
              </div>
              <div className="text-center font-medium">{template.thankYouMessage}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Section: Magasin Settings ──────────────────────────────────────────────────

function MagasinSection({ settings, onChange }: { settings: MagasinSettings; onChange: (s: MagasinSettings) => void }) {
  const updateHours = (index: number, patch: Partial<MagasinSettings['openingHours'][0]>) => {
    const updated = settings.openingHours.map((h, i) => (i === index ? { ...h, ...patch } : h));
    onChange({ ...settings, openingHours: updated });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon name="BuildingStorefrontIcon" size={13} className="text-primary" />
          </span>
          Informations du magasin
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Nom du magasin</label>
            <input
              type="text"
              value={settings.storeName}
              onChange={(e) => onChange({ ...settings, storeName: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Code magasin</label>
            <input
              type="text"
              value={settings.storeCode}
              onChange={(e) => onChange({ ...settings, storeCode: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Devise</label>
            <select
              value={settings.currency}
              onChange={(e) => onChange({ ...settings, currency: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="EUR">EUR — Euro (€)</option>
              <option value="USD">USD — Dollar ($)</option>
              <option value="GBP">GBP — Livre sterling (£)</option>
              <option value="MAD">MAD — Dirham marocain</option>
              <option value="TND">TND — Dinar tunisien</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Fuseau horaire</label>
            <select
              value={settings.timezone}
              onChange={(e) => onChange({ ...settings, timezone: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="Europe/Paris">Europe/Paris (UTC+1/+2)</option>
              <option value="Europe/London">Europe/London (UTC+0/+1)</option>
              <option value="Africa/Casablanca">Africa/Casablanca (UTC+1)</option>
              <option value="Africa/Tunis">Africa/Tunis (UTC+1)</option>
              <option value="America/New_York">America/New_York (UTC-5/-4)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Langue</label>
            <select
              value={settings.language}
              onChange={(e) => onChange({ ...settings, language: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-500 text-muted-foreground mb-1">Alerte stock bas (unités)</label>
            <input
              type="number"
              min={1}
              value={settings.lowStockAlert}
              onChange={(e) => onChange({ ...settings, lowStockAlert: parseInt(e.target.value) || 1 })}
              className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-blue-50 flex items-center justify-center">
            <Icon name="ClockIcon" size={13} className="text-blue-500" />
          </span>
          Horaires d'ouverture
        </h3>
        <div className="border border-border rounded-xl overflow-hidden">
          {settings.openingHours.map((h, i) => (
            <div
              key={h.day}
              className={`flex items-center gap-4 px-4 py-2.5 ${i < settings.openingHours.length - 1 ? 'border-b border-border/50' : ''} ${h.closed ? 'bg-muted/30' : 'bg-background'}`}
            >
              <span className={`w-20 text-xs font-600 ${h.closed ? 'text-muted-foreground' : 'text-foreground'}`}>{h.day}</span>
              <button
                onClick={() => updateHours(i, { closed: !h.closed })}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0 ${!h.closed ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${!h.closed ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
              </button>
              {h.closed ? (
                <span className="text-xs text-muted-foreground italic">Fermé</span>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={h.open}
                    onChange={(e) => updateHours(i, { open: e.target.value })}
                    className="px-2 py-1 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="time"
                    value={h.close}
                    onChange={(e) => updateHours(i, { close: e.target.value })}
                    className="px-2 py-1 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center">
            <Icon name="Cog6ToothIcon" size={13} className="text-emerald-500" />
          </span>
          Préférences système
        </h3>
        <div className="border border-border rounded-xl px-4 divide-y divide-border/50">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-500 text-foreground">Prix TTC par défaut</p>
              <p className="text-xs text-muted-foreground">Les prix affichés incluent la TVA</p>
            </div>
            <button
              onClick={() => onChange({ ...settings, taxIncluded: !settings.taxIncluded })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.taxIncluded ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.taxIncluded ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-500 text-foreground">Sauvegarde automatique</p>
              <p className="text-xs text-muted-foreground">Sauvegarder les données automatiquement</p>
            </div>
            <button
              onClick={() => onChange({ ...settings, autoBackup: !settings.autoBackup })}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${settings.autoBackup ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${settings.autoBackup ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {settings.autoBackup && (
            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-500 text-foreground">Fréquence de sauvegarde</p>
                <p className="text-xs text-muted-foreground">Intervalle entre les sauvegardes automatiques</p>
              </div>
              <select
                value={settings.backupFrequency}
                onChange={(e) => onChange({ ...settings, backupFrequency: e.target.value as MagasinSettings['backupFrequency'] })}
                className="px-3 py-1.5 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="daily">Quotidienne</option>
                <option value="weekly">Hebdomadaire</option>
                <option value="monthly">Mensuelle</option>
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section: Fournisseurs / Structure Fees ─────────────────────────────────────

function FournisseursSection() {
  const [structurePct, setStructurePct] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return parseFloat(localStorage.getItem('beautypos_default_structure_pct') || '0');
    }
    return 0;
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('beautypos_default_structure_pct', String(structurePct));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const presets = [
    { label: '25%', value: 25, desc: 'Petite structure' },
    { label: '32%', value: 32, desc: 'Structure moyenne' },
    { label: '40%', value: 40, desc: 'Grande structure' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-600 text-foreground mb-4 flex items-center gap-2">
          <span className="w-6 h-6 rounded-md bg-purple-50 flex items-center justify-center">
            <Icon name="BuildingOfficeIcon" size={13} className="text-purple-600" />
          </span>
          Frais de structure par défaut (%)
        </h3>
        <p className="text-xs text-muted-foreground mb-5">
          Ce pourcentage représente les charges fixes de votre boutique : loyer, salaires, assurance, électricité, logiciels, frais de fonctionnement.
          Il sera automatiquement pré-rempli dans chaque nouvelle commande fournisseur et reste modifiable manuellement.
        </p>

        {/* Presets */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {presets.map((p) => (
            <button
              key={p.value}
              onClick={() => setStructurePct(p.value)}
              className={`border rounded-xl p-4 text-center transition-all ${structurePct === p.value ? 'border-purple-400 bg-purple-50' : 'border-border hover:border-purple-200 hover:bg-purple-50/30'}`}
            >
              <p className={`text-2xl font-700 ${structurePct === p.value ? 'text-purple-700' : 'text-foreground'}`}>{p.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{p.desc}</p>
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-xs font-500 text-muted-foreground mb-1.5">Pourcentage personnalisé</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={structurePct}
                onChange={(e) => setStructurePct(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400 transition-colors"
              />
              <span className="text-sm font-600 text-muted-foreground w-6">%</span>
            </div>
          </div>
          <div className="pt-5">
            <button
              onClick={handleSave}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-600 transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
              <Icon name={saved ? 'CheckIcon' : 'CloudArrowUpIcon'} size={15} />
              {saved ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>

      {/* What's included */}
      <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-5">
        <h4 className="text-sm font-600 text-purple-800 mb-3 flex items-center gap-2">
          <Icon name="InformationCircleIcon" size={15} className="text-purple-600" />
          Ce que couvrent les frais de structure
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { icon: '🏠', label: 'Loyer' },
            { icon: '👥', label: 'Salaires' },
            { icon: '🛡️', label: 'Assurance' },
            { icon: '⚡', label: 'Électricité' },
            { icon: '💻', label: 'Logiciels' },
            { icon: '📦', label: 'Charges fixes' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-sm text-purple-700">
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-xl border border-border bg-background p-5">
        <h4 className="text-sm font-600 text-foreground mb-3 flex items-center gap-2">
          <Icon name="CalculatorIcon" size={15} className="text-primary" />
          Comment ça fonctionne
        </h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs flex items-center justify-center font-700 shrink-0 mt-0.5">1</span>
            <p><span className="font-600 text-foreground">Coût import réel</span> = Produits + Transport + Douane + TVA + Transitaire + Frais bancaires + ...</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-700 shrink-0 mt-0.5">2</span>
            <p><span className="font-600 text-foreground">Frais structure</span> = Coût import réel × {structurePct}%</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-700 shrink-0 mt-0.5">3</span>
            <p><span className="font-600 text-foreground">Coût business réel final</span> = Coût import réel + Frais structure</p>
          </div>
        </div>
        {structurePct > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground">Exemple avec une commande de <span className="font-600 text-foreground">1 000 €</span> de produits :</p>
            <p className="text-xs text-muted-foreground mt-1">
              Frais structure = 1 000 × {structurePct}% = <span className="font-600 text-purple-700">{(1000 * structurePct / 100).toFixed(0)} €</span> → Coût business = <span className="font-600 text-primary">{(1000 + 1000 * structurePct / 100).toFixed(0)} €</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: string; description: string }[] = [
  { id: 'company', label: 'Entreprise', icon: 'BuildingStorefrontIcon', description: 'Informations légales et coordonnées' },
  { id: 'payment', label: 'Paiements', icon: 'CreditCardIcon', description: 'Modes de paiement acceptés' },
  { id: 'tva', label: 'TVA', icon: 'ReceiptPercentIcon', description: 'Taux de TVA applicables' },
  { id: 'receipt', label: 'Tickets', icon: 'PrinterIcon', description: 'Modèles de tickets de caisse' },
  { id: 'magasin', label: 'Magasin', icon: 'MapPinIcon', description: 'Paramètres du point de vente' },
  { id: 'fournisseurs', label: 'Fournisseurs', icon: 'BuildingOfficeIcon', description: 'Frais de structure commandes' },
];

export default function AdminConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>('company');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [company, setCompany] = useState<CompanyInfo>(defaultCompany);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(defaultPaymentMethods);
  const [tvaRates, setTVARates] = useState<TVARate[]>(defaultTVARates);
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplate>(defaultReceipt);
  const [magasin, setMagasin] = useState<MagasinSettings>(defaultMagasin);

  useEffect(() => {
    fetch('/api/ticket-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        try { localStorage.setItem('beautypos_ticket_settings', JSON.stringify(data)); } catch {}
        setReceiptTemplate({
          headerText: data.header_text ?? defaultReceipt.headerText,
          footerText: data.footer_text ?? defaultReceipt.footerText,
          thankYouMessage: data.thank_you_message ?? defaultReceipt.thankYouMessage,
          paperWidth: (data.paper_width ?? defaultReceipt.paperWidth) as '58mm' | '80mm',
          fontSize: (data.font_size ?? defaultReceipt.fontSize) as 'small' | 'medium' | 'large',
          showLogo: data.show_logo ?? defaultReceipt.showLogo,
          showTVADetails: data.show_tva_detail ?? defaultReceipt.showTVADetails,
          showBarcode: data.show_barcode ?? defaultReceipt.showBarcode,
          showPoints: data.show_loyalty_points ?? defaultReceipt.showPoints,
          showNextTier: data.show_next_tier ?? defaultReceipt.showNextTier,
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (activeTab === 'receipt') {
        const body = {
          header_text: receiptTemplate.headerText,
          footer_text: receiptTemplate.footerText,
          thank_you_message: receiptTemplate.thankYouMessage,
          paper_width: receiptTemplate.paperWidth,
          font_size: receiptTemplate.fontSize,
          show_logo: receiptTemplate.showLogo,
          show_tva_detail: receiptTemplate.showTVADetails,
          show_barcode: receiptTemplate.showBarcode,
          show_loyalty_points: receiptTemplate.showPoints,
          show_next_tier: receiptTemplate.showNextTier,
        };
        console.log('[admin-config] saving ticket settings:', body);
        const res = await fetch('/api/ticket-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        let resData: Record<string, unknown> = {};
        try { resData = await res.json(); } catch {}
        console.log('[admin-config] response', res.status, resData);
        if (!res.ok) {
          throw new Error((resData.error as string) || `Erreur HTTP ${res.status}`);
        }
        try { localStorage.setItem('beautypos_ticket_settings', JSON.stringify(body)); } catch {}
      }
      setSaved(true);
      toast.success('✓ Paramètres du ticket enregistrés');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[admin-config save]', msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const activeTabInfo = TABS.find((t) => t.id === activeTab)!;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-700 text-foreground">Configuration Admin</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Paramètres généraux du système BeautyPOS</p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-600 transition-all disabled:opacity-60 ${saved ? 'bg-emerald-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}
            >
              <Icon name={saved ? 'CheckIcon' : 'CloudArrowUpIcon'} size={15} />
              {saving ? 'Enregistrement...' : saved ? 'Enregistré !' : 'Enregistrer'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar tabs */}
          <div className="w-56 shrink-0 border-r border-border bg-white py-4 px-3 space-y-1">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  <Icon
                    name={tab.icon as Parameters<typeof Icon>[0]['name']}
                    size={16}
                    className={`mt-0.5 shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-600 truncate">{tab.label}</p>
                    <p className="text-[10px] leading-tight mt-0.5 truncate opacity-70">{tab.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto">
              <div className="mb-6">
                <h2 className="text-base font-700 text-foreground">{activeTabInfo.label}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{activeTabInfo.description}</p>
              </div>

              {activeTab === 'company' && <CompanySection data={company} onChange={setCompany} />}
              {activeTab === 'payment' && <PaymentSection methods={paymentMethods} onChange={setPaymentMethods} />}
              {activeTab === 'tva' && <TVASection rates={tvaRates} onChange={setTVARates} />}
              {activeTab === 'receipt' && <ReceiptSection template={receiptTemplate} onChange={setReceiptTemplate} />}
              {activeTab === 'magasin' && <MagasinSection settings={magasin} onChange={setMagasin} />}
              {activeTab === 'fournisseurs' && <FournisseursSection />}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
