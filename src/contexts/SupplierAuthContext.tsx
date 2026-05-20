'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
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
  resetPassword: (email: string) => Promise<void>;
}

const SupplierAuthContext = createContext<SupplierAuthContextType>({
  supplierUser: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
});

export const useSupplierAuth = () => useContext(SupplierAuthContext);

async function fetchProfile(authUserId: string, email: string): Promise<SupplierPortalUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('supplier_portal_users')
    .select('supplier_id, suppliers(company_name)')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as any;
  return {
    authUserId,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.company_name ?? 'Fournisseur',
    email,
  };
}

export const SupplierAuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [supplierUser, setSupplierUser] = useState<SupplierPortalUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Use a single stable supabase client
  const supabase = useRef(createClient()).current;

  useEffect(() => {
    // Initial session check
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email ?? '');
        setSupplierUser(profile);
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const profile = await fetchProfile(session.user.id, session.user.email ?? '');
        setSupplierUser(profile);
      } else {
        setSupplierUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const signIn = async (email: string, password: string): Promise<void> => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error || !data.user) {
      throw new Error('Identifiants incorrects. Veuillez réessayer.');
    }

    const profile = await fetchProfile(data.user.id, data.user.email ?? '');
    if (!profile) {
      await supabase.auth.signOut();
      throw new Error('Accès non autorisé. Contactez l\'administrateur BeautyPOS.');
    }

    setSupplierUser(profile);
  };

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
    setSupplierUser(null);
  };

  const resetPassword = async (email: string): Promise<void> => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      { redirectTo: `${window.location.origin}/supplier-portal/reset-password` }
    );
    if (error) {
      throw new Error('Impossible d\'envoyer l\'email de réinitialisation. Vérifiez l\'adresse saisie.');
    }
  };

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut, resetPassword }}>
      {children}
    </SupplierAuthContext.Provider>
  );
};
