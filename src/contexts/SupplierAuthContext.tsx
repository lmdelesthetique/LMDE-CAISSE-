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

    // Use SECURITY DEFINER RPC to bypass RLS — anon users cannot query supplier_portal_users directly
    const { data, error } = await supabase.rpc('verify_supplier_pin', {
      p_pin: pin.trim(),
    });

    if (error) {
      console.error('[SupplierAuth] RPC error:', error.message);
      throw new Error('Erreur lors de la vérification du code PIN.');
    }

    const rows = data as Array<{ supplier_id: string; company_name: string }> | null;
    if (!rows || rows.length === 0) {
      throw new Error('Code PIN incorrect ou accès désactivé.');
    }

    const row = rows[0];
    const user: SupplierPortalUser = {
      supplierId: row.supplier_id,
      supplierName: row.company_name ?? 'Fournisseur',
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
