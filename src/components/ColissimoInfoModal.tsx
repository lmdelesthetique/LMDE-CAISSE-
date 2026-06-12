'use client';

import { useState } from 'react';

export interface ColissimoData {
  nom: string;
  prenom: string;
  adresse: string;
  complement: string;
  cp: string;
  ville: string;
  pays: string;
  tel: string;
  email: string;
}

export function openColiship() {
  window.open(
    'https://www.coliship.colissimo.entreprise.laposte.fr/entreprise/coliship/#/unite',
    '_blank'
  );
}

export function ColissimoInfoModal({ data, onClose }: { data: ColissimoData; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const fullText = [
    (data.nom + ' ' + data.prenom).trim(),
    data.adresse,
    data.complement,
    (data.cp + ' ' + data.ville).trim(),
    data.pays,
    data.tel,
  ].filter(Boolean).join('\n');

  function copyAll() {
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Nom',        value: data.nom },
    { label: 'Prénom',     value: data.prenom },
    { label: 'Adresse',    value: data.adresse },
    { label: 'Complément', value: data.complement },
    { label: 'CP',         value: data.cp },
    { label: 'Ville',      value: data.ville },
    { label: 'Pays',       value: data.pays },
    { label: 'Tél',        value: data.tel },
    { label: 'Email',      value: data.email },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-lg">📦 Infos Colissimo</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="bg-gray-50 rounded-xl p-4 space-y-2 mb-4 font-mono text-sm">
          {rows.filter((r) => r.value).map(({ label, value }) => (
            <div key={label} className="flex justify-between gap-4">
              <span className="text-gray-500 shrink-0">{label}</span>
              <span className="font-bold text-right">{value}</span>
            </div>
          ))}
        </div>

        <button
          onClick={copyAll}
          className={`w-full py-3 rounded-xl font-bold text-sm transition-colors ${
            copied ? 'bg-green-500 text-white' : 'bg-pink-600 text-white hover:bg-pink-700'
          }`}
        >
          {copied ? '✅ Copié !' : '📋 Copier toutes les infos'}
        </button>

        <p className="text-xs text-gray-400 text-center mt-2">
          Colissimo est ouvert dans un nouvel onglet
        </p>
      </div>
    </div>
  );
}
