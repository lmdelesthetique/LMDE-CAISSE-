'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';
import { exportPurchaseOrderPDF } from '@/lib/utils/purchaseOrderPDF';
import type { FoOrder, FoOrderLine } from '@/lib/services/supplierOrderService';

type OrderStatus =
  | 'draft' | 'sent' | 'awaiting_validation' | 'modification_requested' | 'validated'
  | 'payment_pending' | 'payment_in_progress' | 'paid' | 'payment_received_by_supplier'
  | 'in_preparation' | 'in_production' | 'ready_to_ship' | 'shipped'
  | 'partially_received' | 'fully_received'
  | 'costs_recorded' | 'stock_integrated' | 'closed' | 'suspended' | 'cancelled';

type SupplierResponse = 'pending' | 'accepted' | 'refused';

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  total_real_cost: number;
  order_status: OrderStatus;
  notes: string | null;
  supplier_response: SupplierResponse;
  supplier_comment: string | null;
  payment_status: string | null;
  payment_amount: number | null;
  subtotal: number;
  transport_cost: number;
  customs_cost: number;
}

interface OrderLine {
  id: string;
  product_id: string | null;
  product_name: string;
  product_ref: string | null;
  product_image_url: string | null;
  variant: string | null;
  color: string | null;
  qty_ordered: number;
  qty_received: number;
  unit_price: number;
  line_total: number;
  note: string | null;
  confirmed_unit_price?: number | null;
}

interface ChatMessage {
  id: string;
  created_at: string;
  content: string;
  sender_type: 'admin' | 'supplier';
  is_read: boolean;
  order_id: string | null;
  order_number: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'En validation',
  modification_requested: 'Modif. demandée', validated: 'Validée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée', payment_received_by_supplier: 'Paiement reçu',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue',
  costs_recorded: 'Coûts enregistrés', stock_integrated: 'Stock intégré',
  closed: 'Clôturée', suspended: 'Suspendue', cancelled: 'Annulée',
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

const PAYMENT_LABEL: Record<string, string> = {
  pending: 'En attente', in_progress: 'En cours', paid: 'Payé',
  received_by_supplier: 'Paiement reçu', partial: 'Partiel',
  balance_due: 'Solde dû', partially_refunded: 'Part. remboursé', fully_refunded: 'Remboursé',
};

const PAYMENT_CLASS: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700', in_progress: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700', received_by_supplier: 'bg-emerald-50 text-emerald-700',
  partial: 'bg-orange-50 text-orange-700', balance_due: 'bg-red-50 text-red-700',
  partially_refunded: 'bg-sky-50 text-sky-700', fully_refunded: 'bg-emerald-50 text-emerald-700',
};

const ACTIVE_STATUSES: OrderStatus[] = [
  'sent', 'awaiting_validation', 'modification_requested', 'validated',
  'payment_pending', 'payment_in_progress', 'paid', 'payment_received_by_supplier',
  'in_preparation', 'in_production', 'ready_to_ship', 'shipped', 'partially_received',
];

