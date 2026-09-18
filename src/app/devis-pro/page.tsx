'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/ui/AppIcon';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DevisItem {
  id: string;
  productId?: string;
  name: string;
  ref?: string;
  imageUrl?: string | null;
  qty: number;
  sellPrice: number;
  isBonus: boolean;
  isCustom: boolean;
}

interface Paiement {
  method: 'especes' | 'carte' | 'virement' | 'avoir' | 'sumup';
  amount: number;
  note?: string;
  date: string;
}

type Statut = 'brouillon' | 'en_discussion' | 'envoye' | 'valide' | 'en_preparation' | 'pret' | 'livre' | 'annule';

interface DevisPro {
  id: string;
  client_id: string;
  numero?: string;
  items: DevisItem[];
  discount_pct: number;
  credit: number;
  total_ttc: number;
  client_pays: number;
  free_shipping: boolean;
  statut: Statut;
  type_expedition: 'livraison' | 'retrait';
  adresse_livraison?: string;
  notes?: string;
  notes_preparation?: string;
  pdf_url?: string;
  paiements: Paiement[];
  paye_total: number;
  sent_at?: string;
  validated_at?: string;
  ready_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    phone?: string;
    whatsapp?: string;
    clientType?: string;
    address?: string;
    city?: string;
    country?: string;
  };
}

