'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ClientPortalUser {
  subscriptionId: string;
  clientId: string;
  clientName: string;
  planName: string;
  planPrice: number;
  quotaAmount: number;
  shippingFree: boolean;
  shippingCost: number;
  launchOffer: boolean;
}

interface ClientAuthContextType {
  clientUser: ClientPortalUser | null;
  loading: boolean;
  signIn: (phone: string, pin: string) => Promise<void>;
  signOut: () => void;
}

const ClientAuthContext = createContext<ClientAuthContextType>({
  clientUser: null,
  loading: true,
  signIn: async () => {},
  signOut: () => {},
});

export const useClientAuth = () => useContext(ClientAuthContext);

const SESSION_KEY = 'client_portal_session';

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [clientUser, setClientUser] = useState<ClientPortalUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ClientPortalUser;
        setClientUser(parsed);
      }
    } catch {
      // ignore malformed storage
    }
    setLoading(false);
  }, []);

  const signIn = useCallback(async (phone: string, pin: string) => {
    const supabase = createClient();

    const { data, error } = await supabase.rpc('verify_client_pin', {
      p_phone: phone.trim(),
      p_pin: pin.trim(),
    });

    if (error) {
      console.error('[ClientAuth] RPC error:', error.message);
      throw new Error('Erreur lors de la vérification.');
    }

    const rows = data as Array<{
      subscription_id: string;
      client_id: string;
      client_name: string;
      plan_name: string;
      plan_price: number;
      quota_amount: number;
      shipping_free: boolean;
      shipping_cost: number;
      launch_offer: boolean;
    }> | null;

    if (!rows || rows.length === 0) {
      throw new Error('Numéro de téléphone ou code PIN incorrect.');
    }

    const row = rows[0];
    const user: ClientPortalUser = {
      subscriptionId: row.subscription_id,
      clientId: row.client_id,
      clientName: row.client_name ?? 'Cliente',
      planName: row.plan_name,
      planPrice: row.plan_price,
      quotaAmount: row.quota_amount,
      shippingFree: row.shipping_free,
      shippingCost: row.shipping_cost,
      launchOffer: row.launch_offer ?? false,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    setClientUser(user);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setClientUser(null);
  }, []);

  return (
    <ClientAuthContext.Provider value={{ clientUser, loading, signIn, signOut }}>
      {children}
    </ClientAuthContext.Provider>
  );
}
