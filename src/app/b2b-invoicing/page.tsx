'use client';

import React, { useState, useEffect, useRef } from 'react';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { clientService, type Client } from '@/lib/services/clientService';
import { sendInvoiceEmail, sendEstimateEmail, type InvoiceEmailData } from '@/lib/services/emailService';

// ─── Types ────────────────────────────────────────────────────────────────────

type DocType = 'estimate' | 'proforma' | 'invoice' | 'credit_note';
type DocStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'paid' | 'overdue' | 'cancelled';

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  tvaRate: number;
  discount: number;
}

interface B2BDocument {
  id: string;
  type: DocType;
  number: string;
  status: DocStatus;
  clientId: string;
  clientName: string;
  clientEmail: string;
  clientAddress: string;
  clientSiret: string;
  clientTva: string;
  sellerName: string;
  sellerAddress: string;
  sellerSiret: string;
  sellerTva: string;
  issueDate: string;
  dueDate: string;
  lines: LineItem[];
  notes: string;
  paymentTerms: string;
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_TYPE_CONFIG: Record<DocType, { label: string; prefix: string; color: string; icon: string }> = {
  estimate: { label: 'Devis', prefix: 'DEV', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: 'DocumentTextIcon' },
  proforma: { label: 'Facture Proforma', prefix: 'PRO', color: 'text-purple-700 bg-purple-50 border-purple-200', icon: 'DocumentDuplicateIcon' },
  invoice: { label: 'Facture', prefix: 'FAC', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'DocumentCheckIcon' },
  credit_note: { label: 'Avoir', prefix: 'AVO', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: 'ArrowUturnLeftIcon' },
};

const STATUS_CONFIG: Record<DocStatus, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'text-slate-600 bg-slate-100 border-slate-200' },
  sent: { label: 'Envoyé', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  accepted: { label: 'Accepté', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  rejected: { label: 'Refusé', color: 'text-red-700 bg-red-50 border-red-200' },
  paid: { label: 'Payé', color: 'text-green-700 bg-green-50 border-green-200' },
  overdue: { label: 'En retard', color: 'text-red-700 bg-red-100 border-red-300' },
  cancelled: { label: 'Annulé', color: 'text-slate-500 bg-slate-50 border-slate-200' },
};

const TVA_RATES = [0, 5.5, 8.5, 10, 20];

const PAYMENT_TERMS = [
  'Paiement immédiat',
  'Paiement à 15 jours',
  'Paiement à 30 jours',
  'Paiement à 45 jours',
  'Paiement à 60 jours',
  'Paiement à réception',
];

// ─── Auto-numbering ────────────────────────────────────────────────────────────

function generateDocNumber(type: DocType, docs: B2BDocument[]): string {
  const { prefix } = DOC_TYPE_CONFIG[type];
  const year = new Date().getFullYear();
  const existing = docs.filter((d) => d.type === type && d.number.includes(`${year}`));
  const seq = (existing.length + 1).toString().padStart(4, '0');
  return `${prefix}-${year}-${seq}`;
}

// ─── Mock seed data ────────────────────────────────────────────────────────────

const SEED_DOCS: B2BDocument[] = [
  {
    id: 'doc-1',
    type: 'invoice',
    number: 'FAC-2026-0001',
    status: 'paid',
    clientId: 'c1',
    clientName: 'Salon Élégance SARL',
    clientEmail: 'contact@elegance-salon.fr',
    clientAddress: '12 Rue de la Paix, 75001 Paris',
    clientSiret: '123 456 789 00012',
    clientTva: 'FR12345678901',
    sellerName: '', sellerAddress: '', sellerSiret: '', sellerTva: '',
    issueDate: '2026-04-15',
    dueDate: '2026-05-15',
    lines: [
      { id: 'l1', description: 'Produits capillaires premium (lot 24)', quantity: 24, unitPrice: 18.5, tvaRate: 20, discount: 5 },
      { id: 'l2', description: 'Coloration professionnelle (lot 12)', quantity: 12, unitPrice: 32, tvaRate: 20, discount: 0 },
    ],
    notes: 'Merci pour votre confiance.',
    paymentTerms: 'Paiement à 30 jours',
    totalHt: 826.8,
    totalTva: 165.36,
    totalTtc: 992.16,
    createdAt: '2026-04-15T10:00:00Z',
  },
  {
    id: 'doc-2',
    type: 'estimate',
    number: 'DEV-2026-0001',
    status: 'sent',
    clientId: 'c2',
    clientName: 'Beauty Pro SAS',
    clientEmail: 'achats@beautypro.fr',
    clientAddress: '45 Avenue des Fleurs, 69001 Lyon',
    clientSiret: '987 654 321 00034',
    clientTva: 'FR98765432100',
    sellerName: '', sellerAddress: '', sellerSiret: '', sellerTva: '',
    issueDate: '2026-05-01',
    dueDate: '2026-05-31',
    lines: [
      { id: 'l3', description: 'Soins visage gamme luxe (lot 6)', quantity: 6, unitPrice: 55, tvaRate: 20, discount: 10 },
    ],
    notes: 'Devis valable 30 jours.',
    paymentTerms: 'Paiement à 30 jours',
    totalHt: 297,
    totalTva: 59.4,
    totalTtc: 356.4,
    createdAt: '2026-05-01T09:00:00Z',
  },
  {
    id: 'doc-3',
    type: 'proforma',
    number: 'PRO-2026-0001',
    status: 'draft',
    clientId: 'c3',
    clientName: 'Institut Beauté & Co',
    clientEmail: 'commandes@beaute-co.fr',
    clientAddress: '8 Rue du Commerce, 33000 Bordeaux',
    clientSiret: '456 789 123 00056',
    clientTva: 'FR45678912300',
    sellerName: '', sellerAddress: '', sellerSiret: '', sellerTva: '',
    issueDate: '2026-05-10',
    dueDate: '2026-06-10',
    lines: [
      { id: 'l4', description: 'Vernis semi-permanent (lot 48)', quantity: 48, unitPrice: 8.9, tvaRate: 20, discount: 0 },
      { id: 'l5', description: 'Lampes UV professionnelles', quantity: 4, unitPrice: 89, tvaRate: 20, discount: 0 },
    ],
    notes: 'Facture proforma pour commande internationale.',
    paymentTerms: 'Paiement immédiat',
    totalHt: 783.2,
    totalTva: 156.64,
    totalTtc: 939.84,
    createdAt: '2026-05-10T14:00:00Z',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcLine(line: LineItem) {
  const base = line.quantity * line.unitPrice;
  const afterDiscount = base * (1 - line.discount / 100);
  const tva = afterDiscount * (line.tvaRate / 100);
  return { ht: afterDiscount, tva, ttc: afterDiscount + tva };
}

function calcTotals(lines: LineItem[]) {
  let totalHt = 0, totalTva = 0;
  for (const l of lines) {
    const { ht, tva } = calcLine(l);
    totalHt += ht;
    totalTva += tva;
  }
  return { totalHt, totalTva, totalTtc: totalHt + totalTva };
}

function newLine(): LineItem {
  return { id: `l-${Date.now()}`, description: '', quantity: 1, unitPrice: 0, tvaRate: 20, discount: 0 };
}

function formatCurrency(v: number) {
  const formatted = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return (v < 0 ? '-' : '') + formatted + '\u00a0€';
}

function formatDate(d: string) {
  if (!d) return '—';
  const parts = d.substring(0, 10).split('-');
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DocTypeBadge({ type }: { type: DocType }) {
  const cfg = DOC_TYPE_CONFIG[type] ?? { label: type, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: 'DocumentIcon' };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      <Icon name={cfg.icon as any} size={11} />
      {cfg.label}
    </span>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600 bg-gray-50 border-gray-200' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Document Form Modal ──────────────────────────────────────────────────────

interface DocFormModalProps {
  doc: Partial<B2BDocument> | null;
  allDocs: B2BDocument[];
  clients: Client[];
  onClose: () => void;
  onSave: (doc: B2BDocument) => void;
}

function DocFormModal({ doc, allDocs, clients, onClose, onSave }: DocFormModalProps) {
  const isNew = !doc?.id;
  const [type, setType] = useState<DocType>(doc?.type ?? 'invoice');
  const [status, setStatus] = useState<DocStatus>(doc?.status ?? 'draft');
  const [clientId, setClientId] = useState(doc?.clientId ?? '');
  const [clientName, setClientName] = useState(doc?.clientName ?? '');
  const [clientEmail, setClientEmail] = useState(doc?.clientEmail ?? '');
  const [clientAddress, setClientAddress] = useState(doc?.clientAddress ?? '');
  const [clientSiret, setClientSiret] = useState(doc?.clientSiret ?? '');
  const [clientTva, setClientTva] = useState(doc?.clientTva ?? '');
  const [issueDate, setIssueDate] = useState(doc?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [saleDate, setSaleDate] = useState(doc?.issueDate ?? new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(doc?.dueDate ?? '');
  const [lines, setLines] = useState<LineItem[]>(doc?.lines?.length ? doc.lines : [newLine()]);
  const [notes, setNotes] = useState(doc?.notes ?? '');
  const [paymentTerms, setPaymentTerms] = useState(doc?.paymentTerms ?? 'Paiement à 30 jours');
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  // Product search per line
  const [productSearches, setProductSearches] = useState<Record<string, string>>({});
  const [productResults, setProductResults] = useState<Record<string, any[]>>({});
  const [showProductDropdown, setShowProductDropdown] = useState<Record<string, boolean>>({});
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeDropdownLine, setActiveDropdownLine] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  // Seller info
  const [sellerName, setSellerName] = useState(doc?.sellerName ?? '');
  const [sellerAddress, setSellerAddress] = useState(doc?.sellerAddress ?? '');
  const [sellerSiret, setSellerSiret] = useState(doc?.sellerSiret ?? '');
  const [sellerTva, setSellerTva] = useState(doc?.sellerTva ?? '');

  // Load seller info from settings on mount (only for new docs)
  useEffect(() => {
    if (doc?.id) return;
    try {
      const raw = localStorage.getItem('beautypos_settings');
      if (!raw) return;
      const s = JSON.parse(raw);
      const addr = [s.address, s.city, s.postal_code].filter(Boolean).join(', ');
      if (s.company_name) setSellerName(s.company_name);
      if (addr) setSellerAddress(addr);
      if (s.siret) setSellerSiret(s.siret);
      if (s.tva_number) setSellerTva(s.tva_number);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Legal mentions
  const [latePenaltyRate, setLatePenaltyRate] = useState('3');
  const [recoveryFee, setRecoveryFee] = useState('40');
  const [legalMentions, setLegalMentions] = useState(
    type === 'invoice' ?'En cas de retard de paiement, des pénalités de retard au taux de 3 fois le taux légal seront appliquées. Indemnité forfaitaire de recouvrement : 40 €.' :''
  );

  const searchProducts = async (lineId: string, query: string) => {
    setProductSearches((prev) => ({ ...prev, [lineId]: query }));
    if (query.trim().length < 2) {
      setActiveDropdownLine(null);
      setDropdownPos(null);
      return;
    }
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(query.trim())}&limit=8`);
      const json = await res.json();
      const results: any[] = json.products ?? [];
      // Recalculate position after fetch so it reflects current scroll state
      const inputEl = inputRefs.current[lineId];
      if (inputEl) {
        const rect = inputEl.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setDropdownPos({
          top: spaceBelow >= 120 ? rect.bottom + 4 : Math.max(8, rect.top - 292 - 4),
          left: rect.left,
          width: Math.max(rect.width, 384),
        });
      }
      setProductResults((prev) => ({ ...prev, [lineId]: results }));
      setActiveDropdownLine(results.length > 0 ? lineId : null);
    } catch {
      setActiveDropdownLine(null);
      setDropdownPos(null);
    }
  };

  const selectProduct = (lineId: string, product: any) => {
    const tvaRate = product.tva ?? 8.5;
    const priceHt = product.sell_price_ht
      ? Number(product.sell_price_ht)
      : product.sell_price_ttc
        ? Math.round((Number(product.sell_price_ttc) / (1 + tvaRate / 100)) * 100) / 100
        : 0;
    setLines((prev) => prev.map((l) => l.id === lineId ? {
      ...l,
      description: product.name + (product.ref ? ` (Réf: ${product.ref})` : ''),
      unitPrice: priceHt,
      tvaRate,
    } : l));
    setProductSearches((prev) => { const { [lineId]: _, ...rest } = prev; return rest; });
    setActiveDropdownLine(null);
    setDropdownPos(null);
  };

  const docNumber = isNew ? generateDocNumber(type, allDocs) : (doc?.number ?? '');

  const filteredClients = clients.filter((c) =>
    `${c.fullName} ${c.email ?? ''} ${c.phone ?? ''}`.toLowerCase().includes(clientSearch.toLowerCase())
  );

  function selectClient(c: Client) {
    setClientId(c.id);
    setClientName(c.fullName);
    setClientEmail(c.email ?? '');
    setClientAddress([c.address, c.city, c.postalCode].filter(Boolean).join(', '));
    setClientSiret('');
    setClientTva('');
    setClientSearch(c.fullName);
    setShowClientDropdown(false);
  }

  function updateLine(id: string, field: keyof LineItem, value: any) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  const { totalHt, totalTva, totalTtc } = calcTotals(lines);

  // TVA breakdown by rate
  const tvaBreakdown = TVA_RATES.map((rate) => {
    const base = lines.filter((l) => l.tvaRate === rate).reduce((s, l) => s + calcLine(l).ht, 0);
    const tva = base * (rate / 100);
    return { rate, base, tva };
  }).filter((r) => r.base > 0);

  function handleSave() {
    const saved: B2BDocument = {
      id: doc?.id ?? `doc-${Date.now()}`,
      type,
      number: docNumber,
      status,
      clientId,
      clientName,
      clientEmail,
      clientAddress,
      clientSiret,
      clientTva,
      sellerName,
      sellerAddress,
      sellerSiret,
      sellerTva,
      issueDate,
      dueDate,
      lines,
      notes,
      paymentTerms,
      totalHt,
      totalTva,
      totalTtc,
      createdAt: doc?.createdAt ?? new Date().toISOString(),
    };
    onSave(saved);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon name="DocumentTextIcon" size={18} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isNew ? 'Nouveau document' : `Modifier — ${doc?.number}`}
              </h2>
              {!isNew && <p className="text-xs text-muted-foreground">{docNumber}</p>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Type + Status + Number */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Type de document</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as DocType)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(Object.keys(DOC_TYPE_CONFIG) as DocType[]).map((t) => (
                  <option key={t} value={t}>{DOC_TYPE_CONFIG[t].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Numéro</label>
              <input
                readOnly
                value={docNumber}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-muted text-muted-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Statut</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as DocStatus)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {(Object.keys(STATUS_CONFIG) as DocStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Seller info */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Icon name="BuildingStorefrontIcon" size={15} className="text-primary" />
              Informations vendeur (mentions obligatoires)
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nom / Raison sociale</label>
                <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Adresse</label>
                <input value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="123 Rue de la Beauté, 75001 Paris" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">SIREN / SIRET</label>
                <input value={sellerSiret} onChange={(e) => setSellerSiret(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="000 000 000 00000" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">N° TVA intracommunautaire</label>
                <input value={sellerTva} onChange={(e) => setSellerTva(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="FR00000000000" />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date d'émission</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date de vente / prestation</label>
              <input type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Date d'échéance</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
          </div>

          {/* Client selection */}
          <div className="border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Icon name="BuildingOfficeIcon" size={15} className="text-primary" />
              Client / Entreprise
            </h3>
            <div className="relative">
              <input
                type="text"
                placeholder="Rechercher un client..."
                value={clientSearch}
                onChange={(e) => { setClientSearch(e.target.value); setShowClientDropdown(true); }}
                onFocus={() => setShowClientDropdown(true)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 pl-9"
              />
              <Icon name="MagnifyingGlassIcon" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              {showClientDropdown && filteredClients.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                  {filteredClients.slice(0, 8).map((c) => (
                    <button
                      key={c.id}
                      onClick={() => selectClient(c)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left text-sm"
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold text-primary">{c.firstName[0]}{c.lastName[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{c.fullName}</p>
                        <p className="text-xs text-muted-foreground">{c.email ?? c.phone ?? ''}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Nom / Raison sociale</label>
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Salon Élégance SARL" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Email</label>
                <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="contact@entreprise.fr" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Adresse</label>
                <input value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="12 Rue de la Paix, 75001 Paris" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">SIRET</label>
                <input value={clientSiret} onChange={(e) => setClientSiret(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="123 456 789 00012" />
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">N° TVA intracommunautaire</label>
                <input value={clientTva} onChange={(e) => setClientTva(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="FR12345678901" />
              </div>
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Icon name="ListBulletIcon" size={15} className="text-primary" />
                Lignes de facturation
              </h3>
              <button
                onClick={() => setLines((prev) => [...prev, newLine()])}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 px-3 py-1.5 rounded-lg border border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <Icon name="PlusIcon" size={13} />
                Ajouter une ligne
              </button>
            </div>
            <div className="border border-border rounded-xl overflow-visible">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-[35%] rounded-tl-xl">Description</th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground w-[8%]">Qté</th>
                    <th className="text-right px-2 py-2.5 text-xs font-medium text-muted-foreground w-[12%]">P.U. HT</th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground w-[10%]">TVA %</th>
                    <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground w-[8%]">Remise %</th>
                    <th className="text-right px-2 py-2.5 text-xs font-medium text-muted-foreground w-[12%]">Total HT</th>
                    <th className="text-right px-2 py-2.5 text-xs font-medium text-muted-foreground w-[12%]">Total TTC</th>
                    <th className="w-[3%] rounded-tr-xl"></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const { ht, ttc } = calcLine(line);
                    return (
                      <tr key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/20'}>
                        <td className="px-3 py-2">
                          <input
                            ref={(el) => { inputRefs.current[line.id] = el; }}
                            value={productSearches[line.id] ?? line.description}
                            onChange={(e) => {
                              updateLine(line.id, 'description', e.target.value);
                              searchProducts(line.id, e.target.value);
                            }}
                            onFocus={() => {
                              const q = productSearches[line.id] ?? line.description;
                              if (q.trim().length >= 2) searchProducts(line.id, q);
                            }}
                            onBlur={() => setTimeout(() => setActiveDropdownLine(null), 300)}
                            className="w-full bg-transparent border-0 focus:outline-none text-sm text-foreground placeholder:text-muted-foreground"
                            placeholder="Rechercher par nom, référence ou code-barre…"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            value={line.quantity}
                            onChange={(e) => updateLine(line.id, 'quantity', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent border-0 focus:outline-none text-sm text-center"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent border-0 focus:outline-none text-sm text-right"
                          />
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={line.tvaRate}
                            onChange={(e) => updateLine(line.id, 'tvaRate', parseFloat(e.target.value))}
                            className="w-full bg-transparent border-0 focus:outline-none text-sm text-center"
                          >
                            {TVA_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={line.discount}
                            onChange={(e) => updateLine(line.id, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full bg-transparent border-0 focus:outline-none text-sm text-center"
                          />
                        </td>
                        <td className="px-2 py-2 text-right text-sm font-medium text-foreground">{formatCurrency(ht)}</td>
                        <td className="px-2 py-2 text-right text-sm font-semibold text-foreground">{formatCurrency(ttc)}</td>
                        <td className="px-2 py-2">
                          <button onClick={() => removeLine(line.id)} className="text-muted-foreground hover:text-red-500 transition-colors">
                            <Icon name="TrashIcon" size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals + TVA breakdown */}
          <div className="flex gap-6 justify-end">
            {/* TVA breakdown */}
            <div className="flex-1 max-w-xs">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Détail TVA</h4>
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Taux</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">Base HT</th>
                      <th className="text-right px-3 py-2 font-medium text-muted-foreground">TVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tvaBreakdown.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-2 text-center text-muted-foreground">—</td></tr>
                    ) : tvaBreakdown.map((r) => (
                      <tr key={r.rate} className="border-t border-border">
                        <td className="px-3 py-2">{r.rate}%</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(r.base)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(r.tva)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="w-64 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total HT</span>
                <span className="font-medium">{formatCurrency(totalHt)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total TVA</span>
                <span className="font-medium">{formatCurrency(totalTva)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold border-t border-border pt-2 mt-2">
                <span>Total TTC</span>
                <span className="text-primary">{formatCurrency(totalTtc)}</span>
              </div>
            </div>
          </div>

          {/* Legal mentions + payment conditions */}
          {(type === 'invoice' || type === 'proforma') && (
            <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <Icon name="ScaleIcon" size={15} />
                Mentions légales obligatoires (facture France)
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Conditions de paiement</label>
                  <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300">
                    {PAYMENT_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Taux pénalités retard (%)</label>
                  <input type="number" value={latePenaltyRate} onChange={(e) => setLatePenaltyRate(e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="3" />
                </div>
                <div>
                  <label className="block text-xs text-amber-700 mb-1">Indemnité forfaitaire (€)</label>
                  <input type="number" value={recoveryFee} onChange={(e) => setRecoveryFee(e.target.value)}
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="40" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-amber-700 mb-1">Mentions légales (texte libre)</label>
                <textarea value={legalMentions} onChange={(e) => setLegalMentions(e.target.value)} rows={2}
                  className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                  placeholder="Pénalités de retard, garantie légale de conformité, etc." />
              </div>
              <div className="text-xs text-amber-600 bg-amber-100 rounded-lg p-2">
                ℹ️ Mentions obligatoires : numéro unique de facture, date d'émission, date de vente, identité vendeur (SIRET), identité acheteur, désignation produits, quantité, prix unitaire HT, taux TVA, montant TVA, total HT, total TTC, conditions de paiement.
              </div>
            </div>
          )}
          {type === 'estimate' && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Conditions de paiement</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
                {PAYMENT_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">Notes / Informations complémentaires</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Conditions particulières, mentions légales, informations complémentaires..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-white transition-colors">
            Annuler
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { handleSave(); }}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-muted text-foreground border border-border rounded-lg hover:bg-white transition-colors"
            >
              <Icon name="DocumentArrowDownIcon" size={15} />
              Enregistrer brouillon
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Icon name="CheckIcon" size={15} />
              Enregistrer
            </button>
          </div>
        </div>
      </div>

      {/* Product search dropdown — rendered fixed so overflow-y-auto modal can't clip it */}
      {activeDropdownLine && dropdownPos && (
        <div
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
          className="bg-white border border-border rounded-xl shadow-2xl max-h-72 overflow-y-auto"
        >
          {(productResults[activeDropdownLine] ?? []).length > 0 ? (
            (productResults[activeDropdownLine] ?? []).map((p: any) => {
              const isRupture = (p.stock ?? 0) <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); selectProduct(activeDropdownLine, p); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted text-left text-sm border-b border-border/50 last:border-0"
                >
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon name="TagIcon" size={13} className="text-primary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-foreground truncate">{p.name}</span>
                      {isRupture && <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 border border-red-200 leading-none">RUPTURE</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                      {p.ref && <span>Réf: <strong>{p.ref}</strong></span>}
                      {p.sell_price_ttc != null && <span>{Number(p.sell_price_ttc).toFixed(2)} € TTC</span>}
                      <span className={isRupture ? 'text-red-500 font-medium' : ''}>Stock: {p.stock ?? 0}</span>
                      <span>TVA {p.tva ?? 8.5}%</span>
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="px-4 py-3 text-sm text-muted-foreground text-center">Aucun produit trouvé</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Document Preview Modal ───────────────────────────────────────────────────

function DocPreviewModal({ doc, onClose, onSendEmail }: { doc: B2BDocument; onClose: () => void; onSendEmail: (doc: B2BDocument) => void }) {
  const cfg = DOC_TYPE_CONFIG[doc.type] ?? { label: doc.type, color: 'text-gray-600 bg-gray-50 border-gray-200', icon: 'DocumentIcon', prefix: '?' };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto py-6 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <DocTypeBadge type={doc.type} />
            <span className="font-semibold text-foreground">{doc.number}</span>
            <StatusBadge status={doc.status} />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onSendEmail(doc)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            >
              <Icon name="EnvelopeIcon" size={13} />
              Envoyer par email
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Icon name="PrinterIcon" size={13} />
              Imprimer / PDF
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
              <Icon name="XMarkIcon" size={16} />
            </button>
          </div>
        </div>

        {/* Document body */}
        <div className="p-8 space-y-6 font-mono text-sm" id="doc-preview">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div>
              <div className="text-2xl font-bold text-foreground mb-1">{doc.sellerName || 'Vendeur'}</div>
              <div className="text-xs text-muted-foreground leading-relaxed">
                {doc.sellerAddress && <>{doc.sellerAddress}<br /></>}
                {doc.sellerSiret && <>SIRET : {doc.sellerSiret}<br /></>}
                {doc.sellerTva && <>TVA : {doc.sellerTva}</>}
              </div>
            </div>
            <div className="text-right">
              <div className={`inline-block px-4 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wider mb-2 ${cfg.color}`}>
                {cfg.label}
              </div>
              <div className="text-lg font-bold text-foreground">{doc.number}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Émis le : {formatDate(doc.issueDate)}<br />
                Échéance : {formatDate(doc.dueDate)}
              </div>
            </div>
          </div>

          {/* Client */}
          <div className="bg-muted/40 rounded-xl p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Destinataire</div>
            <div className="font-semibold text-foreground">{doc.clientName}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {doc.clientAddress && <div>{doc.clientAddress}</div>}
              {doc.clientEmail && <div>{doc.clientEmail}</div>}
              {doc.clientSiret && <div>SIRET : {doc.clientSiret}</div>}
              {doc.clientTva && <div>TVA : {doc.clientTva}</div>}
            </div>
          </div>

          {/* Lines */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-foreground">
                <th className="text-left py-2 font-semibold">Description</th>
                <th className="text-center py-2 font-semibold w-12">Qté</th>
                <th className="text-right py-2 font-semibold w-20">P.U. HT</th>
                <th className="text-center py-2 font-semibold w-14">TVA</th>
                <th className="text-center py-2 font-semibold w-14">Remise</th>
                <th className="text-right py-2 font-semibold w-20">Total HT</th>
                <th className="text-right py-2 font-semibold w-20">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => {
                const { ht, ttc } = calcLine(line);
                return (
                  <tr key={line.id} className={`border-b border-border ${i % 2 === 0 ? '' : 'bg-muted/20'}`}>
                    <td className="py-2">{line.description}</td>
                    <td className="py-2 text-center">{line.quantity}</td>
                    <td className="py-2 text-right">{formatCurrency(line.unitPrice)}</td>
                    <td className="py-2 text-center">{line.tvaRate}%</td>
                    <td className="py-2 text-center">{line.discount > 0 ? `${line.discount}%` : '—'}</td>
                    <td className="py-2 text-right">{formatCurrency(ht)}</td>
                    <td className="py-2 text-right font-medium">{formatCurrency(ttc)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Total HT</span><span>{formatCurrency(doc.totalHt)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Total TVA</span><span>{formatCurrency(doc.totalTva)}</span></div>
              <div className="flex justify-between font-bold text-sm border-t border-foreground pt-1.5 mt-1.5">
                <span>Total TTC</span><span className="text-primary">{formatCurrency(doc.totalTtc)}</span>
              </div>
            </div>
          </div>

          {/* Payment terms + notes */}
          <div className="border-t border-border pt-4 space-y-2 text-xs text-muted-foreground">
            <div><span className="font-semibold text-foreground">Conditions de paiement :</span> {doc.paymentTerms}</div>
            {doc.notes && <div><span className="font-semibold text-foreground">Notes :</span> {doc.notes}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Email Modal ──────────────────────────────────────────────────────────────

function EmailModal({ doc, onClose }: { doc: B2BDocument; onClose: () => void }) {
  const [to, setTo] = useState(doc.clientEmail);
  const docTypeLabel = (DOC_TYPE_CONFIG[doc.type] ?? { label: doc.type }).label;
  const [subject, setSubject] = useState(`${docTypeLabel} ${doc.number} — BeautyPOS`);
  const [body, setBody] = useState(
    `Bonjour,\n\nVeuillez trouver ci-joint votre ${docTypeLabel.toLowerCase()} n° ${doc.number} d'un montant de ${formatCurrency(doc.totalTtc)} TTC.\n\n${doc.paymentTerms}.\n\nCordialement,\nL'équipe BeautyPOS`
  );
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSend() {
    if (!to.includes('@')) return;
    setSending(true);
    setErrorMsg('');

    const emailData: InvoiceEmailData = {
      type: doc.type as InvoiceEmailData['type'],
      number: doc.number,
      issueDate: doc.issueDate,
      dueDate: doc.dueDate,
      clientName: doc.clientName,
      clientEmail: doc.clientEmail,
      clientAddress: doc.clientAddress || undefined,
      clientSiret: doc.clientSiret || undefined,
      clientTva: doc.clientTva || undefined,
      lines: doc.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        tvaRate: l.tvaRate,
        discount: l.discount,
      })),
      totalHt: doc.totalHt,
      totalTva: doc.totalTva,
      totalTtc: doc.totalTtc,
      paymentTerms: doc.paymentTerms,
      notes: doc.notes || undefined,
    };

    const sendFn = doc.type === 'estimate' ? sendEstimateEmail : sendInvoiceEmail;
    const result = await sendFn(to, emailData);
    setSending(false);

    if (result.success) {
      setSent(true);
      setTimeout(onClose, 1800);
    } else {
      setErrorMsg(result.error ?? 'Erreur lors de l\'envoi');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Icon name="EnvelopeIcon" size={16} className="text-primary" />
            Envoyer par email
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>
        {sent ? (
          <div className="p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Icon name="CheckIcon" size={24} className="text-emerald-600" />
            </div>
            <p className="font-semibold text-foreground">Email envoyé avec succès !</p>
            <p className="text-sm text-muted-foreground mt-1">Le document a été transmis à {to}</p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Destinataire</label>
              <input value={to} onChange={(e) => setTo(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Objet</label>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">Message d'accompagnement</label>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none" />
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
              <Icon name="InformationCircleIcon" size={14} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                Un email HTML professionnel avec le détail complet du document sera envoyé via <strong>Resend</strong>.
              </p>
            </div>
            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                <p className="text-xs text-red-700 font-semibold mb-1">⚠️ Erreur d'envoi</p>
                <p className="text-xs text-red-600">{errorMsg}</p>
                {errorMsg.toLowerCase().includes('resend_api_key') || errorMsg.toLowerCase().includes('non configurée') ? (
                  <p className="text-xs text-red-500 mt-1.5 border-t border-red-200 pt-1.5">
                    💡 La clé API Resend n'est pas configurée dans les secrets Supabase. Allez dans <strong>Supabase → Edge Functions → Secrets</strong> et ajoutez <code className="bg-red-100 px-1 rounded">RESEND_API_KEY</code> avec votre clé Resend.
                  </p>
                ) : null}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">Annuler</button>
              <button
                onClick={handleSend}
                disabled={!to.includes('@') || sending}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {sending ? (
                  <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                ) : (
                  <Icon name="PaperAirplaneIcon" size={14} />
                )}
                {sending ? 'Envoi en cours…' : 'Envoyer'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type TabFilter = 'all' | DocType;

export default function B2BInvoicingPage() {
  const [docs, setDocs] = useState<B2BDocument[]>(SEED_DOCS);
  const [clients, setClients] = useState<Client[]>([]);
  const [tab, setTab] = useState<TabFilter>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<DocStatus | 'all'>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<Partial<B2BDocument> | null>(null);
  const [previewDoc, setPreviewDoc] = useState<B2BDocument | null>(null);
  const [emailDoc, setEmailDoc] = useState<B2BDocument | null>(null);

  // Devis emitted from POS (stored in factures table with doc_type='devis')
  const [posDevis, setPosDevis] = useState<any[]>([]);
  const [posDevisLoading, setPosDevisLoading] = useState(true);

  useEffect(() => {
    clientService.getAll().then(setClients).catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/factures?type=devis')
      .then((r) => r.ok ? r.json() : Promise.resolve([]))
      .then((data) => setPosDevis(Array.isArray(data) ? data : []))
      .catch(() => setPosDevis([]))
      .finally(() => setPosDevisLoading(false));
  }, []);

  const filtered = docs.filter((d) => {
    if (tab !== 'all' && d.type !== tab) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!`${d.number} ${d.clientName} ${d.clientEmail}`.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  function handleSave(doc: B2BDocument) {
    setDocs((prev) => {
      const idx = prev.findIndex((d) => d.id === doc.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = doc; return next; }
      return [doc, ...prev];
    });
    setShowForm(false);
    setEditingDoc(null);
  }

  function handleDelete(id: string) {
    if (confirm('Supprimer ce document ?')) setDocs((prev) => prev.filter((d) => d.id !== id));
  }

  function handleConvertToInvoice(doc: B2BDocument) {
    const newInvoice: B2BDocument = {
      ...doc,
      id: `doc-${Date.now()}`,
      type: 'invoice',
      status: 'draft',
      number: generateDocNumber('invoice', docs),
      issueDate: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
    };
    setDocs((prev) => {
      // Mark original quote as converted
      const updated = prev.map((d) => d.id === doc.id ? { ...d, status: 'cancelled' as DocStatus } : d);
      return [newInvoice, ...updated];
    });
    setEditingDoc(newInvoice);
    setShowForm(true);
  }

  // KPIs — quotes (estimates) do NOT count in revenue
  const totalInvoiced = docs.filter((d) => d.type === 'invoice').reduce((s, d) => s + d.totalTtc, 0);
  const totalPaid = docs.filter((d) => d.type === 'invoice' && d.status === 'paid').reduce((s, d) => s + d.totalTtc, 0);
  const totalPending = docs.filter((d) => d.type === 'invoice' && ['sent', 'accepted'].includes(d.status)).reduce((s, d) => s + d.totalTtc, 0);
  const totalOverdue = docs.filter((d) => d.status === 'overdue').reduce((s, d) => s + d.totalTtc, 0);
  const totalQuotes = docs.filter((d) => d.type === 'estimate' && !['cancelled'].includes(d.status)).reduce((s, d) => s + d.totalTtc, 0);

  const tabs: { id: TabFilter; label: string; count: number }[] = [
    { id: 'all', label: 'Tous', count: docs.length },
    { id: 'invoice', label: 'Factures', count: docs.filter((d) => d.type === 'invoice').length },
    { id: 'estimate', label: 'Devis', count: docs.filter((d) => d.type === 'estimate').length },
    { id: 'proforma', label: 'Proforma', count: docs.filter((d) => d.type === 'proforma').length },
    { id: 'credit_note', label: 'Avoirs', count: docs.filter((d) => d.type === 'credit_note').length },
  ];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border bg-white shrink-0">
          <div>
            <h1 className="text-xl font-bold text-foreground">Facturation B2B</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Devis, factures proforma, factures et avoirs professionnels</p>
          </div>
          <button
            onClick={() => { setEditingDoc({}); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
          >
            <Icon name="PlusIcon" size={16} />
            Nouveau document
          </button>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-4 px-6 py-4 bg-muted/30 border-b border-border shrink-0">
          {[
            { label: 'Total facturé', value: formatCurrency(totalInvoiced), icon: 'DocumentTextIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'Encaissé', value: formatCurrency(totalPaid), icon: 'CheckCircleIcon', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'En attente', value: formatCurrency(totalPending), icon: 'ClockIcon', color: 'text-amber-600 bg-amber-50' },
            { label: 'En retard', value: formatCurrency(totalOverdue), icon: 'ExclamationTriangleIcon', color: 'text-red-600 bg-red-50' },
            { label: 'Devis (hors CA)', value: formatCurrency(totalQuotes), icon: 'DocumentTextIcon', color: 'text-slate-600 bg-slate-100', note: true },
          ].map((kpi: any) => (
            <div key={kpi.label} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${kpi.color}`}>
                <Icon name={kpi.icon as any} size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-base font-bold text-foreground">{kpi.value}</p>
                {kpi.note && <p className="text-[10px] text-amber-600">⚠️ Non comptabilisé</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Tabs + filters */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-white shrink-0 gap-4">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {t.label}
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Rechercher..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="border border-border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 w-48"
              />
              <Icon name="MagnifyingGlassIcon" size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="border border-border rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="all">Tous statuts</option>
              {(Object.keys(STATUS_CONFIG) as DocStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
                <Icon name="DocumentTextIcon" size={24} className="text-muted-foreground" />
              </div>
              <p className="font-semibold text-foreground">Aucun document trouvé</p>
              <p className="text-sm text-muted-foreground mt-1">Créez votre premier document B2B</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Numéro</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Échéance</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Montant TTC</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((doc, idx) => (
                    <tr
                      key={doc.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer ${idx % 2 === 0 ? '' : 'bg-muted/10'}`}
                      onClick={() => setPreviewDoc(doc)}
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{doc.number}</td>
                      <td className="px-4 py-3"><DocTypeBadge type={doc.type} /></td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{doc.clientName}</div>
                        <div className="text-xs text-muted-foreground">{doc.clientEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(doc.issueDate)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(doc.dueDate)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(doc.totalTtc)}</td>
                      <td className="px-4 py-3"><StatusBadge status={doc.status} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Aperçu"
                          >
                            <Icon name="EyeIcon" size={14} />
                          </button>
                          <button
                            onClick={() => { setEditingDoc(doc); setShowForm(true); }}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Modifier"
                          >
                            <Icon name="PencilIcon" size={14} />
                          </button>
                          {doc.type === 'estimate' && (
                            <button
                              onClick={() => handleConvertToInvoice(doc)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600 transition-colors"
                              title="Convertir en facture"
                            >
                              <Icon name="ArrowRightCircleIcon" size={14} />
                            </button>
                          )}
                          <button
                            onClick={() => setEmailDoc(doc)}
                            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Envoyer par email"
                          >
                            <Icon name="EnvelopeIcon" size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                            title="Supprimer"
                          >
                            <Icon name="TrashIcon" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Devis émis depuis la caisse ── */}
      <div className="mx-6 mb-6 mt-2 border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="flex items-center gap-2">
            <span className="text-base">📋</span>
            <p className="text-sm font-semibold text-blue-800">Devis émis depuis la caisse</p>
            {!posDevisLoading && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {posDevis.length}
              </span>
            )}
          </div>
          <p className="text-xs text-blue-600">⚠️ Non comptabilisés dans le CA</p>
        </div>

        {posDevisLoading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : posDevis.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            Aucun devis caisse enregistré
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/30 border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Numéro</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Client</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Montant TTC</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Statut</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {posDevis.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{d.numero}</td>
                    <td className="px-4 py-2.5 text-sm text-foreground">{d.client_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm font-semibold text-right">
                      {d.total_ttc != null ? `${Number(d.total_ttc).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                        {d.status === 'en_attente' ? 'En attente' : d.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(d.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && (
        <DocFormModal
          doc={editingDoc}
          allDocs={docs}
          clients={clients}
          onClose={() => { setShowForm(false); setEditingDoc(null); }}
          onSave={handleSave}
        />
      )}
      {previewDoc && (
        <DocPreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onSendEmail={(d) => { setPreviewDoc(null); setEmailDoc(d); }}
        />
      )}
      {emailDoc && (
        <EmailModal doc={emailDoc} onClose={() => setEmailDoc(null)} />
      )}
    </AppLayout>
  );
}
