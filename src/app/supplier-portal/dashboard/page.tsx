'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';

// fo_orders order_status — real enum values from public.fo_order_status
type OrderStatus =
  | 'draft' | 'sent' | 'awaiting_validation' | 'modification_requested' | 'validated'
  | 'payment_pending' | 'payment_in_progress' | 'paid' | 'payment_received_by_supplier'
  | 'in_preparation' | 'in_production' | 'ready_to_ship' | 'shipped'
  | 'partially_received' | 'fully_received'
  | 'costs_recorded' | 'stock_integrated' | 'closed' | 'suspended' | 'cancelled';

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  total_real_cost: number;
  order_status: OrderStatus;
  notes: string | null;
}

interface Message {
  id: string;
  created_at: string;
  content: string;
  sender_type: 'admin' | 'supplier';
  is_read: boolean;
}

interface Thread {
  id: string;
  subject: string;
  updated_at: string;
  messages: Message[];
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  awaiting_validation: 'En validation',
  modification_requested: 'Modif. demandée',
  validated: 'Validée',
  payment_pending: 'Paiement en attente',
  payment_in_progress: 'Paiement en cours',
  paid: 'Payée',
  payment_received_by_supplier: 'Paiement reçu',
  in_preparation: 'En préparation',
  in_production: 'En production',
  ready_to_ship: 'Prête à expédier',
  shipped: 'Expédiée',
  partially_received: 'Reçue partiellement',
  fully_received: 'Reçue',
  costs_recorded: 'Coûts enregistrés',
  stock_integrated: 'Stock intégré',
  closed: 'Clôturée',
  suspended: 'Suspendue',
  cancelled: 'Annulée',
};

const STATUS_CLASS: Record<string, string> = {
  draft: 'bg-gray-50 text-gray-600 border-gray-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_validation: 'bg-amber-50 text-amber-700 border-amber-200',
  modification_requested: 'bg-orange-50 text-orange-700 border-orange-200',
  validated: 'bg-teal-50 text-teal-700 border-teal-200',
  payment_pending: 'bg-amber-50 text-amber-700 border-amber-200',
  payment_in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  payment_received_by_supplier: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  in_preparation: 'bg-violet-50 text-violet-700 border-violet-200',
  in_production: 'bg-violet-50 text-violet-700 border-violet-200',
  ready_to_ship: 'bg-teal-50 text-teal-700 border-teal-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  partially_received: 'bg-amber-50 text-amber-700 border-amber-200',
  fully_received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  costs_recorded: 'bg-sky-50 text-sky-700 border-sky-200',
  stock_integrated: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed: 'bg-gray-50 text-gray-600 border-gray-200',
  suspended: 'bg-orange-50 text-orange-700 border-orange-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
};

const ACTIVE_STATUSES: OrderStatus[] = [
  'sent', 'awaiting_validation', 'modification_requested', 'validated',
  'payment_pending', 'payment_in_progress', 'paid', 'payment_received_by_supplier',
  'in_preparation', 'in_production', 'ready_to_ship', 'shipped', 'partially_received',
];

