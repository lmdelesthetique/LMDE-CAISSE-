'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Employee } from '@/lib/services/employeeService';

export type POSActionType = 'sale' | 'discount' | 'cancel' | 'price_change' | 'hold' | 'free_price' | 'acompte';

interface POSSession {
  id: string;
  employeeId: string;
  startedAt: string;
}

interface StoredEmployee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarInitials: string;
  role: string;
  loginAt: string;
}

interface POSAuthContextValue {
  employee: Employee | null;
  session: POSSession | null;
  isLocked: boolean;
  pinConfigured: boolean;
  login: (employeeId: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  changeEmployee: () => void;
  logAction: (type: POSActionType, description: string, amount?: number, meta?: Record<string, unknown>) => Promise<void>;
}

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const STORAGE_KEY = 'caisse_employee';

function loadStoredEmployee(): StoredEmployee | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredEmployee = JSON.parse(raw);
    if (!parsed.loginAt) return null;
    if (Date.now() - new Date(parsed.loginAt).getTime() > SESSION_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function storedToEmployee(s: StoredEmployee): Employee {
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    fullName: s.fullName,
    avatarInitials: s.avatarInitials,
    role: s.role as any,
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
      adminAccess: s.role === 'admin',
    },
    createdAt: s.loginAt,
    updatedAt: s.loginAt,
    isDeliveryDriver: false,
    portalPhone: null,
    portalPin: null,
    driverStatus: 'off',
  };
}

const POSAuthContext = createContext<POSAuthContextValue | null>(null);

export function POSAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [session] = useState<POSSession | null>(null);
  const sessionRef = useRef<POSSession | null>(null);
  const [ready, setReady] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = loadStoredEmployee();
    if (stored) setEmployee(storedToEmployee(stored));
    setReady(true);
  }, []);

  const isLocked = ready && employee === null;
  const pinConfigured = false;

  const login = useCallback(async (employeeId: string, pin: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/auth/verify-employee-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, pin }),
      });
      const data = await res.json();

      if (!data.valid) {
        return { success: false, error: 'PIN incorrect' };
      }

      const stored: StoredEmployee = {
        id: data.employee.id,
        firstName: data.employee.firstName,
        lastName: data.employee.lastName,
        fullName: data.employee.fullName,
        avatarInitials: data.employee.avatarInitials,
        role: data.employee.role,
        loginAt: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      setEmployee(storedToEmployee(stored));
      return { success: true };
    } catch {
      return { success: false, error: 'Erreur de connexion' };
    }
  }, []);

  const changeEmployee = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setEmployee(null);
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY);
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

  // Don't render children until hydration is done (avoids flicker)
  if (!ready) return null;

  return (
    <POSAuthContext.Provider value={{ employee, session, isLocked, pinConfigured, login, logout, changeEmployee, logAction }}>
      {children}
    </POSAuthContext.Provider>
  );
}

export function usePOSAuth(): POSAuthContextValue {
  const ctx = useContext(POSAuthContext);
  if (!ctx) throw new Error('usePOSAuth must be used within POSAuthProvider');
  return ctx;
}

// Legacy export kept for compatibility
export async function verifyEmployeePin(_pin: string): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: 'Use login(employeeId, pin) instead' };
}

export async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
