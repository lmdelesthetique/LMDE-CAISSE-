'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { employeeService, type Employee } from '@/lib/services/employeeService';

export type POSActionType = 'sale' | 'discount' | 'cancel' | 'price_change' | 'hold' | 'free_price' | 'acompte';

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
  isDeliveryDriver: false,
  portalPhone: null,
  portalPin: null,
  driverStatus: 'off',
};

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const POSAuthContext = createContext<POSAuthContextValue | null>(null);

export function POSAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee] = useState<Employee>(DEFAULT_EMPLOYEE);
  const [session] = useState<POSSession | null>(null);
  const sessionRef = useRef<POSSession | null>(null);

  // Global PIN auth is handled by middleware; POS is always accessible once middleware passes.
  const isLocked = false;
  const pinConfigured = false;

  const login = useCallback(async (_pin: string): Promise<{ success: boolean; error?: string }> => {
    return { success: true };
  }, []);

  // Lock redirects to the global PIN login, clearing the session cookie.
  const logout = useCallback(async () => {
    sessionRef.current = null;
    window.location.href = '/api/auth/logout';
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
      const { createClient } = await import('@/lib/supabase/client');
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

// Kept for EmployeePINModal compatibility
export async function verifyEmployeePin(pin: string): Promise<{ success: boolean; error?: string }> {
  try {
    const emp = await employeeService.verifyPin(pin);
    if (!emp) return { success: false, error: 'PIN incorrect ou employé inactif' };
    if (!emp.permissions.cashierAccess) return { success: false, error: "Cet employé n'a pas accès à la caisse" };
    return { success: true };
  } catch {
    return { success: false, error: 'Erreur de connexion.' };
  }
}
