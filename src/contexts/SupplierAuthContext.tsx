'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface SupplierPortalUser {
  supplierId: string;
  supplierName: string;
}

interface SupplierAuthContextType {
  supplierUser: SupplierPortalUser | null;
  loading: boolean;
  signIn: (pin: string) => Promise<void>;
  signOut: () => void;
}

const SupplierAuthContext = createContext<SupplierAuthContextType>({
  supplierUser: null,
  loading: true,
  signIn: async () => {},
  signOut: () => {},
});

export const useSupplierAuth = () => useContext(SupplierAuthContext);

const SESSION_KEY = 'supplier_portal_session';

export function SupplierAuthProvider({ children }: { children: React.ReactNode }) {
  const [supplierUser, setSupplierUser] = useState<SupplierPortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierPortalUser;
        setSupplierUser(parsed);
      }
    } catch {
      // ignore malformed storage
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(async (pin: string) => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('supplier_portal_users')
      .select('supplier_id, suppliers(company_name)')
      .eq('pin_code', pin.trim())
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new Error('Erreur lors de la vérification du code PIN.');
    if (!data) throw new Error('Code PIN incorrect ou accès désactivé.');

    const row = data as any;
    const user: SupplierPortalUser = {
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.company_name ?? 'Fournisseur',
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setSupplierUser(user);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSupplierUser(null);
  }, []);

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut }}>
      {children}
    </SupplierAuthContext.Provider>
  );
}
