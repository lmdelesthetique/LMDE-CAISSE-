'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { deliveryService, type Delivery, DELIVERY_STATUS_CONFIG } from '@/lib/services/deliveryService';

// ─── Portal header ─────────────────────────────────────────────────────────────

function PortalHeader({ name, onLogout }: { name: string; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-pink-600 text-white sticky top-0 z-50 shadow-md">
      {/* Desktop + mobile bar */}
      <div className="px-4 py-3 flex items-center justify-between">
        {/* Left: back link + brand */}
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/livraisons"
            className="flex items-center gap-1 text-white/80 hover:text-white text-sm font-medium transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            <span className="hidden sm:inline">← Admin</span>
          </a>
          <span className="text-white/40 hidden sm:inline">|</span>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight">🚚 Portail Livreur</p>
          </div>
        </div>

        {/* Desktop right: name + logout */}
        <div className="hidden sm:flex items-center gap-3">
          <span className="text-sm font-medium opacity-90 truncate max-w-[140px]">{name}</span>
          <button
            onClick={onLogout}
            className="bg-white text-pink-600 hover:bg-pink-50 px-3 py-1.5 rounded-lg text-sm font-bold transition-colors"
          >
            Déconnexion
          </button>
        </div>

        {/* Mobile right: name + hamburger */}
        <div className="flex sm:hidden items-center gap-2">
          <span className="text-sm font-medium opacity-90 truncate max-w-[90px]">{name}</span>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="sm:hidden bg-pink-700 border-t border-white/20 py-2">
          <a
            href="/livraisons"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Retour à l'admin
          </a>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors text-left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}

const SESSION_KEY = 'beautypos_driver_session';

interface DriverSession {
  driverId: string;
  name: string;
  role: string;
}

function getSession(): DriverSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

const TODAY = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export default function DriverDashboard() {
  const router = useRouter();
  const [session, setSession] = useState<DriverSession | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const channelRef = useRef<ReturnType<typeof createClient>['channel'] extends (...a: any[]) => infer R ? R : never>(null as any);

  // Auth check
  useEffect(() => {
    const s = getSession();
    if (!s || s.role !== 'driver') { router.replace('/livreur/login'); return; }
    setSession(s);
  }, [router]);

  const loadDeliveries = useCallback(async (empId: string) => {
    try {
      const data = await deliveryService.getForDriver(empId);
      setDeliveries(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Subscribe to real-time changes
  useEffect(() => {
    if (!session) return;
    loadDeliveries(session.driverId);

    const supabase = createClient();
    const channel = supabase
      .channel('driver-deliveries-' + session.driverId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'deliveries', filter: `assigned_to_driver=eq.${session.driverId}` },
        () => loadDeliveries(session.driverId)
      )
      .subscribe();
    channelRef.current = channel;

    return () => { supabase.removeChannel(channel); };
  }, [session, loadDeliveries]);

  const toggleStatus = async () => {
    if (!session) return;
    setTogglingStatus(true);
    const newStatus = online ? 'off' : 'on';
    try {
      await deliveryService.setDriverStatus(session.driverId, newStatus);
      setOnline(!online);
    } catch { /* ignore */ } finally {
      setTogglingStatus(false);
    }
  };

  const handleLogout = () => {
    // Clear all possible session keys
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('livreur_session');
      localStorage.removeItem('livreur_pin');
      sessionStorage.clear();
    } catch { /* ignore */ }
    window.location.href = '/livreur/login';
  };

  const handleStart = async (d: Delivery) => {
    try {
      await deliveryService.startRoute(d.id);
      await loadDeliveries(session!.driverId);
    } catch { /* ignore */ }
  };

  const handleProblem = async (d: Delivery) => {
    if (!confirm('Signaler un problème pour cette livraison ?')) return;
    try {
      await fetch(`/api/livraisons/${d.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'problem' }),
      });
      await loadDeliveries(session!.driverId);
    } catch { /* ignore */ }
  };

  const handleOpenDetail = (d: Delivery) => {
    router.push(`/livreur/livraison/${d.id}`);
  };

  if (!session) return null;

  const todayStr = new Date().toISOString().slice(0, 10);
  const pending   = deliveries.filter((d) => d.status === 'pending' || d.status === 'assigned');
  const enRoute   = deliveries.filter((d) => d.status === 'en_route');
  const delivered = deliveries.filter((d) => d.status === 'delivered' && d.deliveredAt?.startsWith(todayStr));
  const total = deliveries.filter((d) => d.status !== 'cancelled');

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PortalHeader name={session.name} onLogout={handleLogout} />

      {/* Sub-header: greeting + online toggle */}
      <div className="bg-white border-b border-gray-200 px-4">
        <div className="flex items-center justify-between py-3">
          <div>
            <p className="text-xs text-gray-500 capitalize">{TODAY}</p>
            <h1 className="text-lg font-bold text-gray-900">Bonjour, {session.name.split(' ')[0]} 👋</h1>
          </div>
          <button
            onClick={toggleStatus}
            disabled={togglingStatus}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition-all border-2',
              online ? 'bg-green-50 border-green-400 text-green-700' : 'bg-gray-100 border-gray-300 text-gray-500',
            ].join(' ')}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            {online ? 'En service' : 'Hors service'}
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'En attente',       value: pending.length,   emoji: '🟡', bg: 'bg-yellow-50 border-yellow-200' },
            { label: 'En route',         value: enRoute.length,   emoji: '🔵', bg: 'bg-blue-50 border-blue-200'   },
            { label: 'Livrées auj.',     value: delivered.length, emoji: '✅', bg: 'bg-green-50 border-green-200' },
            { label: 'Total tournée',    value: total.length,     emoji: '📦', bg: 'bg-gray-50 border-gray-200'   },
          ].map((kpi) => (
            <div key={kpi.label} className={`rounded-2xl border p-4 ${kpi.bg}`}>
              <p className="text-3xl font-black text-gray-900">{kpi.value}</p>
              <p className="text-xs font-semibold text-gray-600 mt-1">{kpi.emoji} {kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Delivery list */}
        <h2 className="text-base font-bold text-gray-800 mt-2">Mes livraisons</h2>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : total.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-gray-600 font-semibold">Aucune livraison assignée</p>
            <p className="text-sm text-gray-400 mt-1">Vérifiez plus tard</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* En route first, then pending, then delivered */}
            {[...enRoute, ...pending, ...delivered].map((d) => (
              <DeliveryCard key={d.id} delivery={d} onStart={handleStart} onOpen={handleOpenDetail} onProblem={handleProblem} />
            ))}
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around z-30">
        <button className="flex flex-col items-center gap-1 text-orange-500">
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
          <span className="text-xs font-semibold">Dashboard</span>
        </button>
        <button className="flex flex-col items-center gap-1 text-gray-400">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
          <span className="text-xs font-semibold">Livraisons</span>
        </button>
        <button onClick={handleLogout} className="flex flex-col items-center gap-1 text-gray-400 hover:text-red-500 transition-colors">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
          <span className="text-xs font-semibold">Déco.</span>
        </button>
      </nav>
    </div>
  );
}

// ─── Delivery Card ─────────────────────────────────────────────────────────────

function DeliveryCard({
  delivery: d,
  onStart,
  onOpen,
  onProblem,
}: {
  delivery: Delivery;
  onStart: (d: Delivery) => void;
  onOpen: (d: Delivery) => void;
  onProblem: (d: Delivery) => void;
}) {
  const cfg = DELIVERY_STATUS_CONFIG[d.status];
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(d.deliveryAddress)}`;
  const products = d.products ?? [];

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Status bar */}
      <div className={`px-4 py-2 flex items-center justify-between ${cfg.bg} border-b`}>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
          <span className={`text-xs font-bold ${cfg.color}`}>{cfg.label}</span>
        </div>
        {d.shopifyOrderNumber && (
          <span className="text-xs text-gray-500 font-mono">#{d.shopifyOrderNumber}</span>
        )}
      </div>

      <div className="p-4 space-y-3">
        {/* Client */}
        <div>
          <p className="text-xl font-black text-gray-900 leading-tight">{d.clientName}</p>
          {d.clientPhone && (
            <a href={`tel:${d.clientPhone}`} className="text-sm text-blue-600 font-semibold">
              📞 {d.clientPhone}
            </a>
          )}
        </div>

        {/* Address */}
        <div className="flex items-start gap-2">
          <span className="text-lg leading-tight">📍</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 leading-snug">{d.deliveryAddress}</p>
          </div>
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-3 py-1.5 bg-blue-500 text-white text-xs font-bold rounded-lg hover:bg-blue-600 transition-colors"
          >
            Maps
          </a>
        </div>

        {/* Products preview */}
        {products.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {products.slice(0, 3).map((p, i) => (
              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-lg font-medium">
                {p.qty}× {p.name}
              </span>
            ))}
            {products.length > 3 && (
              <span className="text-xs text-gray-400 px-2 py-1">+{products.length - 3} articles</span>
            )}
          </div>
        )}

        {/* Amount */}
        {d.totalAmount != null && (
          <p className="text-sm font-bold text-gray-800">💰 {d.totalAmount.toFixed(2)} €</p>
        )}

        {/* Special notes */}
        {d.deliveryNotes && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-800">
            ⚠️ {d.deliveryNotes}
          </div>
        )}

        {/* Actions */}
        <div className="pt-1">
          {(d.status === 'pending' || d.status === 'assigned') && (
            <div className="flex gap-2">
              <button
                onClick={() => onStart(d)}
                className="flex-1 py-3.5 bg-orange-500 text-white font-black text-base rounded-xl hover:bg-orange-600 active:scale-95 transition-all"
              >
                🚀 Démarrer
              </button>
              <button
                onClick={() => onProblem(d)}
                className="px-4 py-3.5 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 active:scale-95 transition-all text-lg"
                title="Signaler un problème"
              >
                ⚠️
              </button>
            </div>
          )}
          {d.status === 'en_route' && (
            <div className="flex gap-2">
              <button
                onClick={() => onOpen(d)}
                className="flex-1 py-3.5 bg-green-500 text-white font-black text-base rounded-xl hover:bg-green-600 active:scale-95 transition-all"
              >
                ✅ Marquer livré
              </button>
              <button
                onClick={() => onProblem(d)}
                className="px-4 py-3.5 bg-red-100 text-red-600 font-bold rounded-xl hover:bg-red-200 active:scale-95 transition-all text-lg"
                title="Signaler un problème"
              >
                ⚠️
              </button>
            </div>
          )}
          {d.status === 'delivered' && (
            <div className="w-full py-3.5 bg-green-100 text-green-700 font-black text-base rounded-xl text-center">
              ✅ Livré
            </div>
          )}
          {d.status === 'problem' && (
            <div className="w-full py-3.5 bg-red-100 text-red-700 font-black text-base rounded-xl text-center">
              ⚠️ Problème signalé
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
