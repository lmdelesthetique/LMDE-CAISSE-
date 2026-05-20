'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

export interface AppSettings {
  company_name: string;
  legal_name: string;
  siret: string;
  siren: string;
  tva_number: string;
  default_tva_rate: number;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  currency: string;
  timezone: string;
  default_structure_pct: number;
  low_stock_alert_threshold: number;
  auto_backup_enabled: boolean;
  backup_frequency: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_show_logo: boolean;
  receipt_show_tva: boolean;
  receipt_show_barcode: boolean;
  receipt_show_points: boolean;
  receipt_paper_width: string;
  receipt_seller_name: string;
  receipt_cashier_label: string;
  invoice_template: string;
  quote_template: string;
  label_width_mm: number;
  label_height_mm: number;
  label_font_size: number;
  return_max_days: number;
  return_require_receipt: boolean;
  return_conditions: string;
  return_excluded_products: string;
  loyalty_points_per_euro: number;
  loyalty_euro_per_point: number;
  printer_name: string;
  printer_type: string;
  payment_methods: { id: string; label: string; enabled: boolean }[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  company_name: "LE MONDE DE L'ESTHETIQUE",
  legal_name: "LE MONDE DE L'ESTHETIQUE",
  siret: '927 747 725',
  siren: '927747725',
  tva_number: 'FR71 927747 725',
  default_tva_rate: 8.5,
  address: 'Baie des Flamands Appt 306 9 avenue Loulou Boislaville',
  city: 'Fort-de-France',
  postal_code: '97200',
  country: 'France (Martinique)',
  phone: '',
  email: '',
  website: '',
  logo_url: '',
  currency: 'EUR',
  timezone: 'America/Martinique',
  default_structure_pct: 0,
  low_stock_alert_threshold: 5,
  auto_backup_enabled: true,
  backup_frequency: 'daily',
  receipt_header: '',
  receipt_footer: 'Merci de votre visite !',
  receipt_show_logo: true,
  receipt_show_tva: true,
  receipt_show_barcode: false,
  receipt_show_points: true,
  receipt_paper_width: '80mm',
  receipt_seller_name: '',
  receipt_cashier_label: 'Caisse principale',
  invoice_template: 'standard',
  quote_template: 'standard',
  label_width_mm: 50,
  label_height_mm: 30,
  label_font_size: 10,
  return_max_days: 30,
  return_require_receipt: false,
  return_conditions: "Retour accepté sous 30 jours selon conditions boutique. Produit non utilisé, non ouvert et en bon état. Ticket obligatoire pour tout retour ou échange.",
  return_excluded_products: "Certains produits peuvent être exclus du retour (produits d'hygiène, consommables ouverts).",
  loyalty_points_per_euro: 1,
  loyalty_euro_per_point: 0.01,
  printer_name: '',
  printer_type: 'thermal',
  payment_methods: [
    { id: 'cash', label: 'Espèces', enabled: true },
    { id: 'card', label: 'Carte bancaire', enabled: true },
    { id: 'check', label: 'Chèque', enabled: true },
    { id: 'store_credit', label: 'Avoir / Crédit client', enabled: true },
    { id: 'transfer', label: 'Virement bancaire', enabled: false },
    { id: 'voucher', label: 'Bon cadeau', enabled: true },
  ],
};

interface SettingsContextValue {
  settings: AppSettings;
  loading: boolean;
  reload: () => Promise<void>;
  /** TVA rate as a decimal (e.g. 0.085 for 8.5%) */
  tvaRate: number;
  /** Enabled payment methods only */
  enabledPaymentMethods: { id: string; label: string }[];
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  loading: true,
  reload: async () => {},
  tvaRate: 0.085,
  enabledPaymentMethods: DEFAULT_SETTINGS.payment_methods.filter(m => m.enabled),
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('id', 'main')
        .maybeSingle();
      if (!error && data) {
        const merged: AppSettings = {
          ...DEFAULT_SETTINGS,
          ...data,
          payment_methods: Array.isArray(data.payment_methods)
            ? data.payment_methods
            : DEFAULT_SETTINGS.payment_methods,
        };
        setSettings(merged);
        try {
          localStorage.setItem('beautypos_settings', JSON.stringify(merged));
        } catch { /* ignore */ }
      }
    } catch (e) {
      console.error('SettingsContext reload error', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Try localStorage first for instant render, then fetch from DB
    try {
      const cached = localStorage.getItem('beautypos_settings');
      if (cached) {
        const parsed = JSON.parse(cached);
        setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        setLoading(false);
      }
    } catch { /* ignore */ }

    reload();
  }, [reload]);

  // Listen for settings-updated event dispatched after save
  useEffect(() => {
    const handler = () => { reload(); };
    window.addEventListener('beautypos:settings-updated', handler);
    return () => window.removeEventListener('beautypos:settings-updated', handler);
  }, [reload]);

  const tvaRate = (settings.default_tva_rate ?? 8.5) / 100;
  const enabledPaymentMethods = (settings.payment_methods ?? []).filter(m => m.enabled);

  return (
    <SettingsContext.Provider value={{ settings, loading, reload, tvaRate, enabledPaymentMethods }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
