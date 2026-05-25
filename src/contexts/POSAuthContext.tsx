'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { employeeService, type Employee } from '@/lib/services/employeeService';

export type POSActionType = 'sale' | 'discount' | 'cancel' | 'price_change' | 'hold' | 'free_price' | 'acompte';

const SESSION_KEY = 'pos_caisse_session';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

interface POSSession {
  id: string;
  employeeId: string;
  startedAt: string;
}

interface POSAuthContextValue {
  employee: Employee | null;
  session: POSSession | null;
  isLocked: boolean;
  pinConfigured: boolean;
  login: (pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  logAction: (type: POSActionType, description: string, amount?: number, meta?: Record<string, unknown>) => Promise<void>;
}

const DEFAULT_EMPLOYEE: Employee = {
  id: 'default',
  firstName: 'Caissier',
  lastName: '',
  fullName: 'Caissier',
  avatarInitials: 'CA',
  role: 'cashier',
  status: 'active',
  posPin: null,
  email: null,
  phone: null,
  hireDate: null,
  notes: null,
  monthlyObjective: 0,
  permissions: {
    cashierAccess: true,
    stockAccess: true,
    suppliersAccess: false,
    productsAccess: true,
    statsAccess: true,
    discountAuth: true,
    cancelAuth: true,
    priceModify: true,
    adminAccess: false,
  },
  createdAt: '',
  updatedAt: '',
};

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function loadSession(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { expires } = JSON.parse(raw) as { expires: number };
    return Date.now() < expires;
  } catch {
    return false;
  }
}

function saveSession() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ expires: Date.now() + SESSION_TTL_MS }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export { sha256hex };

const POSAuthContext = createContext<POSAuthContextValue | null>(null);

export function POSAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee] = useState<Employee>(DEFAULT_EMPLOYEE);
  const [session] = useState<POSSession | null>(null);
  const [isLocked, setIsLocked] = useState(true);
  const [pinConfigured, setPinConfigured] = useState(false);
  const sessionRef = useRef<POSSession | null>(null);

  // On mount: check localStorage session validity and load pin hash
  useEffect(() => {
    const supabase = createClient();

    async function init() {
      const { data } = await supabase
        .from('app_settings')
        .select('pos_pin_hash')
        .eq('id', 'main')
        .maybeSingle();

      const hash = data?.pos_pin_hash ?? null;
      setPinConfigured(!!hash);

      // If no PIN configured OR valid session exists → unlock
      if (!hash || loadSession()) {
        setIsLocked(false);
      }
    }

    init();
  }, []);

  const login = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const supabase = createClient();
      const { data } = await supabase
        .from('app_settings')
        .select('pos_pin_hash')
        .eq('id', 'main')
        .maybeSingle();

      const storedHash = data?.pos_pin_hash ?? null;

      // No PIN configured → always allow
      if (!storedHash) {
        saveSession();
        setIsLocked(false);
        return { success: true };
      }

      const enteredHash = await sha256hex(pin);
      if (enteredHash !== storedHash) {
        return { success: false, error: 'Code PIN incorrect' };
      }

      saveSession();
      setIsLocked(false);
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur de connexion. Réessayez.' };
    }
  }, []);

  const logout = useCallback(async () => {
    clearSession();
    setIsLocked(true);
    sessionRef.current = null;
  }, []);

  const logAction = useCallback(async (
    type: POSActionType,
    description: string,
    amount?: number,
    meta?: Record<string, unknown>
  ) => {
    const currentEmployee = employee;
    if (!currentEmployee || currentEmployee.id === 'default') return;
    try {
      const supabase = createClient();
      await supabase.from('pos_action_log').insert({
        session_id: sessionRef.current?.id ?? null,
        employee_id: currentEmployee.id,
        action_type: type,
        description,
        amount: amount ?? null,
        meta: meta ?? null,
      });
    } catch (e) {
      console.error('POS action log error:', e);
    }
  }, [employee]);

  // Also expose a helper to verify employee PIN for specific actions (kept for EmployeePINModal)
  const loginEmployee = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const emp = await employeeService.verifyPin(pin);
      if (!emp) return { success: false, error: 'PIN incorrect ou employé inactif' };
      if (!emp.permissions.cashierAccess) return { success: false, error: "Cet employé n'a pas accès à la caisse" };
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur de connexion.' };
    }
  }, []);

  return (
    <POSAuthContext.Provider value={{ employee, session, isLocked, pinConfigured, login, logout, logAction }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth(): POSAuthContextValue {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
