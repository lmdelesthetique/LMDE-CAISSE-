'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface SupplierPortalUser {
  authUserId: string;
  supplierId: string;
  supplierName: string;
  email: string;
}

interface SupplierAuthContextType {
  supplierUser: SupplierPortalUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SESSION_KEY = 'supplier_portal_session';

const SupplierAuthContext = createContext<SupplierAuthContextType>({
  supplierUser: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});

export const useSupplierAuth = () => useContext(SupplierAuthContext);

export const SupplierAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [supplierUser, setSupplierUser] = useState<SupplierPortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  // Restore session from localStorage on mount — no Supabase Auth calls
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as SupplierPortalUser;
        setSupplierUser(parsed);
      }
    } catch {
      // ignore parse errors
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    // Query supplier_portal_users directly — no supabase.auth involved
    const { data, error } = await supabase
      .from('supplier_portal_users')
      .select('id, auth_user_id, supplier_id, portal_password, is_active, suppliers(company_name)')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw new Error('Identifiants incorrects. Veuillez vérifier votre email et mot de passe.');
    }

    const row = data as any;

    // Check password — stored as plain text or bcrypt hash
    // For plain text passwords (simple setup)
    if (row.portal_password !== password) {
      throw new Error('Identifiants incorrects. Veuillez vérifier votre email et mot de passe.');
    }

    const session: SupplierPortalUser = {
      authUserId: row.auth_user_id || row.id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.company_name || 'Fournisseur',
      email: email.toLowerCase().trim(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setSupplierUser(session);
  };

  const signOut = async () => {
    localStorage.removeItem(SESSION_KEY);
    setSupplierUser(null);
  };

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut }}>
      {children}
    </SupplierAuthContext.Provider>
  );
};
