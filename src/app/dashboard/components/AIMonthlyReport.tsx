'use client';

import React, { useState } from 'react';

interface ReportData {
  resume: string;
  points_positifs: string[];
  points_attention: string[];
  recommandations: string[];
  promotion_suggeree: string;
  objectif_mois_prochain: string;
}

export default function AIMonthlyReport() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);

  const generate = async () => {
    setLoading(true);
    setError(null);
    setReport(null);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const period = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    try {
      const res = await fetch('/api/ai/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, period }),
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = await res.json();
      setReport(data.report);
      setUsedMock(data.usedMock ?? false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-border rounded-xl shadow-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border bg-gradient-to-r from-violet-50 to-pink-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <h3 className="text-[14px] font-600 text-foreground">Rapport IA du mois</h3>
          {usedMock && report && (
            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 font-500 px-1.5 py-0.5 rounded-full">démo</span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-600 hover:bg-violet-700 disabled:opacity-60 transition-colors"
        >
          {loading ? (
            <>
              <div className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              Génération…
            </>
          ) : (
            <>
              <span>✨</span>
              {report ? 'Régénérer' : 'Générer'}
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>
      )}

      {!report && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm font-500 text-foreground mb-1">Analyse IA mensuelle</p>
          <p className="text-xs text-muted-foreground">Cliquez sur Générer pour obtenir une analyse personnalisée de votre mois</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Claude analyse votre mois…</p>
        </div>
      )}

      {report && !loading && (
        <div className="p-4 space-y-4">
          {/* Résumé */}
          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
            <p className="text-sm text-violet-900 leading-relaxed">{report.resume}</p>
          </div>

          {/* Positifs + Attention */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.points_positifs?.length > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                <p className="text-xs font-700 text-emerald-700 mb-2">✅ Points positifs</p>
                <ul className="space-y-1">
                  {report.points_positifs.map((p, i) => (
                    <li key={i} className="text-xs text-emerald-800 leading-relaxed">• {p}</li>
                  ))}
                </ul>
              </div>
            )}
            {report.points_attention?.length > 0 && (
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs font-700 text-amber-700 mb-2">⚠️ Points d'attention</p>
                <ul className="space-y-1">
                  {report.points_attention.map((p, i) => (
                    <li key={i} className="text-xs text-amber-800 leading-relaxed">• {p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Recommandations */}
          {report.recommandations?.length > 0 && (
            <div className="border border-border rounded-xl p-3">
              <p className="text-xs font-700 text-foreground mb-2">💡 Recommandations</p>
              <ol className="space-y-1.5">
                {report.recommandations.map((r, i) => (
                  <li key={i} className="text-xs text-muted-foreground leading-relaxed flex gap-2">
                    <span className="font-700 text-violet-600 shrink-0">{i + 1}.</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Promo + Objectif */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {report.promotion_suggeree && (
              <div className="bg-pink-50 border border-pink-100 rounded-xl p-3">
                <p className="text-xs font-700 text-pink-700 mb-1">🎁 Promo suggérée</p>
                <p className="text-xs text-pink-800 leading-relaxed">{report.promotion_suggeree}</p>
              </div>
            )}
            {report.objectif_mois_prochain && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-xs font-700 text-blue-700 mb-1">🎯 Objectif mois prochain</p>
                <p className="text-xs text-blue-800 leading-relaxed">{report.objectif_mois_prochain}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
