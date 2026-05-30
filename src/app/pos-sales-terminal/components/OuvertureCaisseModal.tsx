'use client';

import React, { useState, useMemo } from 'react';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

interface OuvertureCaisseModalProps {
  onConfirm: (fondOuverture: number, fondDetail: Record<string, number>) => void;
}

const BILLETS = [
  { valeur: 500, label: '500€' },
  { valeur: 200, label: '200€' },
  { valeur: 100, label: '100€' },
  { valeur: 50, label: '50€' },
  { valeur: 20, label: '20€' },
  { valeur: 10, label: '10€' },
  { valeur: 5, label: '5€' },
];

const PIECES = [
  { valeur: 2, label: '2€' },
  { valeur: 1, label: '1€' },
  { valeur: 0.5, label: '0,50€' },
  { valeur: 0.2, label: '0,20€' },
  { valeur: 0.1, label: '0,10€' },
  { valeur: 0.05, label: '0,05€' },
];

export default function OuvertureCaisseModal({ onConfirm }: OuvertureCaisseModalProps) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [montantLibre, setMontantLibre] = useState('');
  const [useLibre, setUseLibre] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const totalCalcule = useMemo(() => {
    return [...BILLETS, ...PIECES].reduce((sum, d) => {
      return sum + (counts[String(d.valeur)] ?? 0) * d.valeur;
    }, 0);
  }, [counts]);

  const total = useLibre ? (parseFloat(montantLibre) || 0) : totalCalcule;

  const setCount = (valeur: number, val: string) => {
    const n = Math.max(0, parseInt(val) || 0);
    setCounts((prev) => ({ ...prev, [String(valeur)]: n }));
  };

  const handleConfirm = async () => {
    if (total < 0) return;
    setSaving(true);
    try {
      const fondDetail = useLibre ? {} : Object.fromEntries(
        [...BILLETS, ...PIECES]
          .filter((d) => (counts[String(d.valeur)] ?? 0) > 0)
          .map((d) => [String(d.valeur), counts[String(d.valeur)]])
      );
      onConfirm(total, fondDetail);
    } catch (e: any) {
      toast.error(`Erreur : ${e?.message ?? 'Impossible d\'ouvrir la caisse'}`);
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <span className="text-xl">💰</span>
            </div>
            <div>
              <h2 className="text-base font-700 text-white">Ouverture de caisse</h2>
              <p className="text-xs text-white/80">{today}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Mode toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setUseLibre(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-600 transition-colors ${!useLibre ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              🪙 Compter les espèces
            </button>
            <button
              onClick={() => setUseLibre(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-600 transition-colors ${useLibre ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
            >
              ✏️ Montant libre
            </button>
          </div>

          {useLibre ? (
            <div>
              <label className="text-xs font-600 text-muted-foreground block mb-1.5">Fond de départ (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={montantLibre}
                onChange={(e) => setMontantLibre(e.target.value)}
                placeholder="Ex: 150.00"
                autoFocus
                className="w-full px-4 py-3 text-lg font-700 border-2 border-primary/40 rounded-xl focus:outline-none focus:border-primary text-center"
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Billets */}
              <div>
                <p className="text-xs font-700 text-muted-foreground uppercase tracking-widest mb-2">Billets</p>
                <div className="grid grid-cols-4 gap-2">
                  {BILLETS.map((d) => (
                    <div key={d.valeur} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-700 text-foreground">{d.label}</span>
                      <input
                        type="number"
                        min="0"
                        value={counts[String(d.valeur)] ?? ''}
                        onChange={(e) => setCount(d.valeur, e.target.value)}
                        placeholder="0"
                        className="w-full text-center px-2 py-1.5 text-sm font-600 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {(counts[String(d.valeur)] ?? 0) > 0 && (
                        <span className="text-[9px] text-primary font-600">
                          = {(d.valeur * (counts[String(d.valeur)] ?? 0)).toFixed(0)}€
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pièces */}
              <div>
                <p className="text-xs font-700 text-muted-foreground uppercase tracking-widest mb-2">Pièces</p>
                <div className="grid grid-cols-4 gap-2">
                  {PIECES.map((d) => (
                    <div key={d.valeur} className="flex flex-col items-center gap-1">
                      <span className="text-[11px] font-700 text-foreground">{d.label}</span>
                      <input
                        type="number"
                        min="0"
                        value={counts[String(d.valeur)] ?? ''}
                        onChange={(e) => setCount(d.valeur, e.target.value)}
                        placeholder="0"
                        className="w-full text-center px-2 py-1.5 text-sm font-600 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
                      />
                      {(counts[String(d.valeur)] ?? 0) > 0 && (
                        <span className="text-[9px] text-primary font-600">
                          = {(d.valeur * (counts[String(d.valeur)] ?? 0)).toFixed(2)}€
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Total */}
          <div className={`rounded-xl px-5 py-4 flex items-center justify-between ${total === 0 ? 'bg-muted' : 'bg-emerald-50 border border-emerald-200'}`}>
            <span className="text-sm font-600 text-foreground">
              {useLibre ? 'Fond de départ' : 'Total calculé'}
            </span>
            <span className={`text-2xl font-900 tabular-nums ${total > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>
              {total.toFixed(2)} €
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-muted/20">
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary text-primary-foreground font-700 rounded-xl hover:bg-accent transition-colors disabled:opacity-60 text-sm"
          >
            {saving ? (
              <><Icon name="ArrowPathIcon" size={16} className="animate-spin" />Ouverture en cours…</>
            ) : (
              <><Icon name="CheckIcon" size={16} />✓ Ouvrir la caisse — {total.toFixed(2)} €</>
            )}
          </button>
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            Ce montant correspond aux espèces présentes dans le tiroir-caisse au début de la journée.
          </p>
        </div>
      </div>
    </div>
  );
}
