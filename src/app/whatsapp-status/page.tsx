'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';

interface ApiStatus {
  meta: {
    configured: boolean;
    phoneId: string | null;
    wabaId?: string;
    phoneNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    phoneStatus?: string;
    phoneError?: string | null;
  };
  token?: {
    valid: boolean;
    expiresAt?: string;
    isExpired?: boolean;
    error?: string;
    scopes?: string[];
  };
  brevo: { configured: boolean };
  resend: { configured: boolean };
  activeProvider: string;
  templates?: { count: number; approved: string[]; pending: string[] };
}

interface TestResult {
  ok: boolean;
  provider?: string;
  error?: string;
  waLink?: string;
}

const FLOWS = [
  {
    key: 'client',
    label: 'Client',
    icon: '👤',
    color: 'bg-blue-50 border-blue-200',
    titleColor: 'text-blue-800',
    description: 'Notification marketing, confirmation commande, livraison en route',
    placeholder: '+596 696 XX XX XX',
  },
  {
    key: 'livreur',
    label: 'Livreur',
    icon: '🚚',
    color: 'bg-emerald-50 border-emerald-200',
    titleColor: 'text-emerald-800',
    description: 'Nouvelle livraison assignée, annulation de livraison',
    placeholder: '+596 696 XX XX XX',
  },
  {
    key: 'ambassadrice',
    label: 'Ambassadrice',
    icon: '💅',
    color: 'bg-pink-50 border-pink-200',
    titleColor: 'text-pink-800',
    description: 'Nouvelle campagne, brief produit, rappel de contenu',
    placeholder: '+596 696 XX XX XX',
  },
  {
    key: 'fournisseur',
    label: 'Fournisseur',
    icon: '📦',
    color: 'bg-violet-50 border-violet-200',
    titleColor: 'text-violet-800',
    description: 'Nouvelle commande fournisseur, lien portail supplier',
    placeholder: '+33 6 XX XX XX XX',
  },
];

const TEST_MESSAGES: Record<string, string> = {
  client: `Bonjour 👋\n\nCeci est un test de notification client depuis BeautyPOS.\n\nLe Monde de l'Esthétique 💅`,
  livreur: `🚚 Test notification livreur\n\nCeci confirme que les notifications de livraison fonctionnent correctement.\n\nLe Monde de l'Esthétique`,
  ambassadrice: `💅 Test notification ambassadrice\n\nCeci confirme que les notifications ambassadrice fonctionnent.\n\nLe Monde de l'Esthétique`,
  fournisseur: `📦 Test notification fournisseur\n\nCeci confirme que les notifications fournisseur fonctionnent.\n\nLe Monde de l'Esthétique`,
};

