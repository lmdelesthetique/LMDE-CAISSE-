'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import type { POSClient } from './POSTerminal';
import { clientService, type Client, getClientDiscount } from '@/lib/services/clientService';
import ClientFormModal from '@/app/clients/components/ClientFormModal';

interface ClientLookupBarProps {
  client: POSClient | null;
  onSelect: (c: POSClient) => void;
  onClear: () => void;
}

async function clientToPOSClient(c: Client): Promise<POSClient> {
  const subscription = await clientService.getSubscription(c.id);
  const discount = getClientDiscount(c, subscription);
  return {
    id: c.id,
    name: c.fullName,
    phone: c.phone ?? '',
    email: c.email ?? null,
    points: c.loyaltyPoints,
    balance: c.storeCredit,
    discount,
    clientType: c.clientType,
    subscriptionStatus: subscription?.status ?? null,
    subscriptionType: subscription?.subscriptionType ?? null,
  };
}

export default function ClientLookupBar({ client, onSelect, onClear }: ClientLookupBarProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = useCallback((val: string) => {
    setSearch(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.length >= 2) {
      setSearching(true);
      setOpen(true);
      debounceRef.current = setTimeout(async () => {
        const r = await clientService.search(val);
        setResults(r);
        setSearching(false);
      }, 300);
    } else {
      setResults([]);
      setOpen(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const selectClient = async (c: Client) => {
    const posClient = await clientToPOSClient(c);
    onSelect(posClient);
    setSearch('');
    setOpen(false);
  };

  const handleNewClientSaved = async (saved: Client) => {
    const posClient = await clientToPOSClient(saved);
    onSelect(posClient);
    setShowNewForm(false);
    setSearch('');
    setOpen(false);
  };

  const CLIENT_TYPE_LABELS: Record<string, string> = {
    particulier: 'Particulier',
    professionnel: 'Pro',
    vip: 'VIP',
    abonne: 'Abonné',
    non_abonne: 'Non abonné',
  };

  if (client) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-blue-50">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-7 h-7 rounded-full bg-blue-200 flex items-center justify-center shrink-0">
            <span className="text-[11px] font-700 text-blue-700">{client.name.charAt(0)}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-600 text-blue-900">{client.name}</p>
              {client.clientType && (
                <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                  {CLIENT_TYPE_LABELS[client.clientType] ?? client.clientType}
                </span>
              )}
              {client.subscriptionStatus === 'active' && (
                <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                  <Icon name="CheckBadgeIcon" size={10} />
                  {client.subscriptionType ?? 'Abonné'}
                </span>
              )}
            </div>
            <p className="text-[10px] text-blue-600">
              {client.points} pts fidélité
              {client.balance > 0 ? ` · Avoir: ${client.balance.toFixed(2)} €` : ''}
              {(client.discount ?? 0) > 0 ? ` · Remise: -${client.discount}%` : ''}
            </p>
          </div>
        </div>
        {(client.discount ?? 0) > 0 && (
          <div className="mx-2 px-2 py-1 bg-rose-100 border border-rose-200 rounded-lg shrink-0">
            <span className="text-xs font-700 text-rose-700">-{client.discount}%</span>
          </div>
        )}
        <button
          onClick={() => window.open(`/clients/${client.id}`, '_blank')}
          className="ml-1 flex items-center gap-1 px-2 py-1 text-xs font-500 text-blue-600 hover:text-blue-800 hover:bg-blue-100 rounded-lg transition-colors shrink-0"
          title="Voir la fiche client"
        >
          <Icon name="UserIcon" size={12} />
          Fiche
        </button>
        <button onClick={onClear} className="text-blue-400 hover:text-blue-700 transition-colors shrink-0">
          <Icon name="XMarkIcon" size={15} />
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="relative border-b border-border">
        <div className="flex items-center px-3 py-2">
          <Icon name="UserIcon" size={15} className="text-muted-foreground mr-2 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Rechercher un client (nom, téléphone)…"
            className="flex-1 text-sm bg-transparent focus:outline-none text-foreground placeholder:text-muted-foreground"
          />
          {searching && <Icon name="ArrowPathIcon" size={13} className="animate-spin text-muted-foreground mr-1" />}
          <button
            onMouseDown={(e) => { e.preventDefault(); setShowNewForm(true); }}
            className="ml-2 text-xs text-primary font-500 hover:underline whitespace-nowrap"
          >
            + Nouveau
          </button>
        </div>

        {open && (
          <div className="absolute top-full left-0 right-0 bg-white border border-border rounded-b-lg shadow-modal z-50 max-h-52 overflow-y-auto">
            {searching ? (
              <div className="px-4 py-3 flex items-center gap-2 text-sm text-muted-foreground">
                <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                Recherche…
              </div>
            ) : results.length > 0 ? (
              results.map((c) => (
                <button
                  key={c.id}
                  onMouseDown={() => selectClient(c)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-[11px] font-700 text-primary">{c.firstName.charAt(0)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-500 text-foreground">{c.fullName}</p>
                      {c.clientType !== 'particulier' && (
                        <span className="text-[10px] font-600 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                          {CLIENT_TYPE_LABELS[c.clientType] ?? c.clientType}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {c.phone ?? c.email ?? '—'} · {c.loyaltyPoints} pts
                      {c.storeCredit > 0 ? ` · Avoir: ${c.storeCredit.toFixed(2)} €` : ''}
                      {c.loyaltyDiscountType ? ` · Remise active` : ''}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Aucun client trouvé —{' '}
                <button
                  onMouseDown={(e) => { e.preventDefault(); setShowNewForm(true); setOpen(false); }}
                  className="text-primary font-500 hover:underline"
                >
                  créer ce client
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showNewForm && (
        <ClientFormModal
          onClose={() => setShowNewForm(false)}
          onSaved={handleNewClientSaved}
        />
      )}
    </>
  );
}