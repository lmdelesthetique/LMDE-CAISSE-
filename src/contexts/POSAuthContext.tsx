'use client';

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { employeeService, type Employee } from '@/lib/services/employeeService';

export type POSActionType = 'sale' | 'discount' | 'cancel' | 'price_change' | 'hold' | 'free_price' | 'acompte';

interface POSSession {
  id: string;
  employeeId: string;
  startedAt: string;
}

interface POSAuthState {
  employee: Employee | null;
  session: POSSession | null;
  isLocked: boolean;
}

interface POSAuthContextValue extends POSAuthState {
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

const POSAuthContext = createContext<POSAuthContextValue | null>(null);

export function POSAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(DEFAULT_EMPLOYEE);
  const [session, setSession] = useState<POSSession | null>(null);
  const sessionRef = useRef<POSSession | null>(null);

  // Always unlocked — no PIN required
  const isLocked = false;

  const login = useCallback(async (pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const emp = await employeeService.verifyPin(pin);
      if (!emp) {
        return { success: false, error: 'PIN incorrect ou employé inactif' };
      }
      if (!emp.permissions.cashierAccess) {
        return { success: false, error: 'Cet employé n\'a pas accès à la caisse' };
      }

      const supabase = createClient();
      await supabase
        .from('pos_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('employee_id', emp.id)
        .eq('is_active', true);

      const { data: sessionData, error: sessionError } = await supabase
        .from('pos_sessions')
        .insert({ employee_id: emp.id })
        .select()
        .single();

      if (sessionError) throw sessionError;

      const newSession: POSSession = {
        id: sessionData.id,
        employeeId: emp.id,
        startedAt: sessionData.started_at,
      };

      setEmployee(emp);
      setSession(newSession);
      sessionRef.current = newSession;

      return { success: true };
    } catch (e) {
      console.error('POS login error:', e);
      return { success: false, error: 'Erreur de connexion. Réessayez.' };
    }
  }, []);

  const logout = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (currentSession) {
      try {
        const supabase = createClient();
        await supabase
          .from('pos_sessions')
          .update({ is_active: false, ended_at: new Date().toISOString() })
          .eq('id', currentSession.id);
      } catch (e) {
        console.error('POS logout error:', e);
      }
    }
    // Reset to default employee instead of null — keeps POS open
    setEmployee(DEFAULT_EMPLOYEE);
    setSession(null);
    sessionRef.current = null;
  }, []);

  const logAction = useCallback(async (
    type: POSActionType,
    description: string,
    amount?: number,
    meta?: Record<string, unknown>
  ) => {
    const currentEmployee = employee;
    const currentSession = sessionRef.current;
    if (!currentEmployee || currentEmployee.id === 'default') return;

    try {
      const supabase = createClient();
      await supabase.from('pos_action_log').insert({
        session_id: currentSession?.id ?? null,
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
    <POSAuthContext.Provider value={{ employee, session, isLocked, login, logout, logAction }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth(): POSAuthContextValue {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}
