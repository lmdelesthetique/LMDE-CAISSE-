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

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email || '');
      }
      setLoading(false);
    });
    const { data: { subscription } } = createClient().auth.onAuthStateChange(async (_e, session) => {
      if (session?.user) await loadProfile(session.user.id, session.user.email || '');
      else setSupplierUser(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(authUserId: string, email: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from('supplier_portal_users')
      .select('supplier_id, suppliers(company_name)')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .maybeSingle();

    if (data) {
      const row = data as any;
      setSupplierUser({
        authUserId,
        supplierId: row.supplier_id,
        supplierName: row.suppliers?.company_name || 'Fournisseur',
        email,
      });
    } else {
      setSupplierUser(null);
    }
  }

  const signIn = async (email: string, password: string) => {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });
    if (error || !data.user) throw new Error('Identifiants incorrects.');
    await loadProfile(data.user.id, data.user.email || '');
    const profile = await supabase
      .from('supplier_portal_users')
      .select('id')
      .eq('auth_user_id', data.user.id)
      .eq('is_active', true)
      .maybeSingle();
    if (!profile.data) {
      await supabase.auth.signOut();
      throw new Error('Accès non autorisé.');
    }
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    setSupplierUser(null);
  };

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut }}>
      {children}
    </SupplierAuthContext.Provider>
  );
};
