'use client';

import React, { useState, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import {
  employeeService,
  type Employee,
  type EmployeeRole,
  type EmployeeStatus,
  type EmployeePermissions,
  type CreateEmployeeInput,
  ROLE_CONFIG,
  STATUS_CONFIG,
  PERMISSION_LABELS,
  DEFAULT_PERMISSIONS_BY_ROLE,
} from '@/lib/services/employeeService';

interface EmployeeFormModalProps {
  employee?: Employee | null;
  onClose: () => void;
  onSaved: (emp: Employee) => void;
}

const ROLES: EmployeeRole[] = ['admin', 'manager', 'cashier', 'stock_manager', 'sales_rep'];
const STATUSES: EmployeeStatus[] = ['active', 'inactive', 'on_leave', 'terminated'];

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export default function EmployeeFormModal({ employee, onClose, onSaved }: EmployeeFormModalProps) {
  const isEdit = !!employee;
  const [tab, setTab] = useState<'profile' | 'permissions' | 'objectives'>('profile');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(employee?.firstName ?? '');
  const [lastName, setLastName] = useState(employee?.lastName ?? '');
  const [email, setEmail] = useState(employee?.email ?? '');
  const [phone, setPhone] = useState(employee?.phone ?? '');
  const [role, setRole] = useState<EmployeeRole>(employee?.role ?? 'cashier');
  const [status, setStatus] = useState<EmployeeStatus>(employee?.status ?? 'active');
  const [posPin, setPosPin] = useState(employee?.posPin ?? '');
  const [hireDate, setHireDate] = useState(employee?.hireDate ?? '');
  const [notes, setNotes] = useState(employee?.notes ?? '');
  const [monthlyObjective, setMonthlyObjective] = useState(String(employee?.monthlyObjective ?? 0));
  const [permissions, setPermissions] = useState<EmployeePermissions>(
    employee?.permissions ?? DEFAULT_PERMISSIONS_BY_ROLE['cashier']
  );

  // Driver portal state
  const [isDeliveryDriver, setIsDeliveryDriver] = useState(employee?.isDeliveryDriver ?? false);
  const [portalPhone, setPortalPhone] = useState(employee?.portalPhone ?? '');
  const [portalPin, setPortalPin] = useState(employee?.portalPin ?? '');
  const [showPortalPin, setShowPortalPin] = useState(false);

  // Objective form
  const now = new Date();
  const [objYear, setObjYear] = useState(now.getFullYear());
  const [objMonth, setObjMonth] = useState(now.getMonth() + 1);
  const [objRevenue, setObjRevenue] = useState('');
  const [objTickets, setObjTickets] = useState('');
  const [objNotes, setObjNotes] = useState('');
  const [objSaving, setObjSaving] = useState(false);
  const [objSuccess, setObjSuccess] = useState(false);

  // When role changes, update default permissions
  const handleRoleChange = (r: EmployeeRole) => {
    setRole(r);
    setPermissions(DEFAULT_PERMISSIONS_BY_ROLE[r]);
  };

  const togglePermission = (key: keyof EmployeePermissions) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('Prénom et nom sont obligatoires.');
      return;
    }
    if (posPin && (posPin.length < 4 || posPin.length > 6 || !/^\d+$/.test(posPin))) {
      setError('Le PIN doit être composé de 4 à 6 chiffres.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const input: CreateEmployeeInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        role,
        status,
        posPin: posPin.trim() || undefined,
        hireDate: hireDate || undefined,
        notes: notes.trim() || undefined,
        permissions,
        monthlyObjective: parseFloat(monthlyObjective) || 0,
      };
      const driverInput = {
        isDeliveryDriver,
        portalPhone: portalPhone.trim() || undefined,
        portalPin: portalPin.trim() || undefined,
      };
      let saved: Employee;
      if (isEdit && employee) {
        saved = await employeeService.update({ id: employee.id, ...input, ...driverInput });
      } else {
        saved = await employeeService.create({ ...input, ...driverInput });
      }
      onSaved(saved);
    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveObjective = async () => {
    if (!employee) return;
    setObjSaving(true);
    try {
      await employeeService.upsertObjective({
        employeeId: employee.id,
        year: objYear,
        month: objMonth,
        targetRevenue: parseFloat(objRevenue) || 0,
        targetTickets: parseInt(objTickets) || 0,
        notes: objNotes.trim() || undefined,
      });
      setObjSuccess(true);
      setTimeout(() => setObjSuccess(false), 2000);
    } catch (e: any) {
      setError(e.message ?? 'Erreur objectif.');
    } finally {
      setObjSaving(false);
    }
  };

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '??';
  const roleConf = ROLE_CONFIG[role] ?? { label: role, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: 'UserIcon' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-border">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <span className="text-lg font-700 text-primary">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-700 text-foreground">
              {isEdit ? `Modifier — ${employee?.fullName}` : 'Nouvel employé'}
            </h2>
            <p className="text-sm text-muted-foreground">{isEdit ? 'Mettre à jour le profil' : 'Créer un nouveau profil employé'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border px-6">
          {(['profile', 'permissions', ...(isEdit ? ['objectives'] : [])] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t as any)}
              className={`px-4 py-3 text-sm font-500 border-b-2 transition-colors ${
                tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'profile' ? 'Profil' : t === 'permissions' ? 'Permissions' : 'Objectifs'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <Icon name="ExclamationCircleIcon" size={16} />
              {error}
            </div>
          )}

          {/* PROFILE TAB */}
          {tab === 'profile' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Prénom *</label>
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Nom *</label>
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemple.fr"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Téléphone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="06 XX XX XX XX"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Rôle</label>
                  <select
                    value={role}
                    onChange={(e) => handleRoleChange(e.target.value as EmployeeRole)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_CONFIG[r].label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Statut</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as EmployeeStatus)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">
                    PIN Caisse
                    <span className="ml-1 text-xs text-muted-foreground">(4–6 chiffres)</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={posPin}
                      onChange={(e) => setPosPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••"
                      maxLength={6}
                      className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary font-mono tracking-widest"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <Icon name={showPin ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Date d'embauche</label>
                  <input
                    type="date"
                    value={hireDate}
                    onChange={(e) => setHireDate(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Objectif mensuel (€)</label>
                <input
                  type="number"
                  min="0"
                  value={monthlyObjective}
                  onChange={(e) => setMonthlyObjective(e.target.value)}
                  placeholder="5000"
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Notes internes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Informations internes sur l'employé..."
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>

              {/* Driver portal section */}
              <div className="pt-2 border-t border-border">
                <div
                  className="flex items-center justify-between cursor-pointer py-1"
                  onClick={() => setIsDeliveryDriver((v) => !v)}
                >
                  <div>
                    <p className="text-sm font-600 text-foreground">🚚 Portail Livreur</p>
                    <p className="text-xs text-muted-foreground">Accès à l'application mobile de livraison</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${isDeliveryDriver ? 'bg-orange-500' : 'bg-muted'}`}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isDeliveryDriver ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </div>
                </div>

                {isDeliveryDriver && (
                  <div className="mt-3 space-y-3 pl-1">
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">Téléphone portail</label>
                      <input
                        type="tel"
                        value={portalPhone}
                        onChange={(e) => setPortalPhone(e.target.value)}
                        placeholder="+596 696 00 00 00"
                        className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-500 text-foreground mb-1.5">
                        PIN livraison
                        <span className="ml-1 text-xs text-muted-foreground">(4 chiffres)</span>
                      </label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type={showPortalPin ? 'text' : 'password'}
                            value={portalPin}
                            onChange={(e) => setPortalPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                            placeholder="••••"
                            maxLength={4}
                            className="w-full border border-border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-orange-400 font-mono tracking-widest"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPortalPin((p) => !p)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            <Icon name={showPortalPin ? 'EyeSlashIcon' : 'EyeIcon'} size={16} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPortalPin(String(Math.floor(1000 + Math.random() * 9000)))}
                          className="shrink-0 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold rounded-lg hover:bg-orange-100 transition-colors"
                        >
                          Générer
                        </button>
                      </div>
                      {portalPin.length === 4 && (
                        <p className="text-xs text-orange-600 mt-1 font-mono">PIN : {portalPin}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PERMISSIONS TAB */}
          {tab === 'permissions' && (
            <div className="space-y-3">
              <div className={`flex items-center gap-3 p-3 rounded-xl border ${roleConf.color} mb-4`}>
                <Icon name={roleConf.icon as any} size={18} />
                <div>
                  <p className="text-sm font-600">Rôle : {roleConf.label}</p>
                  <p className="text-xs opacity-80">Les permissions par défaut ont été appliquées. Vous pouvez les personnaliser.</p>
                </div>
              </div>
              {(Object.keys(PERMISSION_LABELS) as (keyof EmployeePermissions)[]).map((key) => {
                const conf = PERMISSION_LABELS[key];
                const enabled = permissions[key];
                return (
                  <div
                    key={key}
                    onClick={() => togglePermission(key)}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      enabled
                        ? 'bg-primary/5 border-primary/30' :'bg-white border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${enabled ? 'bg-primary/10' : 'bg-muted'}`}>
                      <Icon name={conf.icon as any} size={18} className={enabled ? 'text-primary' : 'text-muted-foreground'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-500 ${enabled ? 'text-foreground' : 'text-muted-foreground'}`}>{conf.label}</p>
                      <p className="text-xs text-muted-foreground">{conf.description}</p>
                    </div>
                    <div className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${enabled ? 'bg-primary' : 'bg-muted'}`}>
                      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* OBJECTIVES TAB */}
          {tab === 'objectives' && isEdit && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">Définissez les objectifs mensuels pour cet employé.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Mois</label>
                  <select
                    value={objMonth}
                    onChange={(e) => setObjMonth(parseInt(e.target.value))}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
                  >
                    {MONTHS.map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Année</label>
                  <input
                    type="number"
                    value={objYear}
                    onChange={(e) => setObjYear(parseInt(e.target.value))}
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Objectif CA (€)</label>
                  <input
                    type="number"
                    min="0"
                    value={objRevenue}
                    onChange={(e) => setObjRevenue(e.target.value)}
                    placeholder="5000"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-500 text-foreground mb-1.5">Objectif tickets</label>
                  <input
                    type="number"
                    min="0"
                    value={objTickets}
                    onChange={(e) => setObjTickets(e.target.value)}
                    placeholder="80"
                    className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-500 text-foreground mb-1.5">Notes</label>
                <textarea
                  value={objNotes}
                  onChange={(e) => setObjNotes(e.target.value)}
                  rows={2}
                  placeholder="Commentaire sur l'objectif..."
                  className="w-full border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                />
              </div>
              <button
                onClick={handleSaveObjective}
                disabled={objSaving}
                className={`w-full py-2.5 rounded-xl text-sm font-600 transition-colors ${
                  objSuccess
                    ? 'bg-emerald-500 text-white' :'bg-primary text-primary-foreground hover:bg-primary/90'
                } disabled:opacity-60`}
              >
                {objSaving ? 'Enregistrement...' : objSuccess ? '✓ Objectif enregistré' : 'Enregistrer l\'objectif'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {tab !== 'objectives' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-muted/30">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-500 text-muted-foreground hover:bg-muted transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 rounded-lg text-sm font-600 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {saving && <Icon name="ArrowPathIcon" size={14} className="animate-spin" />}
              {saving ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer l\'employé'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
