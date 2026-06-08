'use client';

import React, { useState, useEffect, useRef } from 'react';
import Icon from '@/components/ui/AppIcon';
import { usePOSAuth } from '@/contexts/POSAuthContext';

interface EmployeeCard {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarInitials: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Caissière',
  stock_manager: 'Resp. Stock',
  sales_rep: 'Commercial(e)',
};

// Deterministic color from employee id
const AVATAR_COLORS = [
  'bg-rose-400',
  'bg-pink-500',
  'bg-fuchsia-500',
  'bg-purple-500',
  'bg-violet-500',
  'bg-indigo-400',
  'bg-sky-500',
  'bg-teal-500',
];

function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 60;

export default function EmployeePINModal() {
  const { login } = usePOSAuth();

  const [step, setStep] = useState<'select' | 'pin'>('select');
  const [employees, setEmployees] = useState<EmployeeCard[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeCard | null>(null);

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [locked, setLocked] = useState(false);
  const [lockCountdown, setLockCountdown] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load active employees
  useEffect(() => {
    fetch('/api/employees?status=active')
      .then((r) => r.json())
      .then((d) => setEmployees(d.employees ?? []))
      .catch(() => {})
      .finally(() => setLoadingEmployees(false));
  }, []);

  // Focus input when PIN step shows
  useEffect(() => {
    if (step === 'pin') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // Lockout countdown
  useEffect(() => {
    if (!locked) return;
    setLockCountdown(LOCKOUT_SECONDS);
    const iv = setInterval(() => {
      setLockCountdown((c) => {
        if (c <= 1) {
          clearInterval(iv);
          setLocked(false);
          setAttempts(0);
          setError('');
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [locked]);

  const selectEmployee = (emp: EmployeeCard) => {
    setSelectedEmployee(emp);
    setPin('');
    setError('');
    setAttempts(0);
    setLocked(false);
    setStep('pin');
  };

  const handleDigit = (d: string) => {
    if (locked || pin.length >= 6) return;
    setPin((p) => p + d);
    setError('');
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError('');
  };

  const handleSubmit = async () => {
    if (locked || pin.length < 4 || !selectedEmployee) return;
    setLoading(true);
    const result = await login(selectedEmployee.id, pin);
    setLoading(false);

    if (!result.success) {
      const next = attempts + 1;
      setAttempts(next);
      setPin('');
      if (next >= MAX_ATTEMPTS) {
        setLocked(true);
        setError(`Trop de tentatives — bloqué ${LOCKOUT_SECONDS}s`);
      } else {
        setError(`PIN incorrect — ${MAX_ATTEMPTS - next} tentative(s) restante(s)`);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
    else if (e.key === 'Backspace') handleDelete();
    else if (/^\d$/.test(e.key)) handleDigit(e.key);
  };

  const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-y-auto">
      <div className="w-full max-w-lg mx-4 my-8">

        {/* ── Step 1: Employee selection ─────────────────────────────── */}
        {step === 'select' && (
          <div>
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pink-500/20 border border-pink-500/30 mb-4">
                <Icon name="UserGroupIcon" size={28} className="text-pink-400" />
              </div>
              <h1 className="text-2xl font-700 text-white">Qui encaisse aujourd'hui ?</h1>
              <p className="text-slate-400 text-sm mt-1">Sélectionnez votre profil pour commencer</p>
            </div>

            {loadingEmployees ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-2 border-pink-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : employees.length === 0 ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl px-6 py-8 text-center">
                <Icon name="ExclamationTriangleIcon" size={24} className="text-amber-400 mx-auto mb-3" />
                <p className="text-amber-300 font-600">Aucun employé actif trouvé</p>
                <p className="text-amber-400/70 text-sm mt-1">Ajoutez des employés dans la gestion du personnel</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {employees.map((emp) => (
                  <button
                    key={emp.id}
                    onClick={() => selectEmployee(emp)}
                    className="group flex flex-col items-center gap-3 p-5 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:scale-95 transition-all"
                  >
                    <div className={`w-14 h-14 rounded-2xl ${avatarColor(emp.id)} flex items-center justify-center text-xl font-800 text-white shadow-lg group-hover:scale-110 transition-transform`}>
                      {emp.avatarInitials}
                    </div>
                    <div className="text-center">
                      <p className="font-700 text-white text-sm">{emp.firstName.toUpperCase()}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{ROLE_LABELS[emp.role] ?? emp.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: PIN entry ──────────────────────────────────────── */}
        {step === 'pin' && selectedEmployee && (
          <div className="max-w-sm mx-auto">
            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-2xl ${avatarColor(selectedEmployee.id)} flex items-center justify-center text-2xl font-800 text-white mx-auto mb-4 shadow-lg`}>
                {selectedEmployee.avatarInitials}
              </div>
              <h1 className="text-xl font-700 text-white">Bonjour {selectedEmployee.firstName} !</h1>
              <p className="text-slate-400 text-sm mt-1">Entrez votre code PIN</p>
            </div>

            {/* PIN dots */}
            <div className="flex items-center justify-center gap-3 mb-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full transition-all duration-150 ${
                    i < pin.length ? 'bg-pink-400 scale-110' : 'bg-slate-600 border border-slate-500'
                  }`}
                />
              ))}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 mb-4">
                <Icon name="ExclamationCircleIcon" size={16} className="text-red-400 shrink-0" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            {/* Lockout */}
            {locked && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 mb-4 text-center">
                <p className="text-red-300 font-700 text-2xl tabular-nums">{lockCountdown}s</p>
                <p className="text-red-400 text-xs mt-0.5">Veuillez patienter…</p>
              </div>
            )}

            {/* Hidden keyboard input */}
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                if (locked) return;
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPin(val);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              className="sr-only"
              aria-label="PIN employé"
            />

            {/* Numpad */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {DIGITS.map((d, i) => {
                if (d === '') return <div key={i} />;
                if (d === '⌫') {
                  return (
                    <button
                      key={i}
                      onClick={handleDelete}
                      disabled={locked}
                      className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 disabled:opacity-40 transition-all flex items-center justify-center text-slate-300 hover:text-white"
                    >
                      <Icon name="BackspaceIcon" size={20} />
                    </button>
                  );
                }
                return (
                  <button
                    key={i}
                    onClick={() => handleDigit(d)}
                    disabled={locked}
                    className="h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 disabled:opacity-40 transition-all text-xl font-600 text-white"
                  >
                    {d}
                  </button>
                );
              })}
            </div>

            {/* Confirm button */}
            <button
              onClick={handleSubmit}
              disabled={pin.length < 4 || loading || locked}
              className="w-full h-14 rounded-xl bg-pink-500 text-white text-base font-700 hover:bg-pink-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mb-3"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Vérification…
                </>
              ) : (
                <>
                  <Icon name="ArrowRightCircleIcon" size={20} />
                  Ouvrir la caisse
                </>
              )}
            </button>

            <button
              onClick={() => { setStep('select'); setPin(''); setError(''); }}
              className="w-full py-2.5 text-slate-400 hover:text-slate-200 text-sm transition-colors flex items-center justify-center gap-1.5"
            >
              <Icon name="ArrowLeftIcon" size={14} />
              Changer d'employé
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
