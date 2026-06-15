'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import Link from 'next/link';

interface ReferralStats {
  total: number;
  totalPointsGiven: number;
  totalThisMonth: number;
  pointsThisMonth: number;
  rewardedCount: number;
  discountUsedCount: number;
  topParrains: {
    id: string;
    firstName: string;
    lastName: string;
    referralCode: string;
    referralCount: number;
    referralPointsEarned: number;
  }[];
}

interface Referral {
  id: string;
  code_utilise: string;
  statut: string;
  parrain_points: number;
  parrain_rewarded_at: string | null;
  filleul_discount_percent: number;
  filleul_discount_used: boolean;
  filleul_discount_used_at: string | null;
  created_at: string;
  parrain: { id: string; first_name: string; last_name: string } | null;
  filleul: { id: string; first_name: string; last_name: string } | null;
}

const STATUT_CONFIG: Record<string, { label: string; color: string }> = {
  en_attente: { label: 'En attente', color: 'text-amber-700 bg-amber-50 border-amber-200' },
  valide: { label: 'Validé', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  recompense: { label: 'Récompensé', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
};

export default function ParrainagePage() {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        fetch('/api/referrals/stats'),
        fetch('/api/referrals'),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (listRes.ok) setReferrals(await listRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = referrals.filter((r) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const parrainName = r.parrain ? `${r.parrain.first_name} ${r.parrain.last_name}`.toLowerCase() : '';
    const filleulName = r.filleul ? `${r.filleul.first_name} ${r.filleul.last_name}`.toLowerCase() : '';
    return parrainName.includes(q) || filleulName.includes(q) || r.code_utilise.toLowerCase().includes(q);
  });

  const kpis = [
    { label: 'Total parrainages', value: stats?.total ?? 0, icon: 'UserGroupIcon', color: 'text-pink-600 bg-pink-50' },
    { label: 'Ce mois-ci', value: stats?.totalThisMonth ?? 0, icon: 'CalendarDaysIcon', color: 'text-purple-600 bg-purple-50' },
    { label: 'Pts distribués', value: (stats?.totalPointsGiven ?? 0).toLocaleString('fr-FR'), icon: 'StarIcon', color: 'text-amber-600 bg-amber-50' },
    { label: 'Pts ce mois', value: (stats?.pointsThisMonth ?? 0).toLocaleString('fr-FR'), icon: 'SparklesIcon', color: 'text-orange-600 bg-orange-50' },
    { label: 'Récompensés', value: stats?.rewardedCount ?? 0, icon: 'CheckBadgeIcon', color: 'text-emerald-600 bg-emerald-50' },
    { label: '-10% utilisés', value: stats?.discountUsedCount ?? 0, icon: 'TagIcon', color: 'text-blue-600 bg-blue-50' },
  ];

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-700 text-foreground">Parrainage</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Suivi des codes de parrainage et récompenses</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white border border-border rounded-xl p-3.5 shadow-card">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.color}`}>
                  <Icon name={k.icon as any} size={16} />
                </div>
                <div>
                  <p className="text-lg font-700 text-foreground">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{k.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Top Parrains */}
          <div className="bg-white border border-border rounded-xl p-5 shadow-card">
            <h2 className="text-sm font-700 text-foreground mb-4 flex items-center gap-2">
              <Icon name="TrophyIcon" size={15} className="text-amber-500" />
              Top Parrains
            </h2>
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : (stats?.topParrains ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucun parrain encore</p>
            ) : (
              <div className="space-y-3">
                {(stats?.topParrains ?? []).map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 shrink-0 ${i === 0 ? 'bg-amber-100 text-amber-700' : i === 1 ? 'bg-slate-100 text-slate-600' : i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-muted text-muted-foreground'}`}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <Link href={`/clients/${p.id}`} className="text-sm font-600 text-foreground hover:text-primary hover:underline truncate block">
                        {p.firstName} {p.lastName}
                      </Link>
                      <p className="text-[11px] text-muted-foreground font-mono">{p.referralCode}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-700 text-foreground">{p.referralCount} filleul{p.referralCount > 1 ? 's' : ''}</p>
                      <p className="text-[11px] text-amber-600">+{p.referralPointsEarned} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className="bg-gradient-to-br from-pink-50 to-purple-50 border border-pink-200 rounded-xl p-5">
            <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
              <Icon name="InformationCircleIcon" size={15} className="text-pink-500" />
              Comment ça marche
            </h2>
            <div className="space-y-3">
              {[
                { step: '1', text: 'La parraine partage son code unique (ex: MARIE15)', color: 'bg-pink-100 text-pink-700' },
                { step: '2', text: 'La filleule saisit le code au moment du paiement en caisse', color: 'bg-purple-100 text-purple-700' },
                { step: '3', text: 'La filleule bénéficie de -10% sur sa commande', color: 'bg-blue-100 text-blue-700' },
                { step: '4', text: 'La parraine reçoit 300 pts fidélité après confirmation du paiement', color: 'bg-emerald-100 text-emerald-700' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-700 shrink-0 mt-0.5 ${s.color}`}>{s.step}</span>
                  <p className="text-sm text-foreground">{s.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-white/60 rounded-lg border border-pink-200">
              <p className="text-xs text-pink-700 font-600">💡 Règles</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <li>• Code unique et insensible à la casse</li>
                <li>• 1 code utilisable par filleule maximum</li>
                <li>• -10% uniquement sur le 1er achat</li>
                <li>• 300 pts crédités après paiement confirmé</li>
              </ul>
            </div>
          </div>

          {/* Recent activity placeholder */}
          <div className="bg-white border border-border rounded-xl p-5 shadow-card">
            <h2 className="text-sm font-700 text-foreground mb-3 flex items-center gap-2">
              <Icon name="ClockIcon" size={15} className="text-blue-500" />
              Activité récente
            </h2>
            {loading ? (
              <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
            ) : referrals.slice(0, 5).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Aucune activité</p>
            ) : (
              <div className="space-y-3">
                {referrals.slice(0, 5).map((r) => (
                  <div key={r.id} className="flex items-center gap-2.5 py-1.5">
                    <div className="w-7 h-7 rounded-full bg-pink-100 flex items-center justify-center shrink-0">
                      <Icon name="UserGroupIcon" size={13} className="text-pink-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-600 text-foreground truncate">
                        {r.parrain ? `${r.parrain.first_name} ${r.parrain.last_name}` : '—'}
                        {r.filleul ? ` → ${r.filleul.first_name} ${r.filleul.last_name}` : ''}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString('fr-FR')} · Code: <span className="font-mono">{r.code_utilise}</span>
                      </p>
                    </div>
                    <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full border shrink-0 ${(STATUT_CONFIG[r.statut] ?? STATUT_CONFIG.en_attente).color}`}>
                      {(STATUT_CONFIG[r.statut] ?? STATUT_CONFIG.en_attente).label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Full referral list */}
        <div className="mt-6 bg-white border border-border rounded-xl shadow-card overflow-hidden">
          <div className="p-4 border-b border-border flex items-center gap-3">
            <h2 className="text-sm font-700 text-foreground flex-1">Tous les parrainages ({referrals.length})</h2>
            <div className="relative w-64">
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-border rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          {loading ? (
            <div className="flex justify-center py-12"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Icon name="UserGroupIcon" size={36} className="text-muted-foreground mx-auto mb-2" />
              <p className="text-sm font-500 text-muted-foreground">Aucun parrainage trouvé</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Parraine</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Filleule</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Code</th>
                    <th className="text-left px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Statut</th>
                    <th className="text-right px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">Pts parraine</th>
                    <th className="text-center px-4 py-3 font-600 text-muted-foreground text-xs uppercase tracking-wide">-10% utilisé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-4 py-3">
                        {r.parrain ? (
                          <Link href={`/clients/${r.parrain.id}`} className="text-sm font-500 text-foreground hover:text-primary hover:underline">
                            {r.parrain.first_name} {r.parrain.last_name}
                          </Link>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.filleul ? (
                          <Link href={`/clients/${r.filleul.id}`} className="text-sm font-500 text-foreground hover:text-primary hover:underline">
                            {r.filleul.first_name} {r.filleul.last_name}
                          </Link>
                        ) : <span className="text-muted-foreground text-xs">Anonyme</span>}
                      </td>
                      <td className="px-4 py-3"><span className="font-mono text-xs font-600 text-foreground">{r.code_utilise}</span></td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-600 px-2 py-0.5 rounded-full border ${(STATUT_CONFIG[r.statut] ?? STATUT_CONFIG.en_attente).color}`}>
                          {(STATUT_CONFIG[r.statut] ?? STATUT_CONFIG.en_attente).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.parrain_rewarded_at ? (
                          <span className="text-emerald-600 font-700 text-sm">+{r.parrain_points} pts</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">En attente</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {r.filleul_discount_used ? (
                          <span className="text-emerald-600 font-700">✓</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