interface ProductStock {
  id: string;
  stock: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUTS: { key: Statut | 'tous'; label: string; color: string; bg: string }[] = [
  { key: 'tous', label: 'Tous', color: 'text-gray-600', bg: 'bg-gray-100' },
  { key: 'brouillon', label: 'Brouillon', color: 'text-gray-500', bg: 'bg-gray-100' },
  { key: 'envoye', label: 'Envoyé', color: 'text-blue-600', bg: 'bg-blue-50' },
  { key: 'en_discussion', label: 'En discussion', color: 'text-orange-600', bg: 'bg-orange-50' },
  { key: 'valide', label: 'Validé', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  { key: 'en_preparation', label: 'En prépa', color: 'text-violet-600', bg: 'bg-violet-50' },
  { key: 'pret', label: 'Prêt', color: 'text-indigo-600', bg: 'bg-indigo-50' },
  { key: 'livre', label: 'Livré', color: 'text-gray-400', bg: 'bg-gray-50' },
  { key: 'annule', label: 'Annulé', color: 'text-red-400', bg: 'bg-red-50' },
];

const STATUT_NEXT: Partial<Record<Statut, { label: string; next: Statut }>> = {
  brouillon: { label: 'Marquer comme envoyé', next: 'envoye' },
  envoye: { label: 'Valider le devis', next: 'valide' },
  en_discussion: { label: 'Valider le devis', next: 'valide' },
  valide: { label: 'Démarrer la préparation', next: 'en_preparation' },
  en_preparation: { label: 'Marquer comme prêt', next: 'pret' },
  pret: { label: 'Marquer comme livré', next: 'livre' },
};

const PAYMENT_METHODS = [
  { value: 'especes', label: 'Espèces', icon: 'BanknotesIcon' },
  { value: 'carte', label: 'Carte bancaire', icon: 'CreditCardIcon' },
  { value: 'virement', label: 'Virement', icon: 'ArrowRightCircleIcon' },
  { value: 'avoir', label: 'Avoir / Budget Pro', icon: 'GiftIcon' },
  { value: 'sumup', label: 'Lien SumUp', icon: 'LinkIcon' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statutBadge(statut: Statut) {
  const s = STATUTS.find((x) => x.key === statut);
  return s ?? STATUTS[0];
}

function daysSince(dateStr?: string) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr?: string) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function fmtMoney(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StockBadge({ qty, stock }: { qty: number; stock: number | null }) {
  if (stock === null) return <span className="text-[10px] text-gray-400">—</span>;
  if (stock >= qty) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-600 text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
      {stock} dispo
    </span>
  );
  if (stock > 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-600 text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 inline-block" />
      {stock}/{qty}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-600 text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
      Rupture
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DevisProPage() {
  const router = useRouter();

  const [devisList, setDevisList] = useState<DevisPro[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Statut | 'tous'>('tous');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<DevisPro | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);

  // Panel state
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [toCommander, setToCommander] = useState<Set<string>>(new Set());
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('especes');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [notesPrepa, setNotesPrepa] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [typeExpedition, setTypeExpedition] = useState<'livraison' | 'retrait'>('retrait');
  const [adresseLivraison, setAdresseLivraison] = useState('');
  const [migrating, setMigrating] = useState(false);

  // ── Fetch list ──────────────────────────────────────────────────────────────
  const fetchDevis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/devis-pro?limit=200');
      const json = await res.json();
      setDevisList(json.devis ?? []);
    } catch {
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevis(); }, [fetchDevis]);

  // ── Fetch stock for selected devis ─────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    setNotesPrepa(selected.notes_preparation ?? '');
    setTypeExpedition(selected.type_expedition ?? 'retrait');
    setAdresseLivraison(selected.adresse_livraison ?? '');
    setToCommander(new Set());

    const productIds = selected.items
      .filter((i) => !i.isCustom && i.productId)
      .map((i) => i.productId as string);

    if (productIds.length === 0) { setStockMap({}); return; }

    fetch(`/api/products/batch?ids=${productIds.join(',')}`)
      .then((r) => r.json())
      .then(({ products }) => {
        const map: Record<string, number> = {};
        for (const p of products ?? []) map[p.id] = p.stock ?? 0;
        setStockMap(map);
      })
      .catch(() => setStockMap({}));
  }, [selected?.id]);

  // ── Computed stats ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const active = devisList.filter((d) => !['livre', 'annule'].includes(d.statut));
    const pipeline = active.reduce((s, d) => s + (d.client_pays ?? 0), 0);
    const aValider = devisList.filter((d) => d.statut === 'envoye' || d.statut === 'en_discussion').length;
    const aPrepa = devisList.filter((d) => d.statut === 'valide').length;
    const prets = devisList.filter((d) => d.statut === 'pret').length;
    return { pipeline, aValider, aPrepa, prets };
  }, [devisList]);

  // ── Top products ────────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const countMap: Record<string, { name: string; imageUrl?: string | null; count: number; qty: number }> = {};
    const activeDevis = devisList.filter((d) => !['annule', 'livre'].includes(d.statut));
    for (const d of activeDevis) {
      for (const item of d.items) {
        if (item.isCustom) continue;
        const key = item.productId ?? item.name;
        if (!countMap[key]) countMap[key] = { name: item.name, imageUrl: item.imageUrl, count: 0, qty: 0 };
        countMap[key].count++;
        countMap[key].qty += item.qty;
      }
    }
    return Object.entries(countMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([k, v]) => ({ key: k, ...v }));
  }, [devisList]);

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = activeTab === 'tous' ? devisList : devisList.filter((d) => d.statut === activeTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((d) =>
        `${d.client?.firstName} ${d.client?.lastName}`.toLowerCase().includes(q) ||
        (d.numero ?? '').toLowerCase().includes(q) ||
        d.items.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [devisList, activeTab, search]);

  // ── Tab counts ──────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const m: Record<string, number> = { tous: devisList.length };
    for (const d of devisList) m[d.statut] = (m[d.statut] ?? 0) + 1;
    return m;
  }, [devisList]);

  // ── Status update ────────────────────────────────────────────────────────────
  const updateStatut = async (devis: DevisPro, newStatut: Statut) => {
    setStatusUpdating(true);
    try {
      const patch: any = { statut: newStatut };
      if (newStatut === 'envoye') patch.sent_at = new Date().toISOString();
      if (newStatut === 'valide') patch.validated_at = new Date().toISOString();
      if (newStatut === 'pret') patch.ready_at = new Date().toISOString();
      if (newStatut === 'livre') patch.delivered_at = new Date().toISOString();

      const res = await fetch(`/api/devis-pro/${devis.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      const updated = json.devis;
      setDevisList((prev) => prev.map((d) => d.id === devis.id ? { ...d, ...updated } : d));
      setSelected((prev) => prev?.id === devis.id ? { ...prev, ...updated } : prev);
      toast.success('Statut mis à jour');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setStatusUpdating(false);
    }
  };

  // ── Add payment ──────────────────────────────────────────────────────────────
  const addPayment = async () => {
    if (!selected) return;
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0) { toast.error('Montant invalide'); return; }

    const newPaiement: Paiement = {
      method: paymentMethod as any,
      amount,
      note: paymentNote.trim() || undefined,
      date: new Date().toISOString(),
    };
    const paiements = [...(selected.paiements ?? []), newPaiement];
    const payeTotal = paiements.reduce((s, p) => s + p.amount, 0);

    const res = await fetch(`/api/devis-pro/${selected.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paiements, paye_total: payeTotal }),
    });
    const json = await res.json();
    if (json.error) { toast.error(json.error); return; }

    setSelected((prev) => prev ? { ...prev, paiements, paye_total: payeTotal } : prev);
    setDevisList((prev) => prev.map((d) => d.id === selected.id ? { ...d, paiements, paye_total: payeTotal } : d));
    setPaymentAmount(''); setPaymentNote(''); setShowPaymentForm(false);
    toast.success('Paiement enregistré');
  };

  // ── Save expedition + notes ──────────────────────────────────────────────────
  const savePrepaInfo = async () => {
    if (!selected) return;
    setSavingNotes(true);
    try {
      const res = await fetch(`/api/devis-pro/${selected.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes_preparation: notesPrepa,
          type_expedition: typeExpedition,
          adresse_livraison: adresseLivraison || null,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSelected((prev) => prev ? { ...prev, notes_preparation: notesPrepa, type_expedition: typeExpedition, adresse_livraison: adresseLivraison } : prev);
      toast.success('Informations enregistrées');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSavingNotes(false);
    }
  };

  // ── Migrate ──────────────────────────────────────────────────────────────────
  const runMigration = async () => {
    setMigrating(true);
    try {
      const res = await fetch('/api/admin/migrate-devis-to-table', { method: 'POST' });
      const json = await res.json();
      toast.success(`Migration : ${json.migrated} devis importés, ${json.skipped} déjà présents`);
      if (json.errors?.length) console.warn('Migration errors:', json.errors);
      fetchDevis();
    } catch {
      toast.error('Erreur de migration');
    } finally {
      setMigrating(false);
    }
  };

  // ── WhatsApp relance ──────────────────────────────────────────────────────────
  const sendWhatsApp = (devis: DevisPro) => {
    const phone = devis.client?.whatsapp ?? devis.client?.phone;
    if (!phone) { toast.error('Pas de numéro WhatsApp'); return; }
    const clean = phone.replace(/\s/g, '');
    const intl = clean.startsWith('0') ? '+596' + clean.slice(1) : clean.startsWith('+') ? clean : '+596' + clean;
    const msg = encodeURIComponent(
      `Bonjour ${devis.client?.firstName} 🌸\n\nJe vous contacte au sujet de votre devis ${devis.numero ?? ''} d'un montant de ${fmtMoney(devis.client_pays)}.\n\nN'hésitez pas à me contacter pour toute question 😊`
    );
    window.open(`https://wa.me/${intl}?text=${msg}`, '_blank');
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* ── Left panel: list ── */}
      <div className={`flex flex-col flex-1 min-w-0 ${selected ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="shrink-0 bg-white border-b border-border px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-800 text-foreground tracking-tight">Devis Pro</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Gestion des devis professionnels</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={runMigration}
                disabled={migrating}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-600 text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors"
                title="Importer les anciens devis depuis les fiches clients"
              >
                {migrating ? <Icon name="ArrowPathIcon" size={14} className="animate-spin" /> : <Icon name="ArrowDownTrayIcon" size={14} />}
                Importer anciens
              </button>
              <button
                onClick={() => router.push('/clients')}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-700 hover:opacity-90 transition-opacity"
              >
                <Icon name="PlusIcon" size={16} />
                Nouveau devis
              </button>
            </div>
          </div>

          {/* Dashboard stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            <div className="bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 rounded-xl p-3">
              <p className="text-[10px] font-700 uppercase tracking-widest text-indigo-400 mb-0.5">Pipeline</p>
              <p className="text-lg font-800 text-indigo-700">{fmtMoney(stats.pipeline)}</p>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-xl p-3">
              <p className="text-[10px] font-700 uppercase tracking-widest text-blue-400 mb-0.5">À valider</p>
              <p className="text-lg font-800 text-blue-700">{stats.aValider}</p>
            </div>
            <div className="bg-gradient-to-br from-violet-50 to-white border border-violet-100 rounded-xl p-3">
              <p className="text-[10px] font-700 uppercase tracking-widest text-violet-400 mb-0.5">À préparer</p>
              <p className="text-lg font-800 text-violet-700">{stats.aPrepa}</p>
            </div>
            <div className="bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-xl p-3">
              <p className="text-[10px] font-700 uppercase tracking-widest text-emerald-400 mb-0.5">Prêts</p>
              <p className="text-lg font-800 text-emerald-700">{stats.prets}</p>
            </div>
          </div>

          {/* Top products widget */}
          {topProducts.length > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
              <p className="text-[10px] font-700 uppercase tracking-widest text-amber-600 mb-2">Top produits demandés (devis actifs)</p>
              <div className="flex items-center gap-3 flex-wrap">
                {topProducts.map((p) => (
                  <div key={p.key} className="flex items-center gap-1.5">
                    {p.imageUrl ? (
                      <img src={p.imageUrl} alt="" className="w-6 h-6 rounded object-cover border border-amber-200" />
                    ) : (
                      <div className="w-6 h-6 rounded bg-amber-100 border border-amber-200 flex items-center justify-center">
                        <Icon name="CubeIcon" size={10} className="text-amber-400" />
                      </div>
                    )}
                    <span className="text-xs font-600 text-amber-800">{p.name}</span>
                    <span className="text-[10px] text-amber-500 bg-amber-100 px-1.5 rounded-full">{p.count}x</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher client, numéro, produit..."
              className="w-full pl-8 pr-4 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 bg-white border-b border-border px-4">
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-2">
            {STATUTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setActiveTab(s.key as Statut | 'tous')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-700 whitespace-nowrap transition-colors ${
                  activeTab === s.key ? `${s.bg} ${s.color}` : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {s.label}
                {(tabCounts[s.key] ?? 0) > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-800 ${activeTab === s.key ? `${s.color} bg-white/60` : 'bg-muted text-muted-foreground'}`}>
                    {tabCounts[s.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Icon name="ArrowPathIcon" size={24} className="animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Icon name="DocumentTextIcon" size={36} className="text-border" />
              <p className="text-sm text-muted-foreground">
                {search.trim() ? `Aucun devis pour "${search}"` : 'Aucun devis dans cette catégorie'}
              </p>
              {devisList.length === 0 && (
                <button onClick={runMigration} disabled={migrating} className="flex items-center gap-1.5 px-4 py-2 text-sm font-600 border border-border rounded-xl hover:bg-muted transition-colors">
                  {migrating ? <Icon name="ArrowPathIcon" size={14} className="animate-spin" /> : <Icon name="ArrowDownTrayIcon" size={14} />}
                  Importer les anciens devis
                </button>
              )}
            </div>
          ) : (
            filtered.map((devis) => {
              const badge = statutBadge(devis.statut);
              const days = daysSince(devis.sent_at ?? devis.created_at);
              const isUrgent = devis.statut === 'envoye' && (days ?? 0) >= 3;
              return (
                <button
                  key={devis.id}
                  onClick={() => setSelected(devis)}
                  className={`w-full text-left bg-white border rounded-2xl p-4 hover:shadow-sm transition-all ${
                    selected?.id === devis.id ? 'border-primary ring-2 ring-primary/20' : isUrgent ? 'border-orange-200' : 'border-border'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-800 text-primary">
                          {devis.client?.firstName?.[0]}{devis.client?.lastName?.[0]}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-700 text-foreground truncate">
                          {devis.client?.firstName} {devis.client?.lastName}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{devis.numero ?? '—'}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 text-[10px] font-700 px-2 py-1 rounded-full ${badge.bg} ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-800 text-foreground">{fmtMoney(devis.client_pays)}</span>
                      <span className="text-[10px] text-muted-foreground">{devis.items.length} article{devis.items.length !== 1 ? 's' : ''}</span>
                      {devis.type_expedition === 'livraison' && (
                        <span className="text-[10px] text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <Icon name="TruckIcon" size={9} /> Livraison
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {devis.paye_total > 0 && (
                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          Payé {fmtMoney(devis.paye_total)}
                        </span>
                      )}
                      {isUrgent && (
                        <span className="text-[10px] text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded-full">
                          {days}j sans réponse
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">{fmtDate(devis.created_at)}</span>
                    </div>
                  </div>

                  {/* Item thumbnails */}
                  {devis.items.length > 0 && (
                    <div className="flex items-center gap-1 mt-2">
                      {devis.items.slice(0, 6).map((item, i) =>
                        item.imageUrl ? (
                          <img key={i} src={item.imageUrl} alt="" className="w-6 h-6 rounded object-cover border border-border" />
                        ) : (
                          <div key={i} className="w-6 h-6 rounded bg-muted border border-border flex items-center justify-center">
                            <Icon name="CubeIcon" size={9} className="text-muted-foreground" />
                          </div>
                        )
                      )}
                      {devis.items.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">+{devis.items.length - 6}</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right panel: detail ── */}
      {selected && (
        <div className="flex flex-col w-full lg:w-[520px] xl:w-[580px] border-l border-border bg-white overflow-hidden shrink-0">
          {/* Panel header */}
          <div className="shrink-0 px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors lg:hidden">
                  <Icon name="ArrowLeftIcon" size={16} />
                </button>
                <div>
                  <h2 className="text-base font-800 text-foreground">
                    {selected.client?.firstName} {selected.client?.lastName}
                  </h2>
                  <p className="text-[11px] text-muted-foreground">{selected.numero ?? '—'} · {fmtDate(selected.created_at)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => sendWhatsApp(selected)}
                  className="p-2 rounded-xl border border-border hover:bg-green-50 hover:border-green-200 text-green-600 transition-colors"
                  title="Relancer sur WhatsApp"
                >
                  <Icon name="ChatBubbleLeftEllipsisIcon" size={15} />
                </button>
                <a
                  href={`/clients?id=${selected.client_id}`}
                  className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors"
                  title="Voir fiche client"
                >
                  <Icon name="UserIcon" size={15} />
                </a>
                {selected.pdf_url && (
                  <a href={selected.pdf_url} target="_blank" rel="noreferrer"
                    className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground transition-colors" title="PDF">
                    <Icon name="DocumentArrowDownIcon" size={15} />
                  </a>
                )}
                <button onClick={() => setSelected(null)} className="hidden lg:block p-2 rounded-xl hover:bg-muted text-muted-foreground transition-colors">
                  <Icon name="XMarkIcon" size={15} />
                </button>
              </div>
            </div>

            {/* Status bar */}
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              {STATUTS.filter((s) => s.key !== 'tous').map((s) => {
                const isActive = selected.statut === s.key;
                return (
                  <span key={s.key} className={`text-[10px] font-700 px-2 py-1 rounded-full transition-all ${isActive ? `${s.bg} ${s.color} ring-1 ring-current/30` : 'text-muted-foreground/40'}`}>
                    {s.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Panel body */}
          <div className="flex-1 overflow-y-auto">
            {/* Amounts summary */}
            <div className="px-5 py-4 border-b border-border bg-muted/20">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-[10px] font-700 uppercase tracking-widest text-muted-foreground mb-0.5">Total TTC</p>
                  <p className="text-sm font-800 text-foreground">{fmtMoney(selected.total_ttc)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-700 uppercase tracking-widest text-muted-foreground mb-0.5">Client paye</p>
                  <p className="text-sm font-800 text-primary">{fmtMoney(selected.client_pays)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] font-700 uppercase tracking-widest text-muted-foreground mb-0.5">Payé</p>
                  <p className={`text-sm font-800 ${selected.paye_total >= selected.client_pays ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {fmtMoney(selected.paye_total)}
                  </p>
                </div>
              </div>
              {selected.discount_pct > 0 && (
                <p className="text-[10px] text-center text-muted-foreground mt-2">Remise {selected.discount_pct}% appliquée · {selected.free_shipping ? 'Livraison offerte' : ''}</p>
              )}
            </div>

            {/* Items list with stock */}
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground mb-3">
                Articles ({selected.items.length})
              </p>
              <div className="space-y-2">
                {selected.items.map((item, idx) => {
                  const stock = item.productId ? (stockMap[item.productId] ?? null) : null;
                  const needsOrder = toCommander.has(item.id);
                  const isShortage = stock !== null && stock < item.qty;
                  return (
                    <div key={item.id + idx} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                      item.isBonus ? 'bg-amber-50 border-amber-100' : needsOrder ? 'bg-red-50 border-red-100' : 'bg-white border-border'
                    }`}>
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center shrink-0">
                          <Icon name="CubeIcon" size={14} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-600 text-foreground truncate">{item.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {item.ref && <span className="text-[10px] text-muted-foreground">{item.ref}</span>}
                          {item.isBonus && <span className="text-[10px] text-amber-600 bg-amber-100 px-1 rounded">Budget Pro</span>}
                          {item.isCustom && <span className="text-[10px] text-orange-500 bg-orange-50 px-1 rounded">À sourcer</span>}
                          <StockBadge qty={item.qty} stock={stock} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-700">x{item.qty}</p>
                        <p className="text-[10px] text-muted-foreground">{fmtMoney(item.sellPrice * item.qty)}</p>
                      </div>
                      {isShortage && !item.isCustom && (
                        <button
                          onClick={() => setToCommander((prev) => {
                            const next = new Set(prev);
                            next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                            return next;
                          })}
                          className={`shrink-0 p-1.5 rounded-lg border text-[10px] font-600 transition-colors ${
                            needsOrder ? 'bg-red-100 border-red-200 text-red-600' : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                          title="Marquer à commander"
                        >
                          <Icon name="ShoppingCartIcon" size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {toCommander.size > 0 && (
                <div className="mt-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <p className="text-xs font-600 text-red-700">
                    <Icon name="ExclamationTriangleIcon" size={12} className="inline mr-1" />
                    {toCommander.size} article{toCommander.size > 1 ? 's' : ''} à commander fournisseur
                  </p>
                </div>
              )}
            </div>

            {/* Expedition + notes */}
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground mb-3">Expédition & Préparation</p>
              <div className="flex items-center gap-2 mb-3">
                {(['retrait', 'livraison'] as const).map((mode) => (
                  <button key={mode} onClick={() => setTypeExpedition(mode)}
                    className={`flex-1 py-2 text-xs font-700 rounded-xl border transition-colors ${
                      typeExpedition === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}>
                    {mode === 'retrait' ? '🏪 Retrait boutique' : '🚚 Livraison'}
                  </button>
                ))}
              </div>
              {typeExpedition === 'livraison' && (
                <input
                  value={adresseLivraison}
                  onChange={(e) => setAdresseLivraison(e.target.value)}
                  placeholder="Adresse de livraison..."
                  className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 mb-3"
                />
              )}
              <textarea
                value={notesPrepa}
                onChange={(e) => setNotesPrepa(e.target.value)}
                rows={2}
                placeholder="Notes de préparation..."
                className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              />
              <button onClick={savePrepaInfo} disabled={savingNotes} className="mt-2 text-xs font-600 text-primary hover:underline disabled:opacity-50">
                {savingNotes ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>

            {/* Payments */}
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground">Paiements</p>
                <button onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="text-xs font-600 text-primary hover:underline flex items-center gap-1">
                  <Icon name="PlusIcon" size={12} />
                  Ajouter
                </button>
              </div>

              {selected.paiements.length === 0 && !showPaymentForm && (
                <p className="text-xs text-muted-foreground">Aucun paiement enregistré</p>
              )}

              {selected.paiements.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    <Icon name={PAYMENT_METHODS.find((m) => m.value === p.method)?.icon ?? 'BanknotesIcon'} size={13} className="text-muted-foreground" />
                    <span className="text-xs text-foreground">{PAYMENT_METHODS.find((m) => m.value === p.method)?.label}</span>
                    {p.note && <span className="text-[10px] text-muted-foreground">({p.note})</span>}
                  </div>
                  <span className="text-xs font-700 text-emerald-600">+{fmtMoney(p.amount)}</span>
                </div>
              ))}

              {selected.paiements.length > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
                  <span className="text-xs font-700">Total payé</span>
                  <span className={`text-xs font-800 ${selected.paye_total >= selected.client_pays ? 'text-emerald-600' : 'text-orange-600'}`}>
                    {fmtMoney(selected.paye_total)} / {fmtMoney(selected.client_pays)}
                  </span>
                </div>
              )}

              {showPaymentForm && (
                <div className="mt-3 p-3 bg-muted/30 rounded-xl border border-border space-y-2">
                  <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl bg-white focus:outline-none">
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  <input type="number" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)}
                    placeholder="Montant (€)" step="0.01" min="0"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="Note (optionnel)"
                    className="w-full px-3 py-2 text-sm border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <div className="flex gap-2">
                    <button onClick={() => setShowPaymentForm(false)} className="flex-1 py-2 text-xs font-600 border border-border rounded-xl hover:bg-muted">Annuler</button>
                    <button onClick={addPayment} className="flex-1 py-2 text-xs font-700 bg-primary text-primary-foreground rounded-xl hover:opacity-90">Enregistrer</button>
                  </div>
                </div>
              )}
            </div>

            {/* Client info */}
            {selected.client && (
              <div className="px-5 py-4 border-b border-border">
                <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground mb-2">Client</p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  {selected.client.phone && <p><Icon name="PhoneIcon" size={11} className="inline mr-1" />{selected.client.phone}</p>}
                  {selected.client.address && <p><Icon name="MapPinIcon" size={11} className="inline mr-1" />{selected.client.address}{selected.client.city ? `, ${selected.client.city}` : ''}</p>}
                </div>
                <a href={`/clients?id=${selected.client_id}`}
                  className="inline-flex items-center gap-1 mt-2 text-xs font-600 text-primary hover:underline">
                  <Icon name="UserIcon" size={11} /> Voir fiche pro complète
                </a>
              </div>
            )}

            {/* Notes */}
            {selected.notes && (
              <div className="px-5 py-4 border-b border-border">
                <p className="text-[11px] font-700 uppercase tracking-widest text-muted-foreground mb-1">Notes devis</p>
                <p className="text-xs text-foreground whitespace-pre-wrap">{selected.notes}</p>
              </div>
            )}
          </div>

          {/* Panel footer: status action */}
          <div className="shrink-0 px-5 py-4 border-t border-border bg-white">
            {STATUT_NEXT[selected.statut] && (
              <button
                onClick={() => updateStatut(selected, STATUT_NEXT[selected.statut]!.next)}
                disabled={statusUpdating}
                className="w-full py-3 bg-primary text-primary-foreground rounded-2xl text-sm font-700 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {statusUpdating ? <Icon name="ArrowPathIcon" size={16} className="animate-spin" /> : <Icon name="ArrowRightCircleIcon" size={16} />}
                {STATUT_NEXT[selected.statut]!.label}
              </button>
            )}
            {selected.statut !== 'annule' && selected.statut !== 'livre' && (
              <button
                onClick={() => updateStatut(selected, 'annule')}
                className="w-full mt-2 py-2 text-xs font-600 text-red-400 hover:text-red-600 transition-colors"
              >
                Annuler ce devis
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
