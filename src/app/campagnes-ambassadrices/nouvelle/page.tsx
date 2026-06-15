'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Ambassadrice {
  id: string;
  prenom: string;
  nom: string;
  grade: 'debutante' | 'confirmee' | 'elite';
  instagram_followers: number;
}

interface Product {
  id: string;
  name: string;
  sell_price_ttc: number;
  cost_price: number;
  stock: number;
  image_url: string | null;
}

interface AssignedProduct extends Product {
  quantity: number;
}

interface AssignmentDraft {
  ambassadriceId: string;
  products: AssignedProduct[];
  notes: string;
}

interface ScriptEntry {
  hooks: string[];
  reel: string;
  story: string;
  temoignage: string;
  guide: string;
  hashtags: string;
}

const GRADE_LABEL = {
  debutante: '⭐ Débutante',
  confirmee: '⭐⭐ Confirmée',
  elite: '⭐⭐⭐ Elite',
};

// ─── Step 1: Campaign Info ─────────────────────────────────────────────────────

function Step1({
  data,
  onChange,
}: {
  data: { nom: string; description: string; date_debut: string; date_fin: string; objectif: string };
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Informations de la campagne</h2>
      <Field label="Nom de la campagne *" value={data.nom} onChange={(v) => onChange('nom', v)} />
      <div>
        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description</label>
        <textarea
          value={data.description}
          onChange={(e) => onChange('description', e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none resize-none"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date début" type="date" value={data.date_debut} onChange={(v) => onChange('date_debut', v)} />
        <Field label="Date fin" type="date" value={data.date_fin} onChange={(v) => onChange('date_fin', v)} />
      </div>
      <Field label="Objectif" value={data.objectif} onChange={(v) => onChange('objectif', v)} placeholder="Ex: 3 reels par ambassadrice, couverture nouveau produit..." />
    </div>
  );
}

// ─── Step 2: Select Ambassadrices ─────────────────────────────────────────────

function Step2({
  all,
  selected,
  onToggle,
}: {
  all: Ambassadrice[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Sélectionner les ambassadrices</h2>
      {all.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune ambassadrice active trouvée.</p>
      ) : (
        <div className="space-y-2">
          {all.map((a) => {
            const isSelected = selected.includes(a.id);
            return (
              <button
                key={a.id}
                onClick={() => onToggle(a.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? 'bg-primary border-primary' : 'border-gray-300'}`}>
                  {isSelected && <span className="text-white text-xs">✓</span>}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{a.prenom} {a.nom}</p>
                  <p className="text-xs text-gray-500">
                    {GRADE_LABEL[a.grade]}
                    {a.instagram_followers > 0 ? ` · ${a.instagram_followers.toLocaleString('fr-FR')} abonnés` : ''}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Assign Products ───────────────────────────────────────────────────

function Step3({
  ambassadrices,
  selectedIds,
  assignments,
  onUpdate,
}: {
  ambassadrices: Ambassadrice[];
  selectedIds: string[];
  assignments: Record<string, AssignmentDraft>;
  onUpdate: (id: string, draft: AssignmentDraft) => void;
}) {
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, Product[]>>({});
  const [searching, setSearching] = useState<Record<string, boolean>>({});

  const doSearch = useCallback(async (ambassadriceId: string, q: string) => {
    if (q.length < 2) { setSearchResults((p) => ({ ...p, [ambassadriceId]: [] })); return; }
    setSearching((p) => ({ ...p, [ambassadriceId]: true }));
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=8`);
      const data = await res.json();
      setSearchResults((p) => ({ ...p, [ambassadriceId]: data.products ?? [] }));
    } finally {
      setSearching((p) => ({ ...p, [ambassadriceId]: false }));
    }
  }, []);

  const addProduct = (ambassadriceId: string, product: Product) => {
    const draft = assignments[ambassadriceId] ?? { ambassadriceId, products: [], notes: '' };
    if (draft.products.some((p) => p.id === product.id)) return;
    onUpdate(ambassadriceId, {
      ...draft,
      products: [...draft.products, { ...product, quantity: 1 }],
    });
    setSearchQuery((p) => ({ ...p, [ambassadriceId]: '' }));
    setSearchResults((p) => ({ ...p, [ambassadriceId]: [] }));
  };

  const removeProduct = (ambassadriceId: string, productId: string) => {
    const draft = assignments[ambassadriceId];
    if (!draft) return;
    onUpdate(ambassadriceId, { ...draft, products: draft.products.filter((p) => p.id !== productId) });
  };

  const updateQty = (ambassadriceId: string, productId: string, qty: number) => {
    const draft = assignments[ambassadriceId];
    if (!draft) return;
    onUpdate(ambassadriceId, {
      ...draft,
      products: draft.products.map((p) => p.id === productId ? { ...p, quantity: Math.max(1, qty) } : p),
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-900">Assigner les produits</h2>
      {selectedIds.map((ambassadriceId) => {
        const a = ambassadrices.find((x) => x.id === ambassadriceId);
        if (!a) return null;
        const draft = assignments[ambassadriceId] ?? { ambassadriceId, products: [], notes: '' };
        const q = searchQuery[ambassadriceId] ?? '';
        const results = searchResults[ambassadriceId] ?? [];
        const totalCost = draft.products.reduce((sum, p) => sum + (p.cost_price ?? 0) * p.quantity, 0);

        return (
          <div key={ambassadriceId} className="border-2 border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{a.prenom} {a.nom}</p>
              <span className="text-xs font-bold text-primary">Coût: {totalCost.toFixed(2)} €</span>
            </div>

            {/* Product search */}
            <div className="relative">
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearchQuery((p) => ({ ...p, [ambassadriceId]: v }));
                  doSearch(ambassadriceId, v);
                }}
                placeholder="Rechercher un produit..."
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none"
              />
              {searching[ambassadriceId] && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {results.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => addProduct(ambassadriceId, r)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 text-left border-b border-gray-100 last:border-0"
                    >
                      {r.image_url && (
                        <img src={r.image_url} alt={r.name} className="w-8 h-8 object-cover rounded-lg shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                        <p className="text-xs text-gray-500">{r.sell_price_ttc?.toFixed(2)} € · Stock: {r.stock}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Assigned products */}
            {draft.products.length > 0 && (
              <div className="space-y-2">
                {draft.products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 bg-gray-50 rounded-xl p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                      <p className="text-xs text-gray-500">
                        {p.sell_price_ttc?.toFixed(2)} € vente · {(p.cost_price ?? 0).toFixed(2)} € achat
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={p.quantity}
                        onChange={(e) => updateQty(ambassadriceId, p.id, Number(e.target.value))}
                        className="w-14 px-2 py-1 border border-gray-300 rounded-lg text-sm text-center"
                      />
                      <button
                        onClick={() => removeProduct(ambassadriceId, p.id)}
                        className="w-6 h-6 flex items-center justify-center text-red-500 hover:bg-red-50 rounded transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Notes */}
            <input
              type="text"
              value={draft.notes}
              onChange={(e) => onUpdate(ambassadriceId, { ...draft, notes: e.target.value })}
              placeholder="Notes pour cette ambassadrice..."
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none"
            />
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 4: Generate AI Scripts ───────────────────────────────────────────────

function Step4({
  campagneId,
  assignments,
  ambassadrices,
  onScriptsGenerated,
}: {
  campagneId: string;
  assignments: Record<string, AssignmentDraft & { id?: string }>;
  ambassadrices: Ambassadrice[];
  onScriptsGenerated: (assignmentId: string, scripts: Record<string, ScriptEntry>) => void;
}) {
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [scripts, setScripts] = useState<Record<string, Record<string, ScriptEntry>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleGenerate = async (ambassadriceId: string, assignmentId: string) => {
    const draft = assignments[ambassadriceId];
    if (!draft || draft.products.length === 0) return;
    setGenerating((p) => ({ ...p, [ambassadriceId]: true }));
    setErrors((p) => ({ ...p, [ambassadriceId]: '' }));

    try {
      const res = await fetch(`/api/campagnes-ambassadrices/${campagneId}/generate-scripts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignmentId,
          products: draft.products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.sell_price_ttc,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErrors((p) => ({ ...p, [ambassadriceId]: data.error ?? 'Erreur' })); return; }
      setScripts((p) => ({ ...p, [ambassadriceId]: data.scripts }));
      onScriptsGenerated(assignmentId, data.scripts);
    } catch (e: any) {
      setErrors((p) => ({ ...p, [ambassadriceId]: e.message }));
    } finally {
      setGenerating((p) => ({ ...p, [ambassadriceId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Générer les scripts IA</h2>
      <p className="text-sm text-muted-foreground">
        Générez des scripts de contenu personnalisés pour chaque ambassadrice et produit.
        Vous pouvez passer cette étape si vous préférez les créer manuellement.
      </p>

      {Object.entries(assignments).map(([ambassadriceId, draft]) => {
        const a = ambassadrices.find((x) => x.id === ambassadriceId);
        if (!a || !draft.id) return null;
        const ambiScripts = scripts[ambassadriceId];

        return (
          <div key={ambassadriceId} className="border-2 border-gray-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{a.prenom} {a.nom}</p>
              <button
                onClick={() => handleGenerate(ambassadriceId, draft.id!)}
                disabled={generating[ambassadriceId] || draft.products.length === 0}
                className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 text-white text-xs font-bold rounded-lg hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {generating[ambassadriceId] ? (
                  <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Génération…</>
                ) : (
                  <>🤖 Générer les scripts</>
                )}
              </button>
            </div>

            {errors[ambassadriceId] && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {errors[ambassadriceId]}
              </p>
            )}

            {ambiScripts && (
              <div className="space-y-2">
                {Object.entries(ambiScripts).map(([productId, script]) => {
                  const product = draft.products.find((p) => p.id === productId);
                  return (
                    <div key={productId} className="bg-violet-50 border border-violet-200 rounded-xl p-3">
                      <p className="text-xs font-bold text-violet-700 mb-2">{product?.name ?? productId}</p>
                      <p className="text-xs text-violet-600 font-medium">Hooks :</p>
                      <ul className="list-disc list-inside text-xs text-gray-700 space-y-0.5">
                        {(script as ScriptEntry).hooks?.map((h: string, i: number) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-green-700 mt-2 font-medium">Hashtags :</p>
                      <p className="text-xs text-gray-600">{(script as ScriptEntry).hashtags}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {draft.products.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Aucun produit assigné</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Step 5: Summary ───────────────────────────────────────────────────────────

function Step5({
  campagneInfo,
  ambassadrices,
  assignments,
  selectedIds,
}: {
  campagneInfo: any;
  ambassadrices: Ambassadrice[];
  assignments: Record<string, AssignmentDraft>;
  selectedIds: string[];
}) {
  const totalCost = selectedIds.reduce((sum, id) => {
    const d = assignments[id];
    return sum + (d?.products ?? []).reduce((s, p) => s + (p.cost_price ?? 0) * p.quantity, 0);
  }, 0);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-900">Récapitulatif</h2>

      {/* Campaign info */}
      <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
        <p className="font-semibold text-gray-900">{campagneInfo.nom}</p>
        {campagneInfo.description && <p className="text-sm text-gray-600">{campagneInfo.description}</p>}
        {campagneInfo.date_debut && (
          <p className="text-xs text-gray-500">
            {new Date(campagneInfo.date_debut).toLocaleDateString('fr-FR')}
            {campagneInfo.date_fin ? ` → ${new Date(campagneInfo.date_fin).toLocaleDateString('fr-FR')}` : ''}
          </p>
        )}
        <p className="text-xs font-bold text-primary mt-2">Coût total : {totalCost.toFixed(2)} €</p>
      </div>

      {/* Per-ambassadrice */}
      {selectedIds.map((id) => {
        const a = ambassadrices.find((x) => x.id === id);
        const d = assignments[id];
        if (!a || !d) return null;
        const cost = d.products.reduce((s, p) => s + (p.cost_price ?? 0) * p.quantity, 0);
        return (
          <div key={id} className="border border-border rounded-xl p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900">{a.prenom} {a.nom}</p>
              <p className="text-xs font-bold text-primary">{cost.toFixed(2)} €</p>
            </div>
            <ul className="mt-2 space-y-0.5">
              {d.products.map((p) => (
                <li key={p.id} className="text-xs text-gray-600">
                  • {p.name} × {p.quantity} ({(p.cost_price ?? 0).toFixed(2)} €/u)
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Wizard ───────────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-primary focus:outline-none transition-colors"
      />
    </div>
  );
}

export default function NouvelleCampagnePage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [campagneInfo, setCampagneInfo] = useState({ nom: '', description: '', date_debut: '', date_fin: '', objectif: '' });
  const [allAmbassadrices, setAllAmbassadrices] = useState<Ambassadrice[]>([]);
  const [selectedAmbassadrices, setSelectedAmbassadrices] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Record<string, AssignmentDraft & { id?: string }>>({});
  const [campagneId, setCampagneId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/ambassadrices')
      .then((r) => r.json())
      .then((d) => setAllAmbassadrices((Array.isArray(d) ? d : []).filter((a: any) => a.statut === 'active')))
      .catch(() => {});
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleAmbassadrice = (id: string) => {
    setSelectedAmbassadrices((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const updateAssignment = (id: string, draft: AssignmentDraft) => {
    setAssignments((prev) => ({ ...prev, [id]: { ...prev[id], ...draft } }));
  };

  // Step navigation validations
  const canNext = () => {
    if (step === 1) return campagneInfo.nom.trim().length > 0;
    if (step === 2) return selectedAmbassadrices.length > 0;
    if (step === 3) return selectedAmbassadrices.some((id) => (assignments[id]?.products ?? []).length > 0);
    return true;
  };

  const handleNext = async () => {
    if (step === 3) {
      // Create the campaign + assignments before going to script generation
      setCreating(true);
      try {
        // 1. Create campaign
        const campRes = await fetch('/api/campagnes-ambassadrices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(campagneInfo),
        });
        const campData = await campRes.json();
        if (!campRes.ok) { showToast(campData.error ?? 'Erreur création campagne'); setCreating(false); return; }
        const newCampagneId = campData.id;
        setCampagneId(newCampagneId);

        // 2. Assign products per ambassadrice
        const updatedAssignments = { ...assignments };
        for (const ambassadriceId of selectedAmbassadrices) {
          const draft = assignments[ambassadriceId];
          if (!draft || draft.products.length === 0) continue;
          const assignRes = await fetch(`/api/campagnes-ambassadrices/${newCampagneId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ambassadriceId,
              products: draft.products.map((p) => ({
                id: p.id,
                name: p.name,
                price: p.sell_price_ttc,
                cout_achat: p.cost_price ?? 0,
                quantity: p.quantity,
              })),
              notes: draft.notes,
            }),
          });
          const assignData = await assignRes.json();
          if (assignRes.ok) {
            updatedAssignments[ambassadriceId] = { ...draft, id: assignData.id };
          }
        }
        setAssignments(updatedAssignments);
        setStep(4);
      } catch (e: any) {
        showToast(e.message);
      } finally {
        setCreating(false);
      }
      return;
    }
    if (step < 5) setStep((s) => s + 1);
  };

  const handleFinish = () => {
    if (campagneId) {
      router.push(`/campagnes-ambassadrices/${campagneId}`);
    } else {
      router.push('/campagnes-ambassadrices');
    }
  };

  const steps = ['Info', 'Ambassadrices', 'Produits', 'Scripts IA', 'Résumé'];

  return (
    <AppLayout>
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-red-500 text-white rounded-xl shadow-lg text-sm">
          ❌ {toast}
        </div>
      )}

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Nouvelle campagne</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Créer une campagne ambassadrices étape par étape</p>
        </div>

        {/* Progress */}
        <div className="flex gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex-1 text-center">
              <div className={`h-1.5 rounded-full mb-1 ${i + 1 <= step ? 'bg-primary' : 'bg-gray-200'}`} />
              <p className={`text-[10px] font-semibold ${i + 1 === step ? 'text-primary' : 'text-gray-400'}`}>{s}</p>
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-card border border-border rounded-2xl p-6">
          {step === 1 && (
            <Step1
              data={campagneInfo}
              onChange={(k, v) => setCampagneInfo((prev) => ({ ...prev, [k]: v }))}
            />
          )}
          {step === 2 && (
            <Step2
              all={allAmbassadrices}
              selected={selectedAmbassadrices}
              onToggle={toggleAmbassadrice}
            />
          )}
          {step === 3 && (
            <Step3
              ambassadrices={allAmbassadrices}
              selectedIds={selectedAmbassadrices}
              assignments={assignments}
              onUpdate={updateAssignment}
            />
          )}
          {step === 4 && campagneId && (
            <Step4
              campagneId={campagneId}
              assignments={assignments}
              ambassadrices={allAmbassadrices}
              onScriptsGenerated={(assignmentId, scripts) => {
                // Store generated scripts
                const ambassadriceId = Object.keys(assignments).find(
                  (id) => assignments[id].id === assignmentId
                );
                if (ambassadriceId) {
                  setAssignments((prev) => ({
                    ...prev,
                    [ambassadriceId]: { ...prev[ambassadriceId], ai_scripts: scripts } as any,
                  }));
                }
              }}
            />
          )}
          {step === 5 && (
            <Step5
              campagneInfo={campagneInfo}
              ambassadrices={allAmbassadrices}
              assignments={assignments}
              selectedIds={selectedAmbassadrices}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={creating}
              className="px-5 py-3 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              ← Précédent
            </button>
          )}
          <div className="flex-1" />
          {step === 4 && (
            <button
              onClick={() => setStep(5)}
              className="px-5 py-3 border-2 border-gray-300 text-gray-600 font-bold rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Passer cette étape
            </button>
          )}
          {step < 5 ? (
            <button
              onClick={handleNext}
              disabled={!canNext() || creating}
              className="px-6 py-3 bg-primary text-primary-foreground font-bold rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              {creating ? 'Création en cours…' : step === 3 ? 'Créer la campagne →' : 'Suivant →'}
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-700 transition-colors"
            >
              Voir la campagne
            </button>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
