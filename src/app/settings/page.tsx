'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_SETTINGS, type AppSettings } from '@/contexts/SettingsContext';
import { sha256hex } from '@/contexts/POSAuthContext';

const supabase = createClient();

type SettingsTab = 'company' | 'payment' | 'templates' | 'stock' | 'returns' | 'loyalty' | 'labels' | 'printers' | 'employees' | 'backup' | 'security';

const TABS: { id: SettingsTab; label: string; icon: string; desc: string }[] = [
  { id: 'company', label: 'Entreprise', icon: 'BuildingOfficeIcon', desc: 'Infos légales, logo, contact' },
  { id: 'payment', label: 'Paiements', icon: 'CreditCardIcon', desc: 'Modes de paiement acceptés' },
  { id: 'templates', label: 'Modèles', icon: 'DocumentTextIcon', desc: 'Tickets, factures, devis' },
  { id: 'stock', label: 'Stock', icon: 'ArchiveBoxIcon', desc: 'Alertes, frais structure' },
  { id: 'returns', label: 'Retours', icon: 'ArrowUturnLeftIcon', desc: 'Politique de retour' },
  { id: 'loyalty', label: 'Fidélité', icon: 'StarIcon', desc: 'Points et récompenses' },
  { id: 'labels', label: 'Étiquettes', icon: 'TagIcon', desc: 'Dimensions et format' },
  { id: 'printers', label: 'Imprimantes', icon: 'PrinterIcon', desc: 'Configuration impression' },
  { id: 'backup', label: 'Sauvegardes', icon: 'CloudArrowUpIcon', desc: 'Exports et sauvegardes' },
  { id: 'security', label: 'Sécurité', icon: 'LockClosedIcon', desc: 'Code PIN caisse' },
];

