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
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        await loadSupplierProfile(session.user.id, session.user.email || '');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await loadSupplierProfile(session.user.id, session.user.email || '');
      } else {
        setSupplierUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function loadSupplierProfile(authUserId: string, email: string) {
    const { data } = await supabase
      .from('supplier_portal_users')
      .select('supplier_id, suppliers(company_name)')
      .eq('auth_user_id', authUserId)
      .eq('is_active', true)
      .single();

    if (data) {
      const row = data as any;
      setSupplierUser({
        authUserId,
        supplierId: row.supplier_id,
        supplierName: row.suppliers?.company_name || 'Fournisseur',
        email,
      });
    }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error || !data.user) {
      throw new Error('Identifiants incorrects. Veuillez vérifier votre email et mot de passe.');
    }

    // Vérifier que c'est bien un fournisseur
    const { data: portalUser, error: portalError } = await supabase
      .from('supplier_portal_users')
      .select('supplier_id, suppliers(company_name)')
      .eq('auth_user_id', data.user.id)
      .eq('is_active', true)
      .single();

    if (portalError || !portalUser) {
      await supabase.auth.signOut();
      throw new Error('Accès non autorisé. Ce compte n\'est pas un compte fournisseur.');
    }

    const row = portalUser as any;
    setSupplierUser({
      authUserId: data.user.id,
      supplierId: row.supplier_id,
      supplierName: row.suppliers?.company_name || 'Fournisseur',
      email: email.toLowerCase().trim(),
    });
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setSupplierUser(null);
  };

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut }}>
      {children}
    </SupplierAuthContext.Provider>
  );
};