export default function SupplierDashboardPage() {
  const router = useRouter();
  const { supplierUser, loading: authLoading, signOut } = useSupplierAuth();
  const supabase = useRef(createClient()).current;

  const [tab, setTab] = useState<'orders' | 'messages'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !supplierUser) {
      router.replace('/supplier-portal/login');
    }
  }, [authLoading, supplierUser, router]);

  // Uses SECURITY DEFINER RPC to bypass fo_orders RLS for PIN-auth users
  const loadOrders = useCallback(async () => {
    if (!supplierUser) return;
    const { data } = await supabase.rpc('get_supplier_portal_orders', {
      p_supplier_id: supplierUser.supplierId,
    });
    setOrders((data as Order[]) ?? []);
  }, [supabase, supplierUser]);

  // Uses SECURITY DEFINER RPC to bypass thread/message RLS for PIN-auth users
  const loadThreads = useCallback(async () => {
    if (!supplierUser) return;
    const { data } = await supabase.rpc('get_supplier_portal_threads', {
      p_supplier_id: supplierUser.supplierId,
    });
    const loaded = (data as Thread[]) ?? [];
    setThreads(loaded);
    return loaded;
  }, [supabase, supplierUser]);

  useEffect(() => {
    if (!supplierUser) return;
    Promise.all([loadOrders(), loadThreads()]).then(([, loadedThreads]) => {
      if (loadedThreads && loadedThreads.length > 0) {
        setActiveThread(loadedThreads[0]);
      }
      setPageLoading(false);
    });
  }, [supplierUser, loadOrders, loadThreads]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread]);

  // Uses SECURITY DEFINER RPC to mark messages read without Supabase Auth
  const markRead = useCallback(async (thread: Thread) => {
    await supabase.rpc('mark_supplier_thread_read', { p_thread_id: thread.id });
  }, [supabase]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || !activeThread || sending || !supplierUser) return;
    setSending(true);
    try {
      // Uses SECURITY DEFINER RPC to insert message without Supabase Auth
      await supabase.rpc('insert_supplier_message', {
        p_thread_id: activeThread.id,
        p_supplier_id: supplierUser.supplierId,
        p_content: newMsg.trim(),
      });
      setNewMsg('');
      const refreshed = await loadThreads();
      if (refreshed) {
        const updated = refreshed.find((t) => t.id === activeThread.id) ?? null;
        setActiveThread(updated);
      }
    } finally {
      setSending(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    router.replace('/supplier-portal/login');
  };

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.order_status));
  const totalConfirmed = orders
    .filter((o) => o.order_status === 'paid' || o.order_status === 'payment_received_by_supplier')
    .reduce((s, o) => s + o.total_real_cost, 0);
  const unreadTotal = threads.reduce(
    (s, t) => s + t.messages.filter((m) => m.sender_type === 'admin' && !m.is_read).length,
    0,
  );

  if (authLoading || !supplierUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <svg className="w-7 h-7 animate-spin text-emerald-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-none">{supplierUser.supplierName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Portail fournisseur</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="text-xs text-gray-500 hover:text-red-600 transition-colors">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Commandes actives', value: String(activeOrders.length), color: 'text-emerald-700' },
            { label: 'Montant confirmé', value: totalConfirmed.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), color: 'text-blue-700' },
            { label: 'Messages non lus', value: String(unreadTotal), color: unreadTotal > 0 ? 'text-amber-600' : 'text-gray-500' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="flex border-b border-gray-100">
            {(['orders', 'messages'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 ${tab === t ? 'text-emerald-700 border-emerald-600' : 'text-gray-500 border-transparent hover:text-gray-700'}`}
              >
                {t === 'orders' ? `Commandes (${orders.length})` : `Messagerie${unreadTotal > 0 ? ` · ${unreadTotal}` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'orders' && (
            <div className="overflow-x-auto">
              {pageLoading ? (
                <div className="flex justify-center py-16">
                  <svg className="w-6 h-6 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16 text-sm text-gray-400">Aucune commande pour le moment.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['Référence', 'Date', 'Montant', 'Statut', 'Notes'].map((h) => (
                        <th key={h} className="text-left px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-3.5 font-medium text-gray-900">{o.order_number}</td>
                        <td className="px-5 py-3.5 text-gray-500">
                          {new Date(o.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-5 py-3.5 font-medium text-gray-900">
                          {o.total_real_cost.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_CLASS[o.order_status] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
                            {STATUS_LABEL[o.order_status] ?? o.order_status}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-400 text-xs max-w-xs truncate">{o.notes ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'messages' && (
            <div className="flex" style={{ height: 520 }}>
              <aside className="w-64 border-r border-gray-100 overflow-y-auto shrink-0">
                {threads.length === 0 ? (
                  <p className="text-xs text-center text-gray-400 py-12">Aucune conversation.</p>
                ) : (
                  threads.map((thread) => {
                    const unread = thread.messages.filter((m) => m.sender_type === 'admin' && !m.is_read).length;
                    const last = [...thread.messages].sort(
                      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )[0];
                    return (
                      <button
                        key={thread.id}
                        onClick={() => { setActiveThread(thread); markRead(thread); }}
                        className={`w-full text-left px-4 py-3.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeThread?.id === thread.id ? 'bg-emerald-50' : ''}`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className={`text-xs font-semibold truncate ${unread > 0 ? 'text-gray-900' : 'text-gray-600'}`}>{thread.subject}</span>
                          {unread > 0 && (
                            <span className="shrink-0 w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center font-bold">{unread}</span>
                          )}
                        </div>
                        {last && <p className="text-[11px] text-gray-400 truncate">{last.content}</p>}
                        <p className="text-[10px] text-gray-300 mt-1">
                          {new Date(thread.updated_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                        </p>
                      </button>
                    );
                  })
                )}
              </aside>

              <div className="flex-1 flex flex-col overflow-hidden">
                {!activeThread ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Sélectionnez une conversation</div>
                ) : (
                  <>
                    <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60 shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{activeThread.subject}</p>
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
                      {[...activeThread.messages]
                        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((msg) => (
                          <div key={msg.id} className={`flex ${msg.sender_type === 'supplier' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[72%] px-3.5 py-2.5 text-sm leading-relaxed rounded-2xl ${msg.sender_type === 'supplier' ? 'bg-emerald-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'}`}>
                              <p>{msg.content}</p>
                              <p className={`text-[10px] mt-1 ${msg.sender_type === 'supplier' ? 'text-emerald-200' : 'text-gray-400'}`}>
                                {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                      <div ref={messagesEndRef} />
                    </div>
                    <form onSubmit={sendMessage} className="border-t border-gray-100 px-4 py-3 flex items-center gap-2 shrink-0">
                      <input
                        type="text"
                        value={newMsg}
                        onChange={(e) => setNewMsg(e.target.value)}
                        placeholder="Écrire un message…"
                        disabled={sending}
                        className="flex-1 h-9 px-3.5 text-sm rounded-full border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={sending || !newMsg.trim()}
                        className="w-9 h-9 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                        </svg>
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
