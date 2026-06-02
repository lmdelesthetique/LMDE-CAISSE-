'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { deliveryService, type Delivery, DELIVERY_STATUS_CONFIG } from '@/lib/services/deliveryService';
import SignaturePad from '@/components/SignaturePad';

const SESSION_KEY = 'beautypos_driver_session';

interface DriverSession {
  driverId: string;
  name: string;
  role: string;
}

function getSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function DeliveryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [session, setSession] = useState<DriverSession | null>(null);
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkedItems, setCheckedItems] = useState<boolean[]>([]);

  // Confirmation form state
  const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [driverNotes, setDriverNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmSuccess, setConfirmSuccess] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Auth check
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== 'driver') { router.replace('/livreur/login'); return; }
    setSession(s);
  }, [router]);

  const loadDelivery = useCallback(async () => {
    try {
      const d = await deliveryService.getById(id);
      if (!d) { router.replace('/livreur/dashboard'); return; }
      setDelivery(d);
      setCheckedItems(new Array(d.products?.length ?? 0).fill(false));
    } catch {
      router.replace('/livreur/dashboard');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!session) return;
    loadDelivery();
  }, [session, loadDelivery]);

  const allChecked = checkedItems.length === 0 || checkedItems.every(Boolean);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const clearPhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (photoInputRef.current) photoInputRef.current.value = '';
  };

  // Step 1: depart (assigned → en_route)
  const handleDepart = async () => {
    if (!delivery) return;
    setBusy(true);
    setActionError('');
    try {
      await deliveryService.startRoute(delivery.id);
      await loadDelivery();
    } catch { setActionError('Erreur. Réessayez.'); } finally { setBusy(false); }
  };

  // Step 2: arrived (en_route → arrived)
  const handleMarkArrived = async () => {
    if (!delivery) return;
    setBusy(true);
    setActionError('');
    try {
      await deliveryService.markArrived(delivery.id);
      await loadDelivery();
    } catch { setActionError('Erreur. Réessayez.'); } finally { setBusy(false); }
  };

  // Step 3: confirm delivery (arrived → delivered)
  const handleConfirm = async () => {
    if (!delivery) return;
    setActionError('');
    setBusy(true);
    try {
      let signatureUrl: string | undefined;
      let photoUrl: string | undefined;

      if (signatureBase64) {
        signatureUrl = await deliveryService.uploadSignature(delivery.id, signatureBase64);
      }
      if (photoFile) {
        photoUrl = await deliveryService.uploadPhoto(delivery.id, photoFile);
      }
      await deliveryService.confirmDelivery(delivery.id, {
        signatureUrl,
        photoUrl,
        driverNotes: driverNotes.trim() || undefined,
      });
      setConfirmSuccess(true);
      setTimeout(() => router.replace('/livreur/dashboard'), 2000);
    } catch {
      setActionError('Erreur lors de la confirmation. Réessayez.');
    } finally {
      setBusy(false);
    }
  };

  // Report problem
  const handleProblem = async () => {
    if (!delivery) return;
    if (!confirm('Signaler un problème pour cette livraison ?')) return;
    setBusy(true);
    try {
      await fetch(`/api/livraisons/${delivery.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'problem' }),
      });
      router.replace('/livreur/dashboard');
    } catch { setActionError('Erreur. Réessayez.'); } finally { setBusy(false); }
  };

  if (!session || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!delivery) return null;

  const products = delivery.products ?? [];
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(delivery.deliveryAddress)}`;
  const cfg = DELIVERY_STATUS_CONFIG[delivery.status] ?? DELIVERY_STATUS_CONFIG.pending;

  if (confirmSuccess) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-black text-green-800">Livraison confirmée !</h1>
        <p className="text-green-700 mt-2">Redirection en cours…</p>
      </div>
    );
  }

  const isActive = ['pending', 'assigned', 'en_route', 'arrived'].includes(delivery.status);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 sticky top-0 z-30">
        <div className="flex items-center gap-3 py-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold text-gray-900 truncate">Livraison</h1>
            {delivery.shopifyOrderNumber && (
              <p className="text-xs text-gray-400 font-mono">#{delivery.shopifyOrderNumber}</p>
            )}
          </div>
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>

        {/* Progress bar */}
        <WorkflowProgress status={delivery.status} />
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* ── Section 1 — Client info ── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Destinataire</p>
          <div>
            <p className="text-2xl font-black text-gray-900 leading-tight">{delivery.clientName}</p>
            {delivery.clientPhone && (
              <a href={`tel:${delivery.clientPhone}`} className="inline-flex items-center gap-1.5 text-blue-600 font-semibold text-sm mt-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {delivery.clientPhone}
              </a>
            )}
          </div>

          <div className="flex items-start gap-2 pt-1">
            <span className="text-lg mt-0.5">📍</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-700 leading-snug">{delivery.deliveryAddress}</p>
            </div>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 px-3 py-2 bg-blue-500 text-white text-xs font-bold rounded-xl hover:bg-blue-600 transition-colors"
            >
              Maps
            </a>
          </div>

          {delivery.deliveryNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-800">
              ⚠️ {delivery.deliveryNotes}
            </div>
          )}

          {delivery.totalAmount != null && (
            <p className="text-sm font-bold text-gray-800">💰 {delivery.totalAmount.toFixed(2)} €</p>
          )}
        </div>

        {/* ── Section 2 — Products checklist ── */}
        {products.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Produits à livrer</p>
              <span className="text-xs font-bold text-gray-500">
                {checkedItems.filter(Boolean).length}/{products.length}
              </span>
            </div>

            <div className="space-y-2">
              {products.map((p, i) => (
                <label
                  key={i}
                  className={[
                    'flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all select-none',
                    checkedItems[i] ? 'bg-green-50 border-green-300' : 'bg-gray-50 border-gray-200',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checkedItems[i] ?? false}
                    onChange={() => {
                      const next = [...checkedItems];
                      next[i] = !next[i];
                      setCheckedItems(next);
                    }}
                  />
                  <div className={[
                    'w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all',
                    checkedItems[i] ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300',
                  ].join(' ')}>
                    {checkedItems[i] && (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {p.imageUrl && (
                    <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 bg-gray-100" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold leading-tight ${checkedItems[i] ? 'text-green-800 line-through' : 'text-gray-900'}`}>
                      {p.name}
                    </p>
                    {p.sku && <p className="text-xs text-gray-400 font-mono">{p.sku}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-black text-gray-700 bg-white border border-gray-200 px-2 py-1 rounded-lg">
                    ×{p.qty}
                  </span>
                </label>
              ))}
            </div>

            {!allChecked && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center font-semibold">
                ✓ Cochez tous les articles avant de continuer
              </p>
            )}
          </div>
        )}

        {/* ── Section 3 — Workflow actions ── */}

        {/* STEP 1: Depart (pending / assigned) */}
        {(delivery.status === 'pending' || delivery.status === 'assigned') && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Étape 1 — Départ</p>
            <button
              onClick={handleDepart}
              disabled={busy || !allChecked}
              className="w-full py-4 bg-orange-500 text-white font-black text-lg rounded-xl hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <SpinLabel text="Démarrage…" /> : '▶️ Partir en livraison'}
            </button>
            {actionError && <ErrorBanner msg={actionError} />}
            <ProblemBtn onClick={handleProblem} disabled={busy} />
          </div>
        )}

        {/* STEP 2: Arrived (en_route) */}
        {delivery.status === 'en_route' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Étape 2 — Arrivée</p>
            <button
              onClick={handleMarkArrived}
              disabled={busy}
              className="w-full py-4 bg-blue-500 text-white font-black text-lg rounded-xl hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <SpinLabel text="Mise à jour…" /> : '📍 Je suis arrivé'}
            </button>
            {actionError && <ErrorBanner msg={actionError} />}
            <ProblemBtn onClick={handleProblem} disabled={busy} />
          </div>
        )}

        {/* STEP 3: Confirm delivery (arrived) */}
        {delivery.status === 'arrived' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Étape 3 — Confirmation</p>

            {/* Photo */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">
                📸 Photo <span className="text-gray-400 font-normal">(optionnelle)</span>
              </p>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={handlePhotoChange}
              />
              {photoPreview ? (
                <div className="relative">
                  <img src={photoPreview} alt="Preview" className="w-full h-40 object-cover rounded-xl border-2 border-green-300" />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    className="absolute top-2 right-2 w-7 h-7 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-600 hover:text-red-500 shadow"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-gray-300 rounded-xl flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
                >
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                  </svg>
                  <span className="text-xs font-semibold">Prendre une photo</span>
                </button>
              )}
            </div>

            {/* Signature */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">
                ✍️ Signature client <span className="text-gray-400 font-normal">(optionnelle)</span>
              </p>
              <SignaturePad
                onSave={(b64) => setSignatureBase64(b64)}
                onClear={() => setSignatureBase64(null)}
                width={320}
                height={160}
              />
            </div>

            {/* Notes */}
            <div>
              <p className="text-sm font-bold text-gray-700 mb-2">
                📝 Notes <span className="text-gray-400 font-normal">(optionnelles)</span>
              </p>
              <textarea
                value={driverNotes}
                onChange={(e) => setDriverNotes(e.target.value)}
                placeholder="Laissé devant la porte, interphone cassé…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 focus:border-orange-400 focus:outline-none text-sm resize-none transition-colors"
              />
            </div>

            {actionError && <ErrorBanner msg={actionError} />}

            <button
              onClick={handleConfirm}
              disabled={busy || !allChecked}
              className="w-full py-4 bg-green-500 text-white font-black text-lg rounded-xl hover:bg-green-600 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? <SpinLabel text="Confirmation…" /> : '✅ Livré'}
            </button>
            <ProblemBtn onClick={handleProblem} disabled={busy} />
          </div>
        )}

        {/* Done */}
        {delivery.status === 'delivered' && (
          <div className="bg-green-50 rounded-2xl border border-green-200 p-6 text-center">
            <p className="text-3xl mb-2">✅</p>
            <p className="font-black text-green-800 text-lg">Livraison effectuée</p>
            {delivery.deliveredAt && (
              <p className="text-xs text-green-600 mt-1">
                {new Date(delivery.deliveredAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {/* Problem */}
        {delivery.status === 'problem' && (
          <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-center">
            <p className="text-3xl mb-2">⚠️</p>
            <p className="font-black text-red-800 text-lg">Problème signalé</p>
            <p className="text-sm text-red-600 mt-1">Le responsable a été notifié</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow progress indicator ──────────────────────────────────────────────

const STEPS = [
  { key: 'assigned',  label: 'Assigné' },
  { key: 'en_route',  label: 'En route' },
  { key: 'arrived',   label: 'Arrivé' },
  { key: 'delivered', label: 'Livré' },
];

function WorkflowProgress({ status }: { status: string }) {
  const idx = STEPS.findIndex((s) => s.key === status);
  if (idx < 0) return null;
  return (
    <div className="flex items-center gap-0 pb-3 overflow-x-auto">
      {STEPS.map((step, i) => {
        const done  = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div className={`h-0.5 flex-1 min-w-[16px] ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
            <div className="flex flex-col items-center shrink-0">
              <div className={[
                'w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all',
                done   ? 'bg-green-500 border-green-500 text-white' :
                active ? 'bg-orange-500 border-orange-500 text-white' :
                         'bg-white border-gray-300 text-gray-400',
              ].join(' ')}>
                {done ? '✓' : i + 1}
              </div>
              <span className={`text-[9px] font-semibold mt-0.5 ${active ? 'text-orange-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
                {step.label}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

function SpinLabel({ text }: { text: string }) {
  return (
    <span className="flex items-center justify-center gap-2">
      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      {text}
    </span>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 text-center font-semibold">
      {msg}
    </div>
  );
}

function ProblemBtn({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full py-2.5 border-2 border-red-200 text-red-500 font-semibold text-sm rounded-xl hover:bg-red-50 active:scale-95 transition-all disabled:opacity-40"
    >
      ⚠️ Signaler un problème
    </button>
  );
}
