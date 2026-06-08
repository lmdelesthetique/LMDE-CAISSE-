'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import { driverService, type Driver, type CreateDriverInput } from '@/lib/services/driverService';

async function apiDriver(url: string, method: string, body?: object): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return res.ok ? { ok: true } : { ok: false, error: data.error ?? `HTTP ${res.status}` };
}

function generatePin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

const EMPTY_FORM: CreateDriverInput = {
  firstName: '',
  lastName: '',
  phone: '',
  pinCode: '',
  notes: '',
};

// ─── Driver form modal ────────────────────────────────────────────────────────

interface DriverModalProps {
  driver?: Driver | null;
  onClose: () => void;
  onSaved: (isEdit: boolean) => void;
}

function DriverModal({ driver, onClose, onSaved }: DriverModalProps) {
  const isEdit = !!driver;
  const [form, setForm] = useState<CreateDriverInput>({
    firstName: driver?.firstName ?? '',
    lastName: driver?.lastName ?? '',
    phone: driver?.phone ?? '',
    pinCode: driver?.pinCode ?? '',
    notes: driver?.notes ?? '',
  });
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('Prénom et nom requis.'); return; }
    if (!form.phone.trim()) { setError('Téléphone requis.'); return; }
    if (form.pinCode.length !== 4 || !/^\d{4}$/.test(form.pinCode)) { setError('PIN doit être 4 chiffres.'); return; }
    setError('');
    setSaving(true);
    try {
      const payload = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        pinCode: form.pinCode,
        notes: form.notes || null,
      };
      const result = isEdit
        ? await apiDriver(`/api/livreurs/${driver!.id}`, 'PATCH', payload)
        : await apiDriver('/api/livreurs', 'POST', payload);

      if (!result.ok) {
        const msg = result.error ?? 'Erreur inconnue';
        if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('23505')) {
          setError('Ce numéro de téléphone est déjà utilisé.');
        } else {
          setError(msg);
        }
        return;
      }
      onSaved(isEdit);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? 'Erreur inconnue lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-white rounded-t-3xl md:rounded-2xl shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900">{isEdit ? 'Modifier le livreur' : 'Nouveau livreur'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Prénom *</label>
              <input type="text" value={form.firstName} onChange={set('firstName')} placeholder="Marie" className="input" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nom *</label>
              <input type="text" value={form.lastName} onChange={set('lastName')} placeholder="Dupont" className="input" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Téléphone *</label>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+596 696 00 00 00" className="input" required />
            <p className="text-xs text-gray-400 mt-1">Utilisé pour la connexion au portail livreur</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Code PIN *</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={form.pinCode}
                  onChange={(e) => setForm((f) => ({ ...f, pinCode: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                  placeholder="4 chiffres"
                  inputMode="numeric"
                  maxLength={4}
                  className="input pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm"
                >
                  {showPin ? '🙈' : '👁️'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => { const p = generatePin(); setForm((f) => ({ ...f, pinCode: p })); setShowPin(true); }}
                className="px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Générer
              </button>
            </div>
            {form.pinCode.length === 4 && showPin && (
              <p className="text-sm font-mono font-bold text-orange-600 mt-1.5 bg-orange-50 px-3 py-1.5 rounded-lg">
                PIN : {form.pinCode}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Notes</label>
            <textarea
              value={form.notes ?? ''}
              onChange={set('notes')}
              placeholder="Zone de livraison, véhicule…"
              rows={2}
              className="input resize-none"
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-3 border-2 border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-colors">Annuler</button>
            <button type="submit" disabled={saving} className="flex-1 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors disabled:opacity-50">
              {saving ? 'Sauvegarde…' : isEdit ? 'Enregistrer' : 'Créer'}
            </button>
          </div>
        </form>

        <style jsx>{`
          .input { width:100%; padding:0.625rem 0.875rem; border:2px solid #e5e7eb; border-radius:0.75rem; font-size:0.875rem; outline:none; transition:border-color 0.15s; }
          .input:focus { border-color: #f97316; }
        `}</style>
      </div>
    </div>
  );
}

// ─── PIN display ──────────────────────────────────────────────────────────────

function PinDisplay({ pin }: { pin: string }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(pin).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`font-mono text-sm font-bold ${visible ? 'text-orange-700' : 'text-gray-300'}`}>
        {visible ? pin : '••••'}
      </span>
      <button
        onClick={() => setVisible((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors p-1"
        title={visible ? 'Masquer' : 'Afficher'}
      >
        {visible ? '🙈' : '👁️'}
      </button>
      {visible && (
        <button
          onClick={handleCopy}
          className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
          title="Copier"
        >
          {copied ? '✓' : 'Copier'}
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LivreursPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [testingPushId, setTestingPushId] = useState<string | null>(null);
  const [pushResults, setPushResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const load = useCallback(async () => {
    try {
      const data = await driverService.getAllWithDeliveryCounts();
      setDrivers(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const handleSaved = useCallback((isEdit: boolean) => {
    load();
    setSuccessMsg(isEdit ? '✅ Livreur modifié !' : '✅ Livreur créé !');
    setTimeout(() => setSuccessMsg(''), 3000);
  }, [load]);

  useEffect(() => { load(); }, [load]);

  const handleToggleStatus = async (driver: Driver) => {
    setTogglingId(driver.id);
    try {
      await apiDriver(`/api/livreurs/${driver.id}`, 'PATCH', {
        status: driver.status === 'active' ? 'inactive' : 'active',
      });
      await load();
    } catch { /* ignore */ } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (driver: Driver) => {
    if (!confirm(`Supprimer ${driver.firstName} ${driver.lastName} ? Cette action est irréversible.`)) return;
    setDeletingId(driver.id);
    try {
      await apiDriver(`/api/livreurs/${driver.id}`, 'DELETE');
      await load();
    } catch { /* ignore */ } finally {
      setDeletingId(null);
    }
  };

  const handleTestPush = async (driver: Driver) => {
    setTestingPushId(driver.id);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: driver.id,
          title: '🔔 Test BeautyPOS',
          pushBody: `Test envoyé à ${driver.firstName}`,
          url: '/livreur/dashboard',
        }),
      });
      const data = await res.json();
      setPushResults((prev) => ({
        ...prev,
        [driver.id]: data.ok
          ? { ok: true, msg: '✅ Envoyée !' }
          : { ok: false, msg: `❌ ${data.error || 'Erreur'}` },
      }));
    } catch {
      setPushResults((prev) => ({ ...prev, [driver.id]: { ok: false, msg: '❌ Erreur réseau' } }));
    } finally {
      setTestingPushId(null);
    }
  };

  const activeCount   = drivers.filter((d) => d.status === 'active').length;
  const onlineCount   = drivers.filter((d) => d.driverStatus === 'on').length;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="border-b border-border bg-white px-6 lg:px-8 py-4 sticky top-0 z-20">
          <div className="max-w-screen-xl mx-auto flex items-center justify-between">
            <div>
              <a href="/livraisons" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-pink-600 font-medium transition-colors mb-1">
                <span>←</span> Livraisons
              </a>
              <h1 className="text-2xl font-semibold text-foreground">Livreurs</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Gestion des livreurs et accès au portail</p>
            </div>
            <button
              onClick={() => { setEditingDriver(null); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Nouveau livreur
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center gap-2 text-sm font-semibold text-green-800">
            {successMsg}
          </div>
        )}

        <div className="max-w-screen-xl mx-auto px-6 lg:px-8 py-6 space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'Livreurs actifs',  value: activeCount,          bg: 'bg-green-50 border-green-200',  color: 'text-green-700' },
              { label: 'En ligne',         value: onlineCount,          bg: 'bg-blue-50 border-blue-200',    color: 'text-blue-700'  },
              { label: 'Total livreurs',   value: drivers.length,       bg: 'bg-gray-50 border-gray-200',    color: 'text-gray-700'  },
            ].map((k) => (
              <div key={k.label} className={`rounded-xl border px-4 py-3 ${k.bg}`}>
                <p className={`text-2xl font-black tabular-nums ${k.color}`}>{loading ? '—' : k.value}</p>
                <p className="text-xs font-semibold text-gray-600 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Driver list */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : drivers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
              <p className="text-4xl mb-3">🚴</p>
              <p className="font-semibold text-gray-700">Aucun livreur</p>
              <p className="text-sm text-gray-400 mt-1">Ajoutez votre premier livreur pour commencer</p>
              <button
                onClick={() => { setEditingDriver(null); setShowModal(true); }}
                className="mt-4 px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 transition-colors text-sm"
              >
                Ajouter un livreur
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Livreur</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Téléphone</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">PIN</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Livraisons</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider">Statut</th>
                      <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Notes</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {drivers.map((driver) => (
                      <tr key={driver.id} className={`hover:bg-gray-50 transition-colors ${driver.status === 'inactive' ? 'opacity-50' : ''}`}>
                        {/* Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
                              <span className="text-sm font-bold text-orange-700">
                                {driver.firstName[0]}{driver.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <p className="font-bold text-gray-900">{driver.firstName} {driver.lastName}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${driver.driverStatus === 'on' ? 'bg-green-400' : 'bg-gray-300'}`} />
                                <span className="text-[10px] text-gray-400">{driver.driverStatus === 'on' ? 'En ligne' : 'Hors ligne'}</span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Phone */}
                        <td className="px-4 py-3">
                          <a href={`tel:${driver.phone}`} className="text-sm text-blue-600 hover:underline">{driver.phone}</a>
                        </td>

                        {/* PIN */}
                        <td className="px-4 py-3">
                          <PinDisplay pin={driver.pinCode} />
                        </td>

                        {/* Deliveries count */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-sm font-bold text-gray-700">{driver.deliveriesCount ?? 0}</span>
                          <span className="text-xs text-gray-400 ml-1">livraison{(driver.deliveriesCount ?? 0) !== 1 ? 's' : ''}</span>
                        </td>

                        {/* Status toggle */}
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleToggleStatus(driver)}
                            disabled={togglingId === driver.id}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50 ${
                              driver.status === 'active'
                                ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${driver.status === 'active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {togglingId === driver.id ? '…' : driver.status === 'active' ? 'Actif' : 'Inactif'}
                          </button>
                        </td>

                        {/* Notes */}
                        <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]">
                          <p className="text-xs text-gray-500 truncate">{driver.notes ?? '—'}</p>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => { setEditingDriver(driver); setShowModal(true); }}
                              className="text-xs text-gray-500 hover:text-gray-800 font-semibold transition-colors px-2 py-1 rounded hover:bg-gray-100"
                            >
                              Modifier
                            </button>
                            <button
                              onClick={() => handleDelete(driver)}
                              disabled={deletingId === driver.id}
                              className="text-xs text-red-400 hover:text-red-600 font-semibold transition-colors px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50"
                            >
                              {deletingId === driver.id ? '…' : 'Supprimer'}
                            </button>
                            <button
                              onClick={() => handleTestPush(driver)}
                              disabled={testingPushId === driver.id}
                              className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded border border-orange-300 hover:bg-orange-200 disabled:opacity-50 transition-colors"
                            >
                              {testingPushId === driver.id ? '…' : '🔔 Tester'}
                            </button>
                            {pushResults[driver.id] && (
                              <span className={`text-xs font-semibold ${pushResults[driver.id].ok ? 'text-green-600' : 'text-red-600'}`}>
                                {pushResults[driver.id].msg}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Portal link info */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="font-bold text-orange-800">🚚 Portail Livreur</p>
            <p className="text-sm text-orange-600 mt-1">Les livreurs se connectent sur :</p>
            <p className="font-mono font-bold text-orange-800 mt-1">lmdecaisse.com/livreur/login</p>
            <p className="text-sm text-orange-600 mt-2">Avec leur téléphone et code PIN</p>
            <a
              href="/livreur/login"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-orange-600 transition-colors"
            >
              Ouvrir le portail →
            </a>
          </div>
        </div>
      </div>

      {showModal && (
        <DriverModal
          driver={editingDriver}
          onClose={() => { setShowModal(false); setEditingDriver(null); }}
          onSaved={handleSaved}
        />
      )}
    </AppLayout>
  );
}