function Spinner({ size = 5 }: { size?: number }) {
  return (
    <svg className={`w-${size} h-${size} animate-spin text-emerald-500`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function SupplierDashboardPage() {
  const router = useRouter();
  const { supplierUser, loading: authLoading, signOut } = useSupplierAuth();
  const supabase = useRef(createClient()).current;

  const [tab, setTab] = useState<'orders' | 'messages'>('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Order expand / line loading
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, OrderLine[]>>({});
  const [linesLoading, setLinesLoading] = useState(false);

  // Respond modal
  const [respondModal, setRespondModal] = useState<{ order: Order; response: 'accepted' | 'refused' } | null>(null);
  const [respondComment, setRespondComment] = useState('');
  const [responding, setResponding] = useState(false);

  // Out-of-stock report
  const [reportingLine, setReportingLine] = useState<string | null>(null);

  // Price confirmation (step 3)
  // priceInputs[orderId][lineId] = 'CONFIRMED' | number-string
  const [priceInputs, setPriceInputs] = useState<Record<string, Record<string, string>>>({});
  const [confirmingPrices, setConfirmingPrices] = useState<string | null>(null);
  const [priceConfirmError, setPriceConfirmError] = useState<string | null>(null);
  const [downloadingPDFId, setDownloadingPDFId] = useState<string | null>(null);

  // Messaging
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !supplierUser) router.replace('/supplier-portal/login');
  }, [authLoading, supplierUser, router]);

  const loadOrders = useCallback(async () => {
    if (!supplierUser) return;
    const { data } = await supabase.rpc('get_supplier_portal_orders', {
      p_supplier_id: supplierUser.supplierId,
    });
    setOrders((data as Order[]) ?? []);
  }, [supabase, supplierUser]);

  const loadMessages = useCallback(async () => {
    if (!supplierUser) return;
    setMessagesLoading(true);
    const { data } = await supabase.rpc('get_all_supplier_messages', {
      p_supplier_id: supplierUser.supplierId,
    });
    setMessages((data as ChatMessage[]) ?? []);
    setMessagesLoading(false);
    // Mark admin messages as read
    await supabase.rpc('mark_all_supplier_messages_read', {
      p_supplier_id: supplierUser.supplierId,
    });
  }, [supabase, supplierUser]);

  useEffect(() => {
    if (!supplierUser) return;
    Promise.all([loadOrders(), loadMessages()]).then(() => setPageLoading(false));
  }, [supplierUser, loadOrders, loadMessages]);

  // Realtime subscription on supplier_messages
  useEffect(() => {
    if (!supplierUser) return;
    const channel = supabase
      .channel(`portal_msgs_${supplierUser.supplierId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'supplier_messages',
        filter: `supplier_id=eq.${supplierUser.supplierId}`,
      }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, supplierUser, loadMessages]);

  // Realtime subscription on fo_orders (to see admin status changes)
  useEffect(() => {
    if (!supplierUser) return;
    const channel = supabase
      .channel(`portal_orders_${supplierUser.supplierId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'fo_orders',
      }, () => loadOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, supplierUser, loadOrders]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, tab]);

  const toggleExpand = async (orderId: string) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (!orderLines[orderId]) {
      setLinesLoading(true);
      const [{ data }, confirmedRes] = await Promise.all([
        supabase.rpc('get_supplier_portal_order_lines', {
          p_order_id: orderId,
          p_supplier_id: supplierUser!.supplierId,
        }),
        fetch(`/api/fo-orders/${orderId}/confirm-prices?supplierId=${encodeURIComponent(supplierUser!.supplierId)}`),
      ]);
      const confirmedMap: Record<string, number | null> = confirmedRes.ok ? await confirmedRes.json() : {};
      const linesWithConfirmed = ((data as OrderLine[]) ?? []).map((l) => ({
        ...l,
        confirmed_unit_price: confirmedMap[l.id] ?? null,
      }));
      setOrderLines((prev) => ({ ...prev, [orderId]: linesWithConfirmed }));
      // Init price inputs from already-confirmed values
      const inputs: Record<string, string> = {};
      linesWithConfirmed.forEach((l) => {
        if (l.confirmed_unit_price != null) {
          inputs[l.id] = String(l.confirmed_unit_price);
        }
      });
      if (Object.keys(inputs).length > 0) {
        setPriceInputs((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] ?? {}), ...inputs } }));
      }
      setLinesLoading(false);
    }
  };

  const handleRespond = async () => {
    if (!respondModal || !supplierUser) return;
    setResponding(true);
    await supabase.rpc('supplier_respond_to_order', {
      p_order_id: respondModal.order.id,
      p_supplier_id: supplierUser.supplierId,
      p_response: respondModal.response,
      p_comment: respondComment || null,
    });
    setRespondModal(null);
    setRespondComment('');
    setResponding(false);
    await loadOrders();
  };

  const handleDownloadPDF = async (order: Order, lines: OrderLine[]) => {
    setDownloadingPDFId(order.id);
    try {
      // Map portal types to FoOrder/FoOrderLine for PDF utility
      const foOrder: FoOrder = {
        id: order.id,
        orderNumber: order.order_number,
        supplierName: supplierUser?.supplierName,
        orderStatus: order.order_status as any,
        currency: 'EUR',
        exchangeRate: 1,
        subtotal: order.subtotal,
        transportCost: order.transport_cost,
        customsCost: order.customs_cost,
        vatImport: 0, freightForwarderCost: 0, bankFees: 0,
        exchangeFees: 0, localDelivery: 0, otherCosts: 0,
        totalRealCost: order.total_real_cost,
        costMethod: 'by_value',
        costsValidated: false,
        stockIntegrated: false,
        stockUpdated: false,
        paymentStatus: (order.payment_status as any) ?? 'pending',
        paymentAmount: order.payment_amount ?? undefined,
        balanceDue: 0,
        supplierValidated: false,
        createdAt: order.created_at,
        updatedAt: order.created_at,
      };
      const foLines: FoOrderLine[] = lines.map((l) => ({
        id: l.id,
        orderId: order.id,
        productId: l.product_id ?? undefined,
        productName: l.product_name,
        productRef: l.product_ref ?? undefined,
        productImageUrl: l.product_image_url ?? undefined,
        variant: l.variant ?? undefined,
        color: l.color ?? undefined,
        qtyOrdered: l.qty_ordered,
        qtyReceived: l.qty_received,
        unitPrice: l.unit_price,
        lineTotal: l.line_total,
        unitTransport: 0, unitCustoms: 0, unitVatImport: 0,
        unitFreight: 0, unitOther: 0, unitRealCost: 0,
        salePrice: 0, grossMargin: 0, marginRate: 0,
        previousCost: 0, qtyMissing: 0, qtyDamaged: 0,
        weightKg: 0, volumeM3: 0, customCostShare: 0,
        confirmedUnitPrice: l.confirmed_unit_price ?? undefined,
      }));
      await exportPurchaseOrderPDF(foOrder, foLines);
    } catch (e) {
      console.error('[PDF download]', e);
    } finally {
      setDownloadingPDFId(null);
    }
  };

  const handleConfirmPrices = async (orderId: string, lines: OrderLine[]) => {
    if (!supplierUser) return;
    setConfirmingPrices(orderId);
    setPriceConfirmError(null);
    try {
      const inputs = priceInputs[orderId] ?? {};
      const lineConfirmations = lines.map((l) => {
        const raw = inputs[l.id];
        const price = raw === 'CONFIRMED' ? Number(l.unit_price) : Number(raw);
        return { lineId: l.id, confirmedPrice: price };
      });
      const res = await fetch(`/api/fo-orders/${orderId}/confirm-prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: supplierUser.supplierId, lineConfirmations }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPriceConfirmError(err.error || 'Erreur lors de l\'envoi');
        return;
      }
      // Refresh orders
      await loadOrders();
      setExpandedId(null);
    } catch {
      setPriceConfirmError('Erreur réseau');
    } finally {
      setConfirmingPrices(null);
    }
  };

  const handleReportOutOfStock = async (orderId: string, orderNumber: string, productName: string) => {
    if (!supplierUser || reportingLine) return;
    setReportingLine(orderId + productName);
    const { error } = await supabase.rpc('send_supplier_portal_message', {
      p_supplier_id: supplierUser.supplierId,
      p_content: `⚠️ Rupture de stock signalée — Commande ${orderNumber} : "${productName}" est actuellement hors stock.`,
      p_order_id: orderId,
    });
    if (error) {
      console.error('[handleReportOutOfStock] RPC error:', error.message);
    } else {
      await loadMessages();
    }
    setReportingLine(null);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMsg.trim() || sending || !supplierUser) return;
    setSending(true);
    const { error } = await supabase.rpc('send_supplier_portal_message', {
      p_supplier_id: supplierUser.supplierId,
      p_content: newMsg.trim(),
    });
    if (!error) {
      setNewMsg('');
      await loadMessages();
    } else {
      console.error('[sendMessage] RPC error:', error.message);
    }
    setSending(false);
  };

  const handleSignOut = () => { signOut(); router.replace('/supplier-portal/login'); };

  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.includes(o.order_status));
  const totalPaid = orders
    .filter((o) => o.order_status === 'paid' || o.order_status === 'payment_received_by_supplier')
    .reduce((s, o) => s + Number(o.total_real_cost), 0);
  const unreadCount = messages.filter((m) => m.sender_type === 'admin' && !m.is_read).length;
  const pendingResponses = orders.filter((o) => o.supplier_response === 'pending' && ACTIVE_STATUSES.includes(o.order_status)).length;

  if (authLoading || !supplierUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Spinner size={7} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 leading-none">{supplierUser.supplierName}</p>
              <p className="text-xs text-gray-400 mt-0.5">Portail fournisseur</p>
            </div>
          </div>
          <button onClick={handleSignOut} className="text-xs text-gray-400 hover:text-red-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-red-50">
            Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-4">

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Commandes actives', value: String(activeOrders.length), sub: 'en cours', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-100' },
            { label: 'En attente de réponse', value: String(pendingResponses), sub: 'à traiter', color: pendingResponses > 0 ? 'text-amber-700' : 'text-gray-500', bg: pendingResponses > 0 ? 'bg-amber-50' : 'bg-gray-50', border: pendingResponses > 0 ? 'border-amber-100' : 'border-gray-100' },
            { label: 'Montant payé', value: totalPaid.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), sub: 'confirmé', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-100' },
            { label: 'Messages non lus', value: String(unreadCount), sub: 'de l\'admin', color: unreadCount > 0 ? 'text-red-700' : 'text-gray-500', bg: unreadCount > 0 ? 'bg-red-50' : 'bg-gray-50', border: unreadCount > 0 ? 'border-red-100' : 'border-gray-100' },
          ].map((s) => (
            <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-600 font-medium mt-0.5">{s.label}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
            </div>
          ))}
        </div>

        {/* Alert: orders needing response */}
        {pendingResponses > 0 && (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">
                {pendingResponses} commande{pendingResponses > 1 ? 's' : ''} attend{pendingResponses > 1 ? 'ent' : ''} votre réponse
              </p>
              <p className="text-xs text-amber-600 mt-0.5">Veuillez accepter ou refuser chaque commande pour confirmer sa prise en charge.</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="flex border-b border-gray-100">
            {(['orders', 'messages'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-5 py-3 text-sm font-semibold transition-colors border-b-2 ${tab === t ? 'text-emerald-700 border-emerald-600' : 'text-gray-400 border-transparent hover:text-gray-600'}`}
              >
                {t === 'orders' ? `Commandes (${orders.length})` : 'Messagerie'}
                {t === 'messages' && unreadCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold">{unreadCount}</span>
                )}
              </button>
            ))}
          </div>

          {/* ─── ORDERS TAB ─── */}
          {tab === 'orders' && (
            <div className="p-4 space-y-3">
              {pageLoading ? (
                <div className="flex justify-center py-12"><Spinner /></div>
              ) : orders.length === 0 ? (
                <div className="text-center py-16">
                  <svg className="w-10 h-10 text-gray-200 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586" />
                  </svg>
                  <p className="text-sm text-gray-400">Aucune commande pour le moment.</p>
                </div>
              ) : (
                orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    lines={orderLines[order.id] ?? null}
                    isExpanded={expandedId === order.id}
                    linesLoading={linesLoading && expandedId === order.id}
                    reportingLine={reportingLine}
                    priceInputs={priceInputs[order.id] ?? {}}
                    confirmingPrices={confirmingPrices === order.id}
                    priceConfirmError={confirmingPrices === null ? priceConfirmError : null}
                    onToggle={() => toggleExpand(order.id)}
                    onAccept={() => { setRespondComment(''); setRespondModal({ order, response: 'accepted' }); }}
                    onRefuse={() => { setRespondComment(''); setRespondModal({ order, response: 'refused' }); }}
                    onReportOutOfStock={(productName) => handleReportOutOfStock(order.id, order.order_number, productName)}
                    onPriceInput={(lineId, value) => setPriceInputs((prev) => ({ ...prev, [order.id]: { ...(prev[order.id] ?? {}), [lineId]: value } }))}
                    onConfirmPrices={(lines) => handleConfirmPrices(order.id, lines)}
                    onDownloadPDF={() => handleDownloadPDF(order, orderLines[order.id] ?? [])}
                    downloadingPDF={downloadingPDFId === order.id}
                  />
                ))
              )}
            </div>
          )}

          {/* ─── MESSAGES TAB ─── */}
          {tab === 'messages' && (
            <div className="flex flex-col" style={{ height: 520 }}>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex justify-center py-12"><Spinner /></div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                    </svg>
                    <p className="text-sm text-gray-400 font-medium">Aucun message pour l'instant</p>
                    <p className="text-xs text-gray-300 mt-1">Commencez la conversation avec votre admin</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.sender_type === 'supplier' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] flex flex-col gap-0.5 ${msg.sender_type === 'supplier' ? 'items-end' : 'items-start'}`}>
                        {msg.order_number && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                            📦 Commande {msg.order_number}
                          </span>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                          msg.sender_type === 'supplier'
                            ? 'bg-emerald-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        </div>
                        <span className="text-[10px] text-gray-400 px-1">
                          {msg.sender_type === 'admin' && <span className="font-medium text-gray-500">Admin · </span>}
                          {new Date(msg.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          {!msg.is_read && msg.sender_type === 'admin' && (
                            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                          )}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={sendMessage} className="border-t border-gray-100 px-4 py-3 flex items-end gap-2 shrink-0">
                <textarea
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e); } }}
                  placeholder="Écrire un message… (Entrée pour envoyer, Shift+Entrée pour saut de ligne)"
                  rows={2}
                  disabled={sending}
                  className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 disabled:opacity-50 resize-none"
                />
                <button
                  type="submit"
                  disabled={sending || !newMsg.trim()}
                  className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 flex items-center justify-center transition-colors shrink-0"
                >
                  {sending ? (
                    <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* Respond Modal */}
      {respondModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className={`px-6 py-4 rounded-t-2xl border-b ${respondModal.response === 'accepted' ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${respondModal.response === 'accepted' ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {respondModal.response === 'accepted' ? (
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div>
                  <h3 className={`font-bold text-base ${respondModal.response === 'accepted' ? 'text-emerald-800' : 'text-red-800'}`}>
                    {respondModal.response === 'accepted' ? 'Accepter la commande' : 'Refuser la commande'}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">Commande {respondModal.order.order_number}</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Commentaire {respondModal.response === 'refused' ? '(obligatoire — indiquez le motif)' : '(optionnel)'}
                </label>
                <textarea
                  value={respondComment}
                  onChange={(e) => setRespondComment(e.target.value)}
                  placeholder={respondModal.response === 'refused'
                    ? 'Ex : Stock insuffisant, délai de production trop court, produit discontinué…'
                    : 'Ex : Commande confirmée, expédition prévue le…'}
                  rows={3}
                  className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setRespondModal(null)}
                  className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={handleRespond}
                  disabled={responding || (respondModal.response === 'refused' && !respondComment.trim())}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    respondModal.response === 'accepted' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {responding ? <Spinner size={4} /> : null}
                  {respondModal.response === 'accepted' ? 'Confirmer l\'acceptation' : 'Confirmer le refus'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── OrderCard component ────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  lines: OrderLine[] | null;
  isExpanded: boolean;
  linesLoading: boolean;
  reportingLine: string | null;
  priceInputs: Record<string, string>;
  confirmingPrices: boolean;
  priceConfirmError: string | null;
  onToggle: () => void;
  onAccept: () => void;
  onRefuse: () => void;
  onReportOutOfStock: (productName: string) => void;
  onPriceInput: (lineId: string, value: string) => void;
  onConfirmPrices: (lines: OrderLine[]) => void;
  onDownloadPDF: () => void;
  downloadingPDF: boolean;
}

function OrderCard({
  order, lines, isExpanded, linesLoading, reportingLine,
  priceInputs, confirmingPrices, priceConfirmError,
  onToggle, onAccept, onRefuse, onReportOutOfStock, onPriceInput, onConfirmPrices,
  onDownloadPDF, downloadingPDF,
}: OrderCardProps) {
  const canRespond = order.supplier_response === 'pending';
  const isActive = ['sent', 'awaiting_validation', 'validated', 'modification_requested'].includes(order.order_status);
  const showPriceConfirmation = order.supplier_response === 'accepted' && order.order_status === 'sent';

  // How many lines have a valid price input
  const confirmedCount = lines
    ? lines.filter((l) => {
        const val = priceInputs[l.id];
        if (val === 'CONFIRMED') return true;
        const n = Number(val);
        return !isNaN(n) && n > 0;
      }).length
    : 0;
  const allConfirmed = lines ? confirmedCount === lines.length && lines.length > 0 : false;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${
      canRespond && isActive ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100 bg-white'
    }`}>
      {/* Order header */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Order number + date */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="font-bold text-gray-900 text-sm">{order.order_number}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${STATUS_CLASS[order.order_status] ?? 'bg-gray-50 text-gray-500 border-gray-100'}`}>
                {STATUS_LABEL[order.order_status] ?? order.order_status}
              </span>
              {/* Supplier response badge */}
              {order.supplier_response === 'accepted' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                  Acceptée
                </span>
              )}
              {order.supplier_response === 'refused' && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  Refusée
                </span>
              )}
              {canRespond && isActive && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium animate-pulse">
                  ⏳ Réponse attendue
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400">
              {new Date(order.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>

          {/* Amount */}
          <div className="text-right shrink-0">
            <p className="text-lg font-bold text-gray-900">{Number(order.total_real_cost).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
            {order.transport_cost > 0 && (
              <p className="text-[10px] text-gray-400">dont {Number(order.transport_cost).toFixed(2)} € transport</p>
            )}
          </div>
        </div>

        {/* Payment status */}
        {order.payment_status && (
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Paiement :</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${PAYMENT_CLASS[order.payment_status] ?? 'bg-gray-50 text-gray-500'}`}>
              {PAYMENT_LABEL[order.payment_status] ?? order.payment_status}
              {order.payment_amount && order.payment_amount > 0 ? ` · ${Number(order.payment_amount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}` : ''}
            </span>
          </div>
        )}

        {/* Supplier comment (if refused) */}
        {order.supplier_comment && order.supplier_response !== 'pending' && (
          <div className={`mt-3 px-3 py-2 rounded-lg text-xs ${order.supplier_response === 'refused' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-emerald-50 text-emerald-700 border border-emerald-100'}`}>
            <span className="font-semibold">Votre commentaire : </span>{order.supplier_comment}
          </div>
        )}

        {/* Notes from admin */}
        {order.notes && (
          <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500">
            <svg className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            <span className="italic">{order.notes}</span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* Accept/Refuse — only for active orders not yet responded */}
          {canRespond && isActive && (
            <>
              <button
                onClick={onAccept}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                Accepter
              </button>
              <button
                onClick={onRefuse}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-red-200 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-50 transition-colors active:scale-95"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                Refuser
              </button>
            </>
          )}

          {/* PDF download — shown after price confirmation */}
          {['awaiting_validation', 'validated', 'payment_pending', 'payment_in_progress', 'paid',
            'payment_received_by_supplier', 'in_preparation', 'in_production', 'ready_to_ship',
            'shipped', 'partially_received', 'fully_received', 'costs_recorded', 'stock_integrated', 'closed',
          ].includes(order.order_status) && (
            <button
              onClick={onDownloadPDF}
              disabled={downloadingPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-indigo-700 border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors disabled:opacity-50"
            >
              {downloadingPDF ? (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
              )}
              Télécharger PDF
            </button>
          )}

          {/* Expand/collapse lines */}
          <button
            onClick={onToggle}
            className="ml-auto flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            {isExpanded ? 'Masquer le détail' : 'Voir le détail des produits'}
          </button>
        </div>
      </div>

      {/* Expanded: product lines */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/50">
          {linesLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !lines || lines.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucun article dans cette commande.</p>
          ) : (
            <div className="p-4 space-y-3">
              {/* Price confirmation banner */}
              {showPriceConfirmation && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-blue-800">Confirmation des tarifs requise</p>
                    <p className="text-xs text-blue-600 mt-0.5">Vérifiez et confirmez le prix unitaire de chaque produit avant de valider.</p>
                  </div>
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full shrink-0">
                    {confirmedCount}/{lines?.length ?? 0} confirmés
                  </span>
                </div>
              )}

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{lines.length} article{lines.length > 1 ? 's' : ''}</p>
              {lines.map((line) => {
                const inputVal = priceInputs[line.id] ?? '';
                const isLineConfirmed = inputVal === 'CONFIRMED' || (inputVal !== '' && !isNaN(Number(inputVal)) && Number(inputVal) > 0);
                const hasKnownPrice = Number(line.unit_price) > 0;

                return (
                <div key={line.id} className={`bg-white rounded-xl border p-3 ${showPriceConfirmation && isLineConfirmed ? 'border-emerald-200' : 'border-gray-100'}`}>
                  <div className="flex items-start gap-3">
                    {/* Product image */}
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                      {line.product_image_url ? (
                        <img
                          src={line.product_image_url}
                          alt={`Photo de ${line.product_name}`}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 leading-tight">{line.product_name}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-0.5">
                        {line.product_ref && <span className="text-[11px] text-gray-400 font-mono">{line.product_ref}</span>}
                        {line.variant && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{line.variant}</span>}
                        {line.color && <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{line.color}</span>}
                      </div>
                      {line.note && <p className="text-[11px] text-amber-600 mt-1 italic">{line.note}</p>}
                    </div>

                    {/* Qty + Price */}
                    <div className="text-right shrink-0 min-w-[100px]">
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>Qté : <span className="font-bold text-gray-800">{line.qty_ordered}</span></p>
                        {!showPriceConfirmation && (
                          <>
                            {line.qty_received > 0 && <p>Reçue : <span className="font-semibold text-emerald-600">{line.qty_received}</span></p>}
                            <p>P.U. : <span className="font-semibold text-gray-700">{Number(line.unit_price).toFixed(2)} €</span></p>
                          </>
                        )}
                      </div>
                      {!showPriceConfirmation && (
                        <p className="mt-1 text-sm font-bold text-gray-900">{Number(line.line_total).toFixed(2)} €</p>
                      )}
                    </div>

                    {/* Report out of stock (only when not in price confirmation mode) */}
                    {!showPriceConfirmation && (
                      <button
                        onClick={() => onReportOutOfStock(line.product_name)}
                        disabled={!!reportingLine}
                        title="Signaler ce produit hors stock"
                        className="shrink-0 p-1.5 rounded-lg border border-orange-200 text-orange-500 hover:bg-orange-50 hover:text-orange-700 transition-colors disabled:opacity-40"
                      >
                        {reportingLine === (line.id + line.product_name) ? (
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Price confirmation UI per line */}
                  {showPriceConfirmation && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      {isLineConfirmed ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-emerald-700">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            <span className="text-xs font-semibold">
                              Prix confirmé : {inputVal === 'CONFIRMED' ? Number(line.unit_price).toFixed(2) : Number(inputVal).toFixed(2)} €
                            </span>
                          </div>
                          <button
                            onClick={() => onPriceInput(line.id, '')}
                            className="text-[11px] text-gray-400 hover:text-gray-600 underline"
                          >
                            Modifier
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {hasKnownPrice && (
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">Dernier prix connu : <span className="font-semibold text-gray-700">{Number(line.unit_price).toFixed(2)} €</span></span>
                              <button
                                onClick={() => onPriceInput(line.id, 'CONFIRMED')}
                                className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors active:scale-95"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                                Je confirme ce prix
                              </button>
                            </div>
                          )}
                          <div>
                            <label className="block text-[11px] text-gray-500 mb-1">
                              {hasKnownPrice ? 'Ou entrez un nouveau prix' : 'Prix unitaire (obligatoire)'}
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={inputVal === 'CONFIRMED' ? '' : inputVal}
                                onChange={(e) => onPriceInput(line.id, e.target.value)}
                                placeholder="0.00"
                                className={`w-28 px-2.5 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 ${!hasKnownPrice ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
                              />
                              <span className="text-sm text-gray-500">€</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                );
              })}

              {/* Price confirmation submit */}
              {showPriceConfirmation && (
                <div className="pt-2 space-y-2">
                  {priceConfirmError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{priceConfirmError}</p>
                  )}
                  <button
                    onClick={() => onConfirmPrices(lines)}
                    disabled={!allConfirmed || confirmingPrices}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {confirmingPrices ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {allConfirmed ? 'Envoyer la confirmation des prix' : `En attente — ${confirmedCount}/${lines.length} produits confirmés`}
                  </button>
                </div>
              )}

              {/* Order total summary */}
              {!showPriceConfirmation && (
                <div className="border-t border-gray-200 pt-3 flex justify-end">
                  <div className="text-right text-xs space-y-1">
                    {order.subtotal > 0 && <p className="text-gray-500">Sous-total : <span className="font-medium text-gray-700">{Number(order.subtotal).toFixed(2)} €</span></p>}
                    {order.transport_cost > 0 && <p className="text-gray-500">Transport : <span className="font-medium text-gray-700">{Number(order.transport_cost).toFixed(2)} €</span></p>}
                    {order.customs_cost > 0 && <p className="text-gray-500">Douane : <span className="font-medium text-gray-700">{Number(order.customs_cost).toFixed(2)} €</span></p>}
                    <p className="text-sm font-bold text-gray-900 pt-1 border-t border-gray-100">
                      Total : {Number(order.total_real_cost).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