export default function WhatsAppStatusPage() {
  const [apiStatus, setApiStatus] = useState<ApiStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [phones, setPhones] = useState<Record<string, string>>({
    client: '', livreur: '', ambassadrice: '', fournisseur: '',
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, TestResult>>({});

  // Raw diagnostic test
  const [rawPhone, setRawPhone] = useState('');
  const [rawTesting, setRawTesting] = useState(false);
  const [rawResult, setRawResult] = useState<any>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch('/api/debug/whatsapp-check');
      setApiStatus(await res.json());
    } catch {
      setApiStatus(null);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const sendRawTest = async () => {
    if (!rawPhone.trim()) return;
    setRawTesting(true);
    setRawResult(null);
    try {
      const res = await fetch('/api/debug/whatsapp-raw-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: rawPhone.trim(),
          templateName: 'campagne_site',
          language: 'fr',
          variables: ['Test', 'Ceci est un test WhatsApp depuis BeautyPOS 🌸'],
        }),
      });
      setRawResult(await res.json());
    } catch (e: any) {
      setRawResult({ ok: false, diagnosis: `Erreur réseau : ${e.message}` });
    } finally {
      setRawTesting(false);
    }
  };

  const sendTest = async (flowKey: string) => {
    const phone = phones[flowKey]?.trim();
    if (!phone) return;
    setTesting(flowKey);
    setResults(prev => ({ ...prev, [flowKey]: { ok: false } }));
    try {
      const res = await fetch('/api/debug/whatsapp-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, flowKey }),
      });
      const data = await res.json();
      setResults(prev => ({ ...prev, [flowKey]: data }));
    } catch (e: any) {
      setResults(prev => ({ ...prev, [flowKey]: { ok: false, error: e.message } }));
    } finally {
      setTesting(null);
    }
  };

  const isMetaOk = apiStatus?.meta?.configured;

  return (
    <AppLayout>
      <div className="p-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statut WhatsApp</h1>
          <p className="text-sm text-muted-foreground mt-1">Vérification de l'API et test d'envoi par type de destinataire</p>
        </div>

        {/* API Status Card */}
        <div className={`rounded-2xl border-2 p-5 ${isMetaOk ? 'bg-emerald-50 border-emerald-300' : 'bg-red-50 border-red-300'}`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-4 h-4 rounded-full ${isMetaOk ? 'bg-emerald-500 animate-pulse' : 'bg-red-400'}`} />
            <p className="text-base font-bold text-gray-900">
              {loadingStatus ? 'Vérification…' : isMetaOk ? 'Meta WhatsApp API — ACTIF ✅' : 'Meta WhatsApp API — INACTIF ❌'}
            </p>
            <button onClick={loadStatus} className="ml-auto text-xs text-gray-500 underline hover:text-gray-700">
              Rafraîchir
            </button>
          </div>

          {apiStatus && (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className={`rounded-xl p-3 border ${apiStatus.meta.configured ? 'bg-white border-emerald-200' : 'bg-white border-red-200'}`}>
                <p className="text-xs font-bold text-gray-500 mb-1">Meta API</p>
                <p className={`font-bold ${apiStatus.meta.configured ? 'text-emerald-600' : 'text-red-500'}`}>
                  {apiStatus.meta.configured ? '✅ Configuré' : '❌ Manquant'}
                </p>
                {apiStatus.meta.phoneId && (
                  <p className="text-xs text-gray-400 mt-1 font-mono truncate">{apiStatus.meta.phoneId}</p>
                )}
              </div>
              <div className={`rounded-xl p-3 border ${apiStatus.brevo.configured ? 'bg-white border-emerald-200' : 'bg-white border-gray-200'}`}>
                <p className="text-xs font-bold text-gray-500 mb-1">Brevo (fallback)</p>
                <p className={`font-bold ${apiStatus.brevo.configured ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {apiStatus.brevo.configured ? '✅ Configuré' : '— Non configuré'}
                </p>
              </div>
              <div className={`rounded-xl p-3 border ${apiStatus.resend.configured ? 'bg-white border-blue-200' : 'bg-white border-gray-200'}`}>
                <p className="text-xs font-bold text-gray-500 mb-1">Resend (email)</p>
                <p className={`font-bold ${apiStatus.resend.configured ? 'text-blue-600' : 'text-gray-400'}`}>
                  {apiStatus.resend.configured ? '✅ Configuré' : '— Non configuré'}
                </p>
              </div>
            </div>
          )}

          {apiStatus && (
            <div className="mt-3 p-3 bg-white/70 rounded-xl space-y-1">
              <p className="text-xs text-gray-500">Canal actif : <span className="font-bold text-gray-800">{apiStatus.activeProvider}</span></p>
              {apiStatus.meta.phoneNumber && apiStatus.meta.phoneNumber !== 'N/A' && (
                <p className="text-xs text-gray-500">Numéro : <span className="font-bold text-gray-800">{apiStatus.meta.phoneNumber}</span></p>
              )}
              {apiStatus.meta.verifiedName && apiStatus.meta.verifiedName !== 'N/A' && (
                <p className="text-xs text-gray-500">Nom vérifié : <span className="font-bold text-gray-800">{apiStatus.meta.verifiedName}</span></p>
              )}
              {apiStatus.meta.phoneStatus && (
                <p className="text-xs text-gray-500">Statut téléphone : <span className={`font-bold ${apiStatus.meta.phoneStatus === 'CONNECTED' ? 'text-emerald-600' : 'text-red-600'}`}>{apiStatus.meta.phoneStatus}</span></p>
              )}
              {apiStatus.meta.phoneError && (
                <p className="text-xs text-red-600 font-mono">Erreur : {apiStatus.meta.phoneError}</p>
              )}
              {/* Token validity */}
              {apiStatus.token && (
                <div className={`mt-2 pt-2 border-t border-white/50 rounded-lg px-2 py-1.5 ${apiStatus.token.valid ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                  <p className="text-xs font-bold">
                    Token : {apiStatus.token.valid ? '✅ Valide' : '❌ INVALIDE / EXPIRÉ'}
                  </p>
                  {apiStatus.token.expiresAt && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Expiration : <span className={apiStatus.token.isExpired ? 'text-red-600 font-bold' : 'text-gray-700'}>{apiStatus.token.expiresAt}</span>
                    </p>
                  )}
                  {apiStatus.token.error && (
                    <p className="text-xs text-red-600 font-mono mt-0.5">{apiStatus.token.error}</p>
                  )}
                  {!apiStatus.token.valid && (
                    <p className="text-xs text-red-700 font-bold mt-1">
                      ⚠️ Régénère le token dans Meta Business Manager → Paramètres → Comptes système → Générer un token permanent
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Templates list */}
        {apiStatus?.templates && (
          <div className="rounded-2xl border-2 border-gray-200 p-5 bg-white">
            <p className="text-sm font-bold text-gray-700 mb-3">
              Templates Meta ({apiStatus.templates.count} total)
            </p>
            {apiStatus.templates.approved.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wide mb-1.5">✅ Approuvés ({apiStatus.templates.approved.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {apiStatus.templates.approved.map(n => (
                    <span key={n} className="px-2 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono rounded-lg">{n}</span>
                  ))}
                </div>
              </div>
            )}
            {apiStatus.templates.pending.length > 0 && (
              <div>
                <p className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-1.5">⏳ En attente / Rejetés ({apiStatus.templates.pending.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {apiStatus.templates.pending.map(n => (
                    <span key={n} className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-mono rounded-lg">{n}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DIAGNOSTIC RAPIDE ── */}
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-bold text-amber-800 mb-1">🔬 Diagnostic — test template campagne_site</p>
          <p className="text-xs text-amber-700 mb-3">Entre ton numéro WhatsApp personnel. Tu dois recevoir un vrai message de test.</p>
          <div className="flex gap-2 mb-2">
            <input
              type="tel"
              value={rawPhone}
              onChange={(e) => setRawPhone(e.target.value)}
              placeholder="ex: 0696XXXXXX ou +596696XXXXXX"
              className="flex-1 px-3 py-2 text-sm border border-amber-300 rounded-xl bg-white focus:outline-none"
            />
            <button
              onClick={sendRawTest}
              disabled={rawTesting || !rawPhone.trim()}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-bold rounded-xl hover:bg-amber-700 disabled:opacity-40"
            >
              {rawTesting ? <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : 'Tester'}
            </button>
          </div>
          {rawResult && (
            <div className={`rounded-xl p-3 text-xs font-mono space-y-1 ${rawResult.ok ? 'bg-emerald-50 border border-emerald-300' : 'bg-red-50 border border-red-300'}`}>
              <p className="font-bold text-sm">{rawResult.diagnosis}</p>
              {rawResult.input && (
                <>
                  <p>📱 Numéro saisi : <span className="text-gray-700">{rawResult.input.rawPhone}</span></p>
                  <p>📤 Numéro envoyé à Meta : <span className="font-bold text-blue-700">+{rawResult.input.cleanedPhone}</span></p>
                  <p>📋 Template : <span className="text-gray-700">{rawResult.input.templateName}</span></p>
                </>
              )}
              {rawResult.metaResponse?.error && (
                <p className="text-red-700 font-bold">❌ Erreur Meta : {rawResult.metaResponse.error.message} (code {rawResult.metaResponse.error.code})</p>
              )}
              {rawResult.metaResponse?.messages?.[0]?.id && (
                <p className="text-emerald-700">✅ Message ID : {rawResult.metaResponse.messages[0].id}</p>
              )}
            </div>
          )}
        </div>

        {/* Flow tests */}
        <div>
          <p className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Tester chaque flux de notification</p>
          <div className="space-y-3">
            {FLOWS.map((flow) => {
              const result = results[flow.key];
              const isTesting = testing === flow.key;

              return (
                <div key={flow.key} className={`rounded-2xl border-2 p-4 ${flow.color}`}>
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl">{flow.icon}</span>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${flow.titleColor}`}>{flow.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{flow.description}</p>
                    </div>
                    {result && (
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${result.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                        {result.ok ? '✅ Envoyé' : '❌ Échec'}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phones[flow.key]}
                      onChange={(e) => setPhones(prev => ({ ...prev, [flow.key]: e.target.value }))}
                      placeholder={flow.placeholder}
                      className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:border-gray-400"
                    />
                    <button
                      onClick={() => sendTest(flow.key)}
                      disabled={isTesting || !phones[flow.key]?.trim() || !isMetaOk}
                      className="px-4 py-2 bg-gray-800 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40"
                    >
                      {isTesting ? (
                        <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : 'Tester'}
                    </button>
                  </div>

                  {result?.error && (
                    <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 font-mono">
                      {result.error}
                    </p>
                  )}
                  {result?.ok && result?.provider && (
                    <p className="mt-2 text-xs text-emerald-600">
                      Envoyé via <strong>{result.provider}</strong>
                      {result.waLink && (
                        <a href={result.waLink} target="_blank" rel="noopener noreferrer" className="ml-2 underline">
                          Ouvrir WhatsApp →
                        </a>
                      )}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Ecosystem recap */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
          <p className="text-sm font-bold text-gray-700 mb-3">Récapitulatif des notifications automatiques</p>
          <div className="space-y-2 text-xs text-gray-600">
            <div className="flex gap-2"><span>👤</span><span><strong>Client</strong> — Campagnes marketing (/marketing), confirmation livraison, box beauté prête</span></div>
            <div className="flex gap-2"><span>🚚</span><span><strong>Livreur</strong> — Nouvelle livraison assignée, annulation (déclenché depuis la caisse)</span></div>
            <div className="flex gap-2"><span>💅</span><span><strong>Ambassadrice</strong> — Accès PIN via /espace-ambassadrice/login (pas de WA automatique actuellement)</span></div>
            <div className="flex gap-2"><span>📦</span><span><strong>Fournisseur</strong> — Commande envoyée, lien portail supplier (bouton "Prévenir" dans Commandes Fournisseurs)</span></div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
