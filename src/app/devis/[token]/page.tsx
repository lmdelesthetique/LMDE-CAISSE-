'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';

interface Item {
  id: string;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string | null;
  isBonus: boolean;
}

interface CatalogProduct {
  id: string;
  name: string;
  ref: string;
  sell_price_ttc: number;
  image_url: string | null;
  stock: number;
}

interface DevisData {
  id: string;
  numero: string;
  items: any[];
  discount_pct: number;
  credit: number;
  total_ttc: number;
  client_pays: number;
  free_shipping: boolean;
  statut: string;
  client_response: string | null;
  notes: string | null;
  client: { first_name: string; last_name: string } | null;
}

function mapItems(raw: any[]): Item[] {
  return (raw ?? []).map((i: any) => ({
    id: i.id || i.productId || String(Math.random()),
    name: i.name || i.label || 'Article',
    price: Number(i.price ?? i.sell_price_ttc ?? i.sellPrice ?? 0),
    qty: Number(i.qty) || 1,
    imageUrl: i.imageUrl || i.image_url || null,
    isBonus: Boolean(i.isBonus),
  }));
}

export default function DevisClientPage() {
  const params = useParams();
  const token = params?.token as string;

  const [devis, setDevis] = useState<DevisData | null>(null);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [showCatalog, setShowCatalog] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/devis/by-token/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setErr(data.error); return; }
        setDevis(data.devis);
        setCatalog(data.products ?? []);
        setItems(mapItems(data.devis.items ?? []));
        if (data.devis.client_response) setSubmitted(true);
      })
      .catch(() => setErr('Impossible de charger le devis.'))
      .finally(() => setLoading(false));
  }, [token]);

  const discountPct = devis?.discount_pct ?? 0;
  const credit = devis?.credit ?? 0;
  const rawTotal = items.reduce((s, i) => s + (i.isBonus ? 0 : i.price * i.qty), 0);
  const totalAfterDiscount = rawTotal * (1 - discountPct / 100);
  const clientPays = Math.max(0, totalAfterDiscount - credit);

  const changeQty = useCallback((id: string, delta: number) => {
    setItems(prev => {
      const updated = prev.map(i => i.id === id ? { ...i, qty: Math.max(0, i.qty + delta) } : i);
      return updated.filter(i => i.qty > 0);
    });
  }, []);

  const addFromCatalog = useCallback((p: CatalogProduct) => {
    setItems(prev => {
      const exists = prev.find(i => i.id === p.id);
      if (exists) return prev.map(i => i.id === p.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { id: p.id, name: p.name, price: p.sell_price_ttc, qty: 1, imageUrl: p.image_url, isBonus: false }];
    });
    setSearchQ('');
    setShowCatalog(false);
  }, []);

  const submit = async (type: 'accepted' | 'modified') => {
    setSubmitting(true);
    try {
      const apiItems = items.map(i => ({
        id: i.id, name: i.name, price: i.price, qty: i.qty, imageUrl: i.imageUrl, isBonus: i.isBonus,
      }));
      const res = await fetch(`/api/devis/by-token/${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: type, items: apiItems }),
      });
      if (!res.ok) { const j = await res.json(); alert(j.error ?? 'Erreur'); return; }
      setSubmitted(true);
    } catch { alert('Erreur réseau, veuillez réessayer.'); }
    finally { setSubmitting(false); }
  };

  // Detect if items changed vs original
  const originalIds = (devis?.items ?? []).map((i: any) => `${i.id}:${i.qty}`).join(',');
  const currentIds = items.map(i => `${i.id}:${i.qty}`).join(',');
  const hasChanges = originalIds !== currentIds;

  const filteredCatalog = searchQ.length >= 2
    ? catalog.filter(p => p.name.toLowerCase().includes(searchQ.toLowerCase()) || p.ref.toLowerCase().includes(searchQ.toLowerCase()))
    : catalog.slice(0, 16);

  if (loading) return (
    <div className="min-h-screen bg-[#FDF8F0] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-[#B8960C] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Chargement du devis…</p>
      </div>
    </div>
  );

  if (err) return (
    <div className="min-h-screen bg-[#FDF8F0] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">😕</div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">Devis introuvable</h1>
        <p className="text-sm text-gray-500">{err}</p>
        <p className="text-xs text-gray-400 mt-3">Vérifiez le lien ou contactez-nous.</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div className="min-h-screen bg-[#FDF8F0] flex items-center justify-center p-6">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
          <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Merci !</h1>
        <p className="text-gray-600 mb-1">Nous avons bien reçu votre réponse.</p>
        <p className="text-sm text-gray-400">L&apos;équipe Le Monde de l&apos;Esthétique vous contactera très prochainement. 💅</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDF8F0]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Le Monde de l&apos;Esthétique</p>
            <h1 className="text-base font-bold text-gray-900">
              Devis {devis?.numero}
            </h1>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Bonjour,</p>
            <p className="text-sm font-semibold text-gray-800">
              {devis?.client?.first_name} {devis?.client?.last_name}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-5 pb-48">
        {/* Intro */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
          <p className="text-sm text-amber-800">
            Voici votre devis personnalisé. Vous pouvez <strong>retirer des produits</strong> ou en <strong>ajouter depuis notre catalogue</strong>, puis valider directement depuis cette page.
          </p>
        </div>

        {/* Notes */}
        {devis?.notes && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Note de l&apos;équipe</p>
            <p className="text-sm text-gray-700">{devis.notes}</p>
          </div>
        )}

        {/* Items */}
        <div className="space-y-3 mb-5">
          {items.map(item => (
            <div key={item.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex gap-3 items-center">
              {item.imageUrl ? (
                <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-gray-50">
                  <Image src={item.imageUrl} alt={item.name} width={56} height={56} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="w-14 h-14 rounded-xl bg-gray-100 flex-shrink-0 flex items-center justify-center text-2xl">💅</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{item.name}</p>
                {item.isBonus ? (
                  <p className="text-xs text-emerald-600 font-medium mt-0.5">✨ Offert</p>
                ) : (
                  <p className="text-sm text-[#B8960C] font-bold mt-0.5">{(item.price * item.qty).toFixed(2)} €</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => changeQty(item.id, -1)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-red-100 hover:text-red-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                </button>
                <span className="text-sm font-bold text-gray-800 w-5 text-center">{item.qty}</span>
                <button
                  onClick={() => changeQty(item.id, +1)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-green-100 hover:text-green-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add product button */}
        <button
          onClick={() => setShowCatalog(!showCatalog)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-[#B8960C] text-[#B8960C] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-amber-50 transition-colors mb-5"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Ajouter un produit depuis le catalogue
        </button>

        {/* Catalog panel */}
        {showCatalog && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-5">
            <input
              type="text"
              placeholder="Rechercher un produit…"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#B8960C] mb-3"
            />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun produit trouvé</p>
              ) : filteredCatalog.map(p => (
                <button
                  key={p.id}
                  onClick={() => addFromCatalog(p)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-amber-50 transition-colors text-left"
                >
                  {p.image_url ? (
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-gray-50">
                      <Image src={p.image_url} alt={p.name} width={40} height={40} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-lg">💅</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.ref}</p>
                  </div>
                  <span className="text-sm font-bold text-[#B8960C] flex-shrink-0">{p.sell_price_ttc.toFixed(2)} €</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Sous-total</span>
              <span>{rawTotal.toFixed(2)} €</span>
            </div>
            {discountPct > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Remise ({discountPct}%)</span>
                <span>-{(rawTotal * discountPct / 100).toFixed(2)} €</span>
              </div>
            )}
            {credit > 0 && (
              <div className="flex justify-between text-emerald-600">
                <span>Budget Pro / Avoir</span>
                <span>-{credit.toFixed(2)} €</span>
              </div>
            )}
            <div className="flex justify-between text-gray-600">
              <span>Livraison</span>
              <span>{devis?.free_shipping ? 'Gratuite' : 'À définir'}</span>
            </div>
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
              <span>Vous payez</span>
              <span className="text-lg text-[#B8960C]">{clientPays.toFixed(2)} €</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTAs — fixed */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-bottom">
        <div className="max-w-lg mx-auto space-y-3">
          {items.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-2">Ajoutez au moins un produit avant de valider.</p>
          ) : (
            <>
              {!hasChanges ? (
                <button
                  onClick={() => submit('accepted')}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Accepter le devis
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={() => submit('modified')}
                  disabled={submitting}
                  className="w-full py-4 rounded-2xl bg-[#B8960C] text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-[#9B7A08] transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      Valider mes modifications ({clientPays.toFixed(2)} €)
                    </>
                  )}
                </button>
              )}
              {hasChanges && (
                <button
                  onClick={() => submit('accepted')}
                  disabled={submitting}
                  className="w-full py-3 rounded-2xl border border-emerald-300 text-emerald-700 font-semibold text-sm hover:bg-emerald-50 transition-colors"
                >
                  Accepter le devis original sans modification
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
