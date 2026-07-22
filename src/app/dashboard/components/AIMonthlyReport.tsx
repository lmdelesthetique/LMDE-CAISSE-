'use client';

import React, { useState } from 'react';

interface ReportData {
  resume: string;
  evolution_ca: number;
  evolution_tickets: number;
  evolution_panier: number;
  points_positifs: string[];
  points_attention: string[];
  recommandations: string[];
  promotion_suggeree: string;
  objectif_mois_prochain: string;
  analyse_acquisition?: string;
  acquisition_stats?: Record<string, number>;
}

const SOURCE_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  google: 'Google',
  bouche_a_oreille: 'Bouche à oreille',
  cliente_habituelle: 'Cliente habituelle',
  autre: 'Autre',
};

function EvoChip({ value }: { value: number }) {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-700 px-1.5 py-0.5 rounded-full ${up ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '↑' : '↓'} {Math.abs(value)}%
    </span>
  );
}

function handlePrint(report: ReportData, period: string) {
  const acqRows = Object.entries(report.acquisition_stats ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([src, cnt]) => `<tr><td>${SOURCE_LABEL[src] ?? src}</td><td>${cnt} clientes</td></tr>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport mensuel — ${period}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; max-width: 800px; margin: 40px auto; padding: 0 24px; }
  h1 { font-size: 22px; color: #7c3aed; border-bottom: 2px solid #7c3aed; padding-bottom: 8px; }
  h2 { font-size: 14px; font-weight: 700; margin: 20px 0 8px; }
  .kpis { display: flex; gap: 24px; margin: 16px 0; }
  .kpi { flex: 1; background: #f5f3ff; border-radius: 10px; padding: 12px 16px; }
  .kpi-label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; }
  .kpi-value { font-size: 20px; font-weight: 700; color: #111; margin: 2px 0; }
  .kpi-evo { font-size: 11px; font-weight: 700; }
  .up { color: #059669; } .down { color: #dc2626; }
  .box { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 16px; margin: 10px 0; }
  .green { background: #f0fdf4; border-color: #bbf7d0; }
  .amber { background: #fffbeb; border-color: #fde68a; }
  .pink { background: #fdf2f8; border-color: #fbcfe8; }
  .blue { background: #eff6ff; border-color: #bfdbfe; }
  ul { margin: 4px 0; padding-left: 18px; }
  li { margin: 4px 0; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
  tr:last-child td { border-bottom: none; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>Rapport mensuel — ${period}</h1>
<p style="color:#6b7280;font-size:12px">Généré le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} · Le Monde de l'Esthétique</p>

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Évolution CA</div>
    <div class="kpi-value">${report.evolution_ca >= 0 ? '+' : ''}${report.evolution_ca}%</div>
    <div class="kpi-evo ${report.evolution_ca >= 0 ? 'up' : 'down'}">${report.evolution_ca >= 0 ? '↑ Croissance' : '↓ Baisse'} vs mois précédent</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Évolution Tickets</div>
    <div class="kpi-value">${report.evolution_tickets >= 0 ? '+' : ''}${report.evolution_tickets}%</div>
    <div class="kpi-evo ${report.evolution_tickets >= 0 ? 'up' : 'down'}">${report.evolution_tickets >= 0 ? '↑ Plus de ventes' : '↓ Moins de ventes'} vs M-1</div>
  </div>
  <div class="kpi">
    <div class="kpi-label">Évolution Panier Moyen</div>
    <div class="kpi-value">${report.evolution_panier >= 0 ? '+' : ''}${report.evolution_panier}%</div>
    <div class="kpi-evo ${report.evolution_panier >= 0 ? 'up' : 'down'}">${report.evolution_panier >= 0 ? '↑ Meilleure valeur' : '↓ Panier en baisse'} vs M-1</div>
  </div>
</div>

<div class="box" style="background:#faf5ff;border-color:#ddd6fe">
  <p>${report.resume}</p>
</div>

<h2>✅ Points positifs</h2>
<div class="box green"><ul>${report.points_positifs?.map(p => `<li>${p}</li>`).join('') ?? ''}</ul></div>

<h2>⚠️ Points d'attention</h2>
<div class="box amber"><ul>${report.points_attention?.map(p => `<li>${p}</li>`).join('') ?? ''}</ul></div>

<h2>💡 Recommandations stratégiques</h2>
<div class="box"><ol style="padding-left:18px">${report.recommandations?.map(r => `<li style="margin:8px 0">${r}</li>`).join('') ?? ''}</ol></div>

<div style="display:flex;gap:12px;margin-top:10px">
  <div class="box pink" style="flex:1">
    <p style="font-weight:700;margin:0 0 6px">🎁 Promo suggérée</p>
    <p style="margin:0">${report.promotion_suggeree}</p>
  </div>
  <div class="box blue" style="flex:1">
    <p style="font-weight:700;margin:0 0 6px">🎯 Objectif mois prochain</p>
    <p style="margin:0">${report.objectif_mois_prochain}</p>
  </div>
</div>

${acqRows ? `<h2>📊 Sources d'acquisition clientes</h2><div class="box"><table>${acqRows}</table></div>` : ''}

${report.analyse_acquisition ? `<h2>📈 Analyse acquisition</h2><div class="box">${report.analyse_acquisition}</div>` : ''}

<p style="margin-top:40px;font-size:11px;color:#9ca3af;text-align:center">Rapport confidentiel — Le Monde de l'Esthétique · BeautyPOS</p>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 300);
}

export default function AIMonthlyReport() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usedMock, setUsedMock] = useState(false);
  const [currentPeriod, setCurrentPeriod] = useState('');

  const generate = async () => {
    setLoading(true);
    setError(null);
    setReport(null);

    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
    const period = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    setCurrentPeriod(period);

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

  const totalAcq = Object.values(report?.acquisition_stats ?? {}).reduce((s, n) => s + n, 0);

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
        <div className="flex items-center gap-2">
          {report && (
            <button
              onClick={() => handlePrint(report, currentPeriod)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-600 text-muted-foreground hover:bg-muted transition-colors"
            >
              🖨️ Imprimer rapport
            </button>
          )}
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
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 border-b border-red-100 text-sm text-red-700">{error}</div>
      )}

      {!report && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <p className="text-3xl mb-2">📊</p>
          <p className="text-sm font-500 text-foreground mb-1">Analyse IA mensuelle avec comparaison M-1</p>
          <p className="text-xs text-muted-foreground">Cliquez sur Générer pour obtenir une analyse personnalisée avec évolutions vs mois précédent</p>
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-8 h-8 border-3 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Claude analyse votre mois et compare avec M-1…</p>
        </div>
      )}

      {report && !loading && (
        <div className="p-4 space-y-4">
          {/* KPI evolution strip */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'CA vs M-1', value: report.evolution_ca },
              { label: 'Tickets vs M-1', value: report.evolution_tickets },
              { label: 'Panier moyen vs M-1', value: report.evolution_panier },
            ].map((kpi) => (
              <div key={kpi.label} className={`rounded-xl border p-3 text-center ${kpi.value >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">{kpi.label}</p>
                <p className={`text-xl font-700 ${kpi.value >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {kpi.value >= 0 ? '+' : ''}{kpi.value}%
                </p>
                <p className={`text-[11px] font-600 ${kpi.value >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {kpi.value >= 0 ? '↑ En hausse' : '↓ En baisse'}
                </p>
              </div>
            ))}
          </div>

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
              <p className="text-xs font-700 text-foreground mb-2">💡 Recommandations stratégiques</p>
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

          {/* Sources acquisition */}
          {totalAcq > 0 && (
            <div className="border border-border rounded-xl p-3">
              <p className="text-xs font-700 text-foreground mb-3">📊 Sources d'acquisition ({totalAcq} réponses)</p>
              <div className="space-y-2">
                {Object.entries(report.acquisition_stats ?? {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([src, cnt]) => {
                    const pctVal = Math.round((cnt / totalAcq) * 100);
                    return (
                      <div key={src}>
                        <div className="flex items-center justify-between text-xs mb-0.5">
                          <span className="text-foreground font-500">{SOURCE_LABEL[src] ?? src}</span>
                          <span className="text-muted-foreground">{cnt} ({pctVal}%)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div className="bg-violet-500 h-1.5 rounded-full" style={{ width: `${pctVal}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
              {report.analyse_acquisition && (
                <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border leading-relaxed">
                  {report.analyse_acquisition}
                </p>
              )}
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