function SettingRow({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-4 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-600 text-foreground">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      <div className="shrink-0 w-64">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-10 h-5 bg-muted rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('company');
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // PIN state
  const [currentPinHash, setCurrentPinHash] = useState<string | null>(null);
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinSaving, setPinSaving] = useState(false);
  const [pinMsg, setPinMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('app_settings').select('*').eq('id', 'main').maybeSingle();
      if (!error && data) {
        const merged = {
          ...DEFAULT_SETTINGS,
          ...data,
          payment_methods: Array.isArray(data.payment_methods) ? data.payment_methods : DEFAULT_SETTINGS.payment_methods,
        };
        setSettings(merged);
        setCurrentPinHash(data.pos_pin_hash ?? null);
        // Cache for receipt generation
        try { localStorage.setItem('beautypos_settings', JSON.stringify(merged)); } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('loadSettings error', e);
    }
    setLoading(false);
  }, []);

  const handleSavePin = async () => {
    setPinMsg(null);
    if (pinNew.length !== 6 || !/^\d{6}$/.test(pinNew)) {
      setPinMsg({ text: 'Le nouveau PIN doit contenir exactement 6 chiffres', ok: false });
      return;
    }
    if (pinNew !== pinConfirm) {
      setPinMsg({ text: 'Les deux codes ne correspondent pas', ok: false });
      return;
    }
    if (currentPinHash) {
      const currentEntered = await sha256hex(pinCurrent);
      if (currentEntered !== currentPinHash) {
        setPinMsg({ text: 'Code PIN actuel incorrect', ok: false });
        return;
      }
    }
    setPinSaving(true);
    try {
      const newHash = await sha256hex(pinNew);
      const { error } = await supabase.from('app_settings').upsert({ id: 'main', pos_pin_hash: newHash });
      if (error) throw error;
      setCurrentPinHash(newHash);
      setPinCurrent(''); setPinNew(''); setPinConfirm('');
      setPinMsg({ text: 'Code PIN mis à jour avec succès ✓', ok: true });
    } catch (e: any) {
      setPinMsg({ text: `Erreur : ${e.message}`, ok: false });
    }
    setPinSaving(false);
  };

  const handleRemovePin = async () => {
    if (!currentPinHash) return;
    const currentEntered = await sha256hex(pinCurrent);
    if (currentEntered !== currentPinHash) {
      setPinMsg({ text: 'Code PIN actuel incorrect', ok: false });
      return;
    }
    setPinSaving(true);
    try {
      const { error } = await supabase.from('app_settings').upsert({ id: 'main', pos_pin_hash: null });
      if (error) throw error;
      setCurrentPinHash(null);
      setPinCurrent(''); setPinNew(''); setPinConfirm('');
      setPinMsg({ text: 'Code PIN supprimé — accès caisse sans PIN', ok: true });
    } catch (e: any) {
      setPinMsg({ text: `Erreur : ${e.message}`, ok: false });
    }
    setPinSaving(false);
  };

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...settings,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('app_settings').upsert({ id: 'main', ...payload });
      if (error) {
        showToast(`Erreur : ${error.message}`, 'error');
      } else {
        // Sync default structure pct to localStorage for order pages
        if (settings.default_structure_pct > 0) {
          localStorage.setItem('beautypos_default_structure_pct', String(settings.default_structure_pct));
        }
        // Cache full settings for receipt generation (POS ticket)
        localStorage.setItem('beautypos_settings', JSON.stringify(settings));
        // Notify all components that settings have changed
        window.dispatchEvent(new CustomEvent('beautypos:settings-updated'));
        showToast('Paramètres sauvegardés avec succès ✓');
      }
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, 'error');
    }
    setSaving(false);
  };

  const update = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const togglePaymentMethod = (id: string) => {
    setSettings(prev => ({
      ...prev,
      payment_methods: prev.payment_methods.map(m => m.id === id ? { ...m, enabled: !m.enabled } : m),
    }));
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white">
          <div>
            <h1 className="text-xl font-700 text-foreground">Paramètres</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Configuration centralisée de votre boutique</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white text-sm font-600 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-60"
          >
            {saving ? <Icon name="ArrowPathIcon" size={15} className="animate-spin" /> : <Icon name="CheckIcon" size={15} />}
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar tabs */}
          <div className="w-56 shrink-0 border-r border-border bg-white overflow-y-auto py-3 px-2">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl mb-1 text-left transition-all ${
                  activeTab === tab.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon name={tab.icon as Parameters<typeof Icon>[0]['name']} size={16} className={`mt-0.5 shrink-0 ${activeTab === tab.id ? 'text-primary' : ''}`} />
                <div>
                  <p className="text-sm font-600">{tab.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{tab.desc}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* COMPANY */}
            {activeTab === 'company' && (
              <div className="max-w-2xl space-y-0 bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                <div className="py-4">
                  <h2 className="text-base font-700 text-foreground">Informations entreprise</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Ces informations apparaissent sur vos tickets, factures et devis</p>
                </div>
                <SettingRow label="Nom commercial" desc="Affiché sur les tickets et factures">
                  <input value={settings.company_name} onChange={e => update('company_name', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Raison sociale" desc="Nom légal complet">
                  <input value={settings.legal_name} onChange={e => update('legal_name', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="SIRET" desc="14 chiffres">
                  <input value={settings.siret} onChange={e => update('siret', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="SIREN" desc="9 premiers chiffres du SIRET">
                  <input value={settings.siren} onChange={e => update('siren', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="N° TVA intracommunautaire">
                  <input value={settings.tva_number} onChange={e => update('tva_number', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="TVA par défaut (%)" desc="Taux appliqué automatiquement aux nouveaux produits">
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.5" min="0" max="100" value={settings.default_tva_rate} onChange={e => update('default_tva_rate', parseFloat(e.target.value) || 8.5)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                </SettingRow>
                <SettingRow label="Adresse">
                  <input value={settings.address} onChange={e => update('address', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Ville / Code postal">
                  <div className="flex gap-2">
                    <input value={settings.city} onChange={e => update('city', e.target.value)} placeholder="Ville" className="flex-1 px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <input value={settings.postal_code} onChange={e => update('postal_code', e.target.value)} placeholder="CP" className="w-24 px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </div>
                </SettingRow>
                <SettingRow label="Pays">
                  <input value={settings.country} onChange={e => update('country', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Téléphone">
                  <input type="tel" value={settings.phone} onChange={e => update('phone', e.target.value)} placeholder="+596 596 XX XX XX" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Email professionnel">
                  <input type="email" value={settings.email} onChange={e => update('email', e.target.value)} placeholder="contact@boutique.fr" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Site web">
                  <input type="url" value={settings.website} onChange={e => update('website', e.target.value)} placeholder="https://..." className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Devise">
                  <select value={settings.currency} onChange={e => update('currency', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="USD">USD — Dollar ($)</option>
                    <option value="XAF">XAF — Franc CFA</option>
                  </select>
                </SettingRow>
              </div>
            )}

            {/* PAYMENT */}
            {activeTab === 'payment' && (
              <div className="max-w-2xl space-y-4">
                <div className="bg-white border border-border rounded-2xl p-6">
                  <h2 className="text-base font-700 text-foreground mb-1">Modes de paiement</h2>
                  <p className="text-xs text-muted-foreground mb-5">Activez ou désactivez les modes de paiement disponibles en caisse</p>
                  <div className="space-y-3">
                    {settings.payment_methods.map(method => (
                      <div key={method.id} className="flex items-center justify-between p-4 border border-border rounded-xl hover:bg-muted/20 transition-colors">
                        <div>
                          <p className="text-sm font-600 text-foreground">{method.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{method.id}</p>
                        </div>
                        <Toggle checked={method.enabled} onChange={() => togglePaymentMethod(method.id)} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TEMPLATES */}
            {activeTab === 'templates' && (
              <div className="max-w-2xl space-y-5">
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Modèle ticket de caisse</h2>
                  </div>
                  <SettingRow label="Texte d'en-tête" desc="Affiché en haut du ticket">
                    <textarea value={settings.receipt_header} onChange={e => update('receipt_header', e.target.value)} rows={2} placeholder="Ex: Bienvenue chez nous !" className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </SettingRow>
                  <SettingRow label="Texte de pied de page" desc="Affiché en bas du ticket">
                    <textarea value={settings.receipt_footer} onChange={e => update('receipt_footer', e.target.value)} rows={2} className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </SettingRow>
                  <SettingRow label="Nom du vendeur / caisse" desc="Affiché sur le ticket (ex: Sophie, Caisse 1)">
                    <input value={settings.receipt_seller_name} onChange={e => update('receipt_seller_name', e.target.value)} placeholder="Ex: Sophie Fontaine" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </SettingRow>
                  <SettingRow label="Libellé caisse" desc="Identifiant de la caisse">
                    <input value={settings.receipt_cashier_label} onChange={e => update('receipt_cashier_label', e.target.value)} placeholder="Ex: Caisse principale" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </SettingRow>
                  <SettingRow label="Largeur papier">
                    <select value={settings.receipt_paper_width} onChange={e => update('receipt_paper_width', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="58mm">58 mm</option>
                      <option value="80mm">80 mm</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Afficher le logo"><Toggle checked={settings.receipt_show_logo} onChange={v => update('receipt_show_logo', v)} /></SettingRow>
                  <SettingRow label="Afficher le détail TVA"><Toggle checked={settings.receipt_show_tva} onChange={v => update('receipt_show_tva', v)} /></SettingRow>
                  <SettingRow label="Afficher le code-barres"><Toggle checked={settings.receipt_show_barcode} onChange={v => update('receipt_show_barcode', v)} /></SettingRow>
                  <SettingRow label="Afficher les points fidélité"><Toggle checked={settings.receipt_show_points} onChange={v => update('receipt_show_points', v)} /></SettingRow>
                </div>
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Modèles factures & devis</h2>
                  </div>
                  <SettingRow label="Modèle facture">
                    <select value={settings.invoice_template} onChange={e => update('invoice_template', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="standard">Standard</option>
                      <option value="modern">Moderne</option>
                      <option value="minimal">Minimaliste</option>
                    </select>
                  </SettingRow>
                  <SettingRow label="Modèle devis">
                    <select value={settings.quote_template} onChange={e => update('quote_template', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="standard">Standard</option>
                      <option value="modern">Moderne</option>
                      <option value="minimal">Minimaliste</option>
                    </select>
                  </SettingRow>
                </div>
              </div>
            )}

            {/* STOCK */}
            {activeTab === 'stock' && (
              <div className="max-w-2xl space-y-0 bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                <div className="py-4">
                  <h2 className="text-base font-700 text-foreground">Paramètres stock</h2>
                </div>
                <SettingRow label="Seuil alerte stock bas" desc="Alerte déclenchée quand le stock passe sous ce seuil">
                  <input type="number" min="0" value={settings.low_stock_alert_threshold} onChange={e => update('low_stock_alert_threshold', parseInt(e.target.value) || 5)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Frais structure par défaut (%)" desc="Appliqué automatiquement aux nouvelles commandes fournisseurs">
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.5" min="0" max="100" value={settings.default_structure_pct} onChange={e => update('default_structure_pct', parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <span className="text-sm text-muted-foreground shrink-0">%</span>
                  </div>
                </SettingRow>
                <SettingRow label="Devise" desc="Devise utilisée dans tout le système">
                  <select value={settings.currency} onChange={e => update('currency', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="EUR">EUR — Euro (€)</option>
                    <option value="USD">USD — Dollar ($)</option>
                    <option value="XAF">XAF — Franc CFA</option>
                  </select>
                </SettingRow>
              </div>
            )}

            {/* RETURNS */}
            {activeTab === 'returns' && (
              <div className="max-w-2xl space-y-4">
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Paramètres retours</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Politique de retour et gestion des avoirs</p>
                  </div>
                  <SettingRow label="Délai de retour maximum (jours)" desc="Nombre de jours après achat pour accepter un retour">
                    <input type="number" min="1" max="365" value={settings.return_max_days} onChange={e => update('return_max_days', parseInt(e.target.value) || 30)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  </SettingRow>
                  <SettingRow label="Ticket obligatoire pour retour" desc="Le client doit présenter son ticket original">
                    <Toggle checked={settings.return_require_receipt} onChange={v => update('return_require_receipt', v)} />
                  </SettingRow>
                </div>
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Conditions de retour (affichées sur le ticket)</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Ces textes apparaissent en bas du ticket de caisse imprimé</p>
                  </div>
                  <div className="py-4">
                    <label className="block text-sm font-600 text-foreground mb-1">Conditions générales de retour</label>
                    <p className="text-xs text-muted-foreground mb-2">Texte principal affiché sur le ticket</p>
                    <textarea
                      value={settings.return_conditions}
                      onChange={e => update('return_conditions', e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <div className="py-4">
                    <label className="block text-sm font-600 text-foreground mb-1">Produits exclus du retour</label>
                    <p className="text-xs text-muted-foreground mb-2">Mention complémentaire sur les exclusions</p>
                    <textarea
                      value={settings.return_excluded_products}
                      onChange={e => update('return_excluded_products', e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>
                <div className="bg-white border border-border rounded-2xl p-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-sm font-600 text-blue-800 mb-2">4 cas de retour gérés automatiquement :</p>
                    <ul className="space-y-1.5">
                      {[
                        { icon: '✅', label: 'Bon état', desc: 'Retour en stock + avoir ou remboursement' },
                        { icon: '🔄', label: 'Échange', desc: 'Ancien produit analysé + nouveau produit décompté' },
                        { icon: '🎁', label: 'Avoir client', desc: 'Crédit enregistré sur fiche client (disponible / utilisé / expiré)' },
                        { icon: '❌', label: 'Produit abîmé', desc: 'Perte interne enregistrée — ne retourne pas en stock' },
                      ].map(item => (
                        <li key={item.icon} className="flex items-start gap-2 text-xs text-blue-700">
                          <span>{item.icon}</span>
                          <span><strong>{item.label}</strong> — {item.desc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* LOYALTY */}
            {activeTab === 'loyalty' && (
              <div className="max-w-2xl space-y-0 bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                <div className="py-4">
                  <h2 className="text-base font-700 text-foreground">Paramètres fidélité</h2>
                </div>
                <SettingRow label="Points par euro dépensé" desc="Nombre de points attribués pour chaque euro">
                  <input type="number" step="0.1" min="0" value={settings.loyalty_points_per_euro} onChange={e => update('loyalty_points_per_euro', parseFloat(e.target.value) || 1)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Valeur d'un point (€)" desc="Montant en euros d'un point lors de l'utilisation">
                  <input type="number" step="0.001" min="0" value={settings.loyalty_euro_per_point} onChange={e => update('loyalty_euro_per_point', parseFloat(e.target.value) || 0.01)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <div className="py-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                    <p className="text-sm font-600 text-emerald-800">Exemple de calcul</p>
                    <p className="text-xs text-emerald-700 mt-1">
                      Achat de 100 € → {(100 * settings.loyalty_points_per_euro).toFixed(0)} points → valeur {(100 * settings.loyalty_points_per_euro * settings.loyalty_euro_per_point).toFixed(2)} €
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* LABELS */}
            {activeTab === 'labels' && (
              <div className="max-w-2xl space-y-0 bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                <div className="py-4">
                  <h2 className="text-base font-700 text-foreground">Dimensions étiquettes</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Format des étiquettes produits imprimées</p>
                </div>
                <SettingRow label="Largeur (mm)">
                  <input type="number" step="1" min="20" max="200" value={settings.label_width_mm} onChange={e => update('label_width_mm', parseFloat(e.target.value) || 50)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Hauteur (mm)">
                  <input type="number" step="1" min="10" max="200" value={settings.label_height_mm} onChange={e => update('label_height_mm', parseFloat(e.target.value) || 30)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Taille de police (pt)">
                  <input type="number" step="1" min="6" max="24" value={settings.label_font_size} onChange={e => update('label_font_size', parseInt(e.target.value) || 10)} className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <div className="py-4">
                  <div className="border border-border rounded-xl p-4 bg-muted/20 flex items-center justify-center">
                    <div
                      className="border-2 border-dashed border-primary/40 rounded-lg flex items-center justify-center bg-white"
                      style={{ width: `${Math.min(settings.label_width_mm * 2, 200)}px`, height: `${Math.min(settings.label_height_mm * 2, 120)}px` }}
                    >
                      <div className="text-center" style={{ fontSize: `${settings.label_font_size}px` }}>
                        <p className="font-bold">Produit exemple</p>
                        <p>Réf: PRD-001</p>
                        <p className="font-bold">29,90 €</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">Aperçu proportionnel — {settings.label_width_mm}×{settings.label_height_mm} mm</p>
                </div>
              </div>
            )}

            {/* PRINTERS */}
            {activeTab === 'printers' && (
              <div className="max-w-2xl space-y-0 bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                <div className="py-4">
                  <h2 className="text-base font-700 text-foreground">Paramètres imprimantes</h2>
                </div>
                <SettingRow label="Nom de l'imprimante" desc="Nom exact tel qu'il apparaît dans votre système">
                  <input value={settings.printer_name} onChange={e => update('printer_name', e.target.value)} placeholder="Ex: EPSON TM-T20III" className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                </SettingRow>
                <SettingRow label="Type d'imprimante">
                  <select value={settings.printer_type} onChange={e => update('printer_type', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <option value="thermal">Thermique (tickets)</option>
                    <option value="inkjet">Jet d'encre</option>
                    <option value="laser">Laser</option>
                    <option value="label">Imprimante étiquettes</option>
                  </select>
                </SettingRow>
              </div>
            )}

            {/* SECURITY */}
            {activeTab === 'security' && (
              <div className="max-w-2xl space-y-5">
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Code PIN Caisse</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {currentPinHash
                        ? 'Un code PIN est actif. La caisse demande le PIN à chaque nouvelle session (valide 8h).'
                        : 'Aucun code PIN configuré — la caisse est accessible sans protection.'}
                    </p>
                  </div>

                  {currentPinHash && (
                    <div className="py-4">
                      <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Code PIN actuel</label>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinCurrent}
                        onChange={e => setPinCurrent(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="••••••"
                        className="mt-1.5 w-40 px-3 py-2 border border-border rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  )}

                  <div className="py-4 space-y-3">
                    <label className="text-xs font-600 text-muted-foreground uppercase tracking-wide">
                      {currentPinHash ? 'Nouveau code PIN' : 'Définir un code PIN'}
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinNew}
                        onChange={e => setPinNew(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6 chiffres"
                        className="w-40 px-3 py-2 border border-border rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={6}
                        value={pinConfirm}
                        onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Confirmer"
                        className="w-40 px-3 py-2 border border-border rounded-lg text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                    </div>
                  </div>

                  <div className="py-4 flex items-center gap-3">
                    <button
                      onClick={handleSavePin}
                      disabled={pinSaving || pinNew.length !== 6 || pinConfirm.length !== 6}
                      className="px-4 py-2 bg-primary text-primary-foreground text-sm font-600 rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                    >
                      {pinSaving ? 'Enregistrement…' : currentPinHash ? 'Changer le PIN' : 'Activer le PIN'}
                    </button>
                    {currentPinHash && (
                      <button
                        onClick={handleRemovePin}
                        disabled={pinSaving || pinCurrent.length !== 6}
                        className="px-4 py-2 border border-red-200 text-red-600 text-sm font-600 rounded-lg hover:bg-red-50 disabled:opacity-40 transition-colors"
                      >
                        Supprimer le PIN
                      </button>
                    )}
                  </div>

                  {pinMsg && (
                    <div className={`py-3 text-sm font-500 ${pinMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {pinMsg.text}
                    </div>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-800">
                  <p className="font-600 mb-1">Comment ça fonctionne</p>
                  <ul className="space-y-1 text-xs list-disc list-inside text-blue-700">
                    <li>Le code PIN est haché (SHA-256) avant d&apos;être stocké — jamais en clair</li>
                    <li>La session est valide 8h après la saisie du PIN</li>
                    <li>Après 8h, le PIN est redemandé au rechargement de la caisse</li>
                    <li>Sans PIN configuré, la caisse est accessible directement</li>
                  </ul>
                </div>
              </div>
            )}

            {/* BACKUP */}
            {activeTab === 'backup' && (
              <div className="max-w-2xl space-y-5">
                <div className="bg-white border border-border rounded-2xl px-6 divide-y divide-border">
                  <div className="py-4">
                    <h2 className="text-base font-700 text-foreground">Sauvegardes automatiques</h2>
                  </div>
                  <SettingRow label="Sauvegarde automatique activée">
                    <Toggle checked={settings.auto_backup_enabled} onChange={v => update('auto_backup_enabled', v)} />
                  </SettingRow>
                  <SettingRow label="Fréquence de sauvegarde">
                    <select value={settings.backup_frequency} onChange={e => update('backup_frequency', e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                      <option value="daily">Quotidienne</option>
                      <option value="weekly">Hebdomadaire</option>
                      <option value="monthly">Mensuelle</option>
                    </select>
                  </SettingRow>
                </div>
                <div className="bg-white border border-border rounded-2xl p-6">
                  <h2 className="text-base font-700 text-foreground mb-4">Export manuel</h2>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Exporter les produits (CSV)', icon: 'TagIcon', href: '/product-management' },
                      { label: 'Exporter les clients (CSV)', icon: 'UsersIcon', href: '/clients' },
                      { label: 'Exporter les ventes (CSV)', icon: 'ShoppingCartIcon', href: '/reports' },
                      { label: 'Exporter le stock (CSV)', icon: 'ArchiveBoxIcon', href: '/stock' },
                    ].map(item => (
                      <a key={item.label} href={item.href} className="flex items-center gap-3 p-4 border border-border rounded-xl hover:bg-muted/30 transition-colors">
                        <Icon name={item.icon as Parameters<typeof Icon>[0]['name']} size={18} className="text-primary shrink-0" />
                        <span className="text-sm font-500 text-foreground">{item.label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-500 transition-all ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          <Icon name={toast.type === 'success' ? 'CheckCircleIcon' : 'ExclamationCircleIcon'} size={16} />
          {toast.msg}
        </div>
      )}
    </AppLayout>
  );
}
