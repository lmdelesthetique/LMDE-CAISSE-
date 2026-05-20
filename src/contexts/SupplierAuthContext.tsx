'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { createClient } from '@/lib/supabase/client';

export interface SupplierPortalUser {
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

async function fetchSupplierProfile(
  authUserId: string,
  email: string,
): Promise<SupplierPortalUser | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('supplier_portal_users')
    .select('supplier_id, suppliers(company_name)')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[SupplierAuth] fetchProfile error:', error.message);
    return null;
  }
  if (!data) {
    console.warn('[SupplierAuth] Aucune ligne trouvée pour', authUserId);
    return null;
  }

  const row = data as any;
  return {
    authUserId,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.company_name ?? 'Fournisseur',
    email,
  };
}

export function SupplierAuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useRef(createClient()).current;
  const [supplierUser, setSupplierUser] = useState<SupplierPortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (authUserId: string, email: string) => {
    const profile = await fetchSupplierProfile(authUserId, email);
    setSupplierUser(profile);
    return profile;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        await loadProfile(session.user.id, session.user.email ?? '');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!mounted) return;
        if (session?.user) {
          await loadProfile(session.user.id, session.user.email ?? '');
        } else {
          setSupplierUser(null);
        }
      },
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error || !data.user) {
      throw new Error('Identifiants incorrects. Veuillez réessayer.');
    }

    const profile = await loadProfile(data.user.id, data.user.email ?? '');

    if (!profile) {
      await supabase.auth.signOut();
      throw new Error("Accès non autorisé. Contactez l'administrateur BeautyPOS.");
    }
  }, [supabase, loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSupplierUser(null);
  }, [supabase]);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.toLowerCase().trim(),
      {
        redirectTo: `${typeof window !== 'undefined' ? window.location.origin : ''}/supplier-portal/reset-password`,
      },
    );
    if (error) {
      throw new Error("Impossible d'envoyer l'email. Vérifiez l'adresse saisie.");
    }
  }, [supabase]);

  return (
    <SupplierAuthContext.Provider value={{ supplierUser, loading, signIn, signOut, resetPassword }}>
      {children}
    </SupplierAuthContext.Provider>
  );
}
