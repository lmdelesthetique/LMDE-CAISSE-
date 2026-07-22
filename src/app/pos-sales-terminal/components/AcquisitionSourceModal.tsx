'use client';

import React, { useState } from 'react';

export type AcquisitionSource =
  | 'instagram'
  | 'tiktok'
  | 'google'
  | 'bouche_a_oreille'
  | 'cliente_habituelle'
  | 'autre';

const SOURCES: { value: AcquisitionSource; label: string; emoji: string; color: string }[] = [
  { value: 'instagram',         label: 'Instagram',          emoji: '📸', color: 'bg-pink-50 border-pink-300 text-pink-800 hover:bg-pink-100' },
  { value: 'tiktok',            label: 'TikTok',             emoji: '🎵', color: 'bg-slate-50 border-slate-300 text-slate-800 hover:bg-slate-100' },
  { value: 'google',            label: 'Google',             emoji: '🔍', color: 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100' },
  { value: 'bouche_a_oreille',  label: 'Bouche à oreille',  emoji: '🗣️', color: 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100' },
  { value: 'cliente_habituelle',label: 'Cliente habituelle', emoji: '💛', color: 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100' },
  { value: 'autre',             label: 'Autre',              emoji: '✨', color: 'bg-violet-50 border-violet-300 text-violet-800 hover:bg-violet-100' },
];

interface Props {
  receiptId: string | null;
  onClose: () => void;
}

export default function AcquisitionSourceModal({ receiptId, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<AcquisitionSource | null>(null);

  const handleSelect = async (source: AcquisitionSource) => {
    setSelected(source);
    setSaving(true);
    if (receiptId) {
      try {
        await fetch(`/api/receipts/${receiptId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            changes: { acquisitionSource: source },
            modifiedBy: 'caisse',
            reason: 'source_acquisition',
          }),
        });
      } catch {}
    }
    setSaving(false);
    onClose();
  };

  const handleSkip = () => onClose();

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-pink-500 to-violet-600 px-6 py-5 text-white text-center">
          <p className="text-2xl mb-1">🌟</p>
          <h2 className="text-lg font-700">D'où nous connaissez-vous ?</h2>
          <p className="text-sm text-white/80 mt-0.5">Une question rapide pour mieux vous servir</p>
        </div>

        {/* Options */}
        <div className="p-5 grid grid-cols-2 gap-3">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              onClick={() => handleSelect(s.value)}
              disabled={saving}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 font-600 text-sm transition-all active:scale-95 disabled:opacity-50 ${
                selected === s.value
                  ? 'ring-2 ring-offset-1 ring-violet-500 ' + s.color
                  : s.color
              }`}
            >
              <span className="text-2xl">{s.emoji}</span>
              <span className="text-center leading-tight">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Skip */}
        <div className="px-5 pb-5">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Passer cette étape
          </button>
        </div>
      </div>
    </div>
  );
}
