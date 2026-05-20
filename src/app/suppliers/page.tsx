'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import Icon from '@/components/ui/AppIcon';
import { supplierService, Supplier, SupplierReliability } from '@/lib/services/supplierService';
import SupplierFormModal from './components/SupplierFormModal';

const RELIABILITY_CONFIG: Record<SupplierReliability, { label: string; color: string; dot: string }> = {
  excellent: { label: 'Excellent', color: 'text-emerald-700 bg-emerald-50', dot: 'bg-emerald-500' },
  good:      { label: 'Bon',       color: 'text-blue-700 bg-blue-50',       dot: 'bg-blue-500' },
  average:   { label: 'Moyen',     color: 'text-amber-700 bg-amber-50',     dot: 'bg-amber-500' },
  poor:      { label: 'Faible',    color: 'text-red-700 bg-red-50',         dot: 'bg-red-500' },
  unknown:   { label: 'Inconnu',   color: 'text-gray-600 bg-gray-100',      dot: 'bg-gray-400' },
};

function ReliabilityBadge({ value }: { value: SupplierReliability }) {
  const cfg = RELIABILITY_CONFIG[value] || RELIABILITY_CONFIG.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterReliability, setFilterReliability] = useState('');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supplierService.getAll();
      setSuppliers(data);
    } catch (e: any) {
      setError(e.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = suppliers.filter((s) => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.companyName.toLowerCase().includes(q) || (s.contactName || '').toLowerCase().includes(q) || (s.country || '').toLowerCase().includes(q);
    const matchCountry = !filterCountry || s.country === filterCountry;
    const matchRel = !filterReliability || s.reliability === filterReliability;
    return matchSearch && matchCountry && matchRel;
  });

  const countries = [...new Set(suppliers.map((s) => s.country).filter(Boolean))].sort();

  return (
    <AppLayout>
      <div className="p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-700 text-foreground">Fournisseurs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{suppliers.length} fournisseur{suppliers.length !== 1 ? 's' : ''} actif{suppliers.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Icon name="PlusIcon" size={16} />
            Nouveau fournisseur
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: suppliers.length, icon: 'TruckIcon', color: 'text-primary bg-primary/10' },
            { label: 'Excellents', value: suppliers.filter((s) => s.reliability === 'excellent').length, icon: 'StarIcon', color: 'text-emerald-600 bg-emerald-50' },
            { label: 'Pays', value: countries.length, icon: 'GlobeAltIcon', color: 'text-blue-600 bg-blue-50' },
            { label: 'Récents', value: suppliers.filter((s) => s.lastOrderAt && new Date(s.lastOrderAt) > new Date(Date.now() - 30 * 86400000)).length, icon: 'ClockIcon', color: 'text-amber-600 bg-amber-50' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-border rounded-xl p-4 shadow-card">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.color}`}>
                  <Icon name={stat.icon as any} size={18} />
                </div>
                <div>
                  <p className="text-xl font-700 text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="relative flex-1 min-w-[200px]">
            <Icon name="MagnifyingGlassIcon" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher un fournisseur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Tous les pays</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={filterReliability}
            onChange={(e) => setFilterReliability(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="">Toute fiabilité</option>
            {Object.entries(RELIABILITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
            <Icon name="ExclamationTriangleIcon" size={24} className="text-red-500 mx-auto mb-2" />
            <p className="text-red-700 text-sm">{error}</p>
            <button onClick={load} className="mt-3 text-sm text-primary underline">Réessayer</button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-border rounded-xl p-12 text-center">
            <Icon name="TruckIcon" size={40} className="text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium">Aucun fournisseur trouvé</p>
            <p className="text-muted-foreground text-sm mt-1">Ajoutez votre premier fournisseur pour commencer</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((supplier) => (
              <Link key={supplier.id} href={`/suppliers/${supplier.id}`}>
                <div className="bg-white border border-border rounded-xl p-5 shadow-card hover:shadow-card-hover hover:border-primary/30 transition-all cursor-pointer group">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                      <span className="text-primary font-700 text-base">{supplier.companyName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-600 text-foreground text-sm truncate">{supplier.companyName}</h3>
                      {supplier.contactName && <p className="text-xs text-muted-foreground truncate">{supplier.contactName}</p>}
                    </div>
                    <ReliabilityBadge value={supplier.reliability} />
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon name="GlobeAltIcon" size={13} />
                      <span>{supplier.country} · {supplier.language}</span>
                    </div>
                    {supplier.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon name="EnvelopeIcon" size={13} />
                        <span className="truncate">{supplier.email}</span>
                      </div>
                    )}
                    {supplier.whatsapp && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon name="PhoneIcon" size={13} />
                        <span>{supplier.whatsapp}</span>
                      </div>
                    )}
                  </div>

                  {supplier.categories && supplier.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {supplier.categories.slice(0, 3).map((cat) => (
                        <span key={cat} className="px-2 py-0.5 bg-muted rounded-full text-[11px] text-muted-foreground">{cat}</span>
                      ))}
                      {supplier.categories.length > 3 && (
                        <span className="px-2 py-0.5 bg-muted rounded-full text-[11px] text-muted-foreground">+{supplier.categories.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {supplier.lastOrderAt ? `Dernière commande ${new Date(supplier.lastOrderAt).toLocaleDateString('fr-FR')}` : 'Aucune commande'}
                    </span>
                    <Icon name="ChevronRightIcon" size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <SupplierFormModal
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </AppLayout>
  );
}
