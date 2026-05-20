'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSupplierAuth } from '@/contexts/SupplierAuthContext';
import { createClient } from '@/lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────────────
interface SupplierOrder {
  id: string;
  order_number: string;
  order_status: string;
  total_amount: number;
  currency: string;
  items: any[];
  notes: string | null;
  tracking_number: string | null;
  expected_delivery_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupplierClaim {
  id: string;
  claim_type: string;
  claim_status: string;
  product_name: string | null;
  description: string;
  affected_quantity: number;
  estimated_loss: number;
  requested_action: string;
  resolution_notes: string | null;
  created_at: string;
}

interface SupplierDocument {
  id: string;
  name: string;
  file_url: string;
  file_type: string | null;
  order_id: string | null;
  created_at: string;
}

interface SupplierMessage {
  id: string;
  sender: 'store' | 'supplier';
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  is_read: boolean;
  created_at: string;
}

interface SupplierProduct {
  id: string;
  name: string;
  ref: string;
  category: string;
  image_url: string | null;
  stock: number;
  min_stock: number;
  sell_price_ttc: number;
  buy_price: number;
  purchase_price_supplier: number;
  product_status: string;
  sales_30d: number;
  is_suspended: boolean;
}

interface FoOrderLine {
  id: string;
  product_name: string;
  product_ref: string | null;
  product_image_url: string | null;
  variant: string | null;
  color: string | null;
  size: string | null;
  qty_ordered: number;
  unit_price: number;
  line_total: number;
  note: string | null;
}

interface InboxOrder {
  id: string;
  order_number: string;
  order_status: string;
  currency: string;
  subtotal: number;
  total_real_cost: number;
  notes: string | null;
  expected_delivery_at: string | null;
  supplier_validated: boolean;
  supplier_comment: string | null;
  supplier_final_amount: number | null;
  created_at: string;
  updated_at: string;
  lines?: FoOrderLine[];
}

// ─── Pagination ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;

// ─── Status helpers ───────────────────────────────────────────────────────────
const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'En attente validation',
  modification_requested: 'Modification demandée', validated: 'Validée',
  awaiting_payment: 'En attente paiement', payment_sent: 'Paiement envoyé',
  payment_confirmed: 'Paiement confirmé', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', received: 'Reçue totalement',
  issue_reported: 'Problème signalé', refund_requested: 'Remboursement demandé',
  refund_received: 'Remboursement reçu', cancelled: 'Annulée',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-600',
  sent: 'bg-blue-100 text-blue-700',
  awaiting_validation: 'bg-amber-100 text-amber-700',
  modification_requested: 'bg-orange-100 text-orange-700',
  validated: 'bg-emerald-100 text-emerald-700',
  awaiting_payment: 'bg-yellow-100 text-yellow-700',
  payment_sent: 'bg-cyan-100 text-cyan-700',
  payment_confirmed: 'bg-teal-100 text-teal-700',
  in_production: 'bg-violet-100 text-violet-700',
  ready_to_ship: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-sky-100 text-sky-700',
  partially_received: 'bg-lime-100 text-lime-700',
  received: 'bg-green-100 text-green-700',
  issue_reported: 'bg-red-100 text-red-700',
  refund_requested: 'bg-rose-100 text-rose-700',
  refund_received: 'bg-pink-100 text-pink-700',
  cancelled: 'bg-stone-100 text-stone-500',
};

const FO_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', sent: 'Reçue', awaiting_validation: 'En attente de validation',
  validated: 'Validée', modification_requested: 'Modification demandée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée', payment_received_by_supplier: 'Paiement reçu',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue totalement',
  costs_recorded: 'Frais enregistrés', stock_integrated: 'Stock intégré',
  closed: 'Clôturée', suspended: 'Suspendue', cancelled: 'Annulée',
};

const FO_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-stone-100 text-stone-500', sent: 'bg-blue-100 text-blue-700',
  awaiting_validation: 'bg-amber-100 text-amber-700', validated: 'bg-emerald-100 text-emerald-700',
  modification_requested: 'bg-orange-100 text-orange-700', payment_pending: 'bg-yellow-100 text-yellow-700',
  payment_in_progress: 'bg-cyan-100 text-cyan-700', paid: 'bg-teal-100 text-teal-700',
  payment_received_by_supplier: 'bg-green-100 text-green-700', in_preparation: 'bg-purple-100 text-purple-700',
  in_production: 'bg-violet-100 text-violet-700', ready_to_ship: 'bg-indigo-100 text-indigo-700',
  shipped: 'bg-sky-100 text-sky-700', partially_received: 'bg-lime-100 text-lime-700',
  fully_received: 'bg-green-100 text-green-700', closed: 'bg-stone-100 text-stone-500',
  cancelled: 'bg-red-100 text-red-600',
};

const CLAIM_STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_response: 'En attente réponse',
  accepted: 'Acceptée', refused: 'Refusée', refund_pending: 'Remboursement en attente',
  refund_received: 'Remboursement reçu', closed: 'Clôturée',
};

const SUPPLIER_ORDER_ACTIONS: Record<string, { label: string; nextStatus: string; color: string }[]> = {
  awaiting_validation: [
    { label: 'Accepter la commande', nextStatus: 'validated', color: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    { label: 'Demander une modification', nextStatus: 'modification_requested', color: 'bg-amber-500 hover:bg-amber-600 text-white' },
  ],
  payment_confirmed: [
    { label: 'Confirmer la production', nextStatus: 'in_production', color: 'bg-violet-600 hover:bg-violet-700 text-white' },
  ],
  in_production: [
    { label: 'Prêt à expédier', nextStatus: 'ready_to_ship', color: 'bg-indigo-600 hover:bg-indigo-700 text-white' },
  ],
  ready_to_ship: [
    { label: 'Marquer comme expédiée', nextStatus: 'shipped', color: 'bg-sky-600 hover:bg-sky-700 text-white' },
  ],
};

const INBOX_ACTIONS: Record<string, { label: string; nextStatus: string; color: string; icon: string }[]> = {
  sent: [
    { label: 'Accepter', nextStatus: 'validated', color: 'bg-emerald-600 hover:bg-emerald-700 text-white', icon: '✓' },
    { label: 'Demander modification', nextStatus: 'modification_requested', color: 'bg-amber-500 hover:bg-amber-600 text-white', icon: '✎' },
    { label: 'Refuser', nextStatus: 'cancelled', color: 'bg-red-500 hover:bg-red-600 text-white', icon: '✕' },
  ],
  awaiting_validation: [
    { label: 'Accepter', nextStatus: 'validated', color: 'bg-emerald-600 hover:bg-emerald-700 text-white', icon: '✓' },
    { label: 'Demander modification', nextStatus: 'modification_requested', color: 'bg-amber-500 hover:bg-amber-600 text-white', icon: '✎' },
    { label: 'Refuser', nextStatus: 'cancelled', color: 'bg-red-500 hover:bg-red-600 text-white', icon: '✕' },
  ],
  payment_received_by_supplier: [
    { label: 'Confirmer la production', nextStatus: 'in_production', color: 'bg-violet-600 hover:bg-violet-700 text-white', icon: '⚙' },
  ],
  in_production: [
    { label: 'Prêt à expédier', nextStatus: 'ready_to_ship', color: 'bg-indigo-600 hover:bg-indigo-700 text-white', icon: '📦' },
  ],
  ready_to_ship: [
    { label: 'Marquer expédiée', nextStatus: 'shipped', color: 'bg-sky-600 hover:bg-sky-700 text-white', icon: '🚚' },
  ],
};

// ─── Spinner ──────────────────────────────────────────────────────────────────
function Spinner({ text = 'Chargement…' }: { text?: string }) {
  return (
    <div className="bg-white rounded-xl border border-border p-8 text-center">
      <svg className="w-5 h-5 animate-spin text-primary mx-auto mb-2" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Pagination controls ──────────────────────────────────────────────────────
function PaginationBar({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3 border-t border-border">
      <p className="text-xs text-muted-foreground">
        Page {page + 1} / {totalPages} — {total} résultat{total > 1 ? 's' : ''}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
        >‹ Préc.</button>
        <button
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted disabled:opacity-30 transition-colors"
        >Suiv. ›</button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function SupplierDashboardPage() {
  const router = useRouter();
  const { supplierUser, loading: authLoading, signOut } = useSupplierAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'inbox' | 'orders' | 'products' | 'claims' | 'documents' | 'messages'>('inbox');

  // ── Per-tab data ──────────────────────────────────────────────────────────
  const [inboxOrders, setInboxOrders] = useState<InboxOrder[]>([]);
  const [inboxTotal, setInboxTotal] = useState(0);
  const [inboxPage, setInboxPage] = useState(0);
  const [inboxLoading, setInboxLoading] = useState(false);

  const [orders, setOrders] = useState<SupplierOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(0);
  const [ordersLoading, setOrdersLoading] = useState(false);

  const [supplierProducts, setSupplierProducts] = useState<SupplierProduct[]>([]);
  const [productsTotal, setProductsTotal] = useState(0);
  const [productsPage, setProductsPage] = useState(0);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [claimsTotal, setClaimsTotal] = useState(0);
  const [claimsPage, setClaimsPage] = useState(0);
  const [claimsLoading, setClaimsLoading] = useState(false);

  const [documents, setDocuments] = useState<SupplierDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const [messages, setMessages] = useState<SupplierMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // ── Summary counters (lightweight) ───────────────────────────────────────
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [pendingInboxCount, setPendingInboxCount] = useState(0);
  const [pendingOrdersCount, setPendingOrdersCount] = useState(0);
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [openClaimsCount, setOpenClaimsCount] = useState(0);
  const [totalProductsCount, setTotalProductsCount] = useState(0);
  const [ruptureCount, setRuptureCount] = useState(0);

  // ── Action state ──────────────────────────────────────────────────────────
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SupplierOrder | null>(null);
  const [trackingInput, setTrackingInput] = useState('');
  const [orderComment, setOrderComment] = useState('');

  const [expandedInboxId, setExpandedInboxId] = useState<string | null>(null);
  const [inboxComment, setInboxComment] = useState<Record<string, string>>({});
  const [inboxFinalAmount, setInboxFinalAmount] = useState<Record<string, string>>({});
  const [inboxActionLoading, setInboxActionLoading] = useState<string | null>(null);

  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [docOrderId, setDocOrderId] = useState('');
  const [docUploading, setDocUploading] = useState(false);

  const [replyText, setReplyText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgAttachUrl, setMsgAttachUrl] = useState('');
  const [msgAttachName, setMsgAttachName] = useState('');
  const [msgType, setMsgType] = useState<'text' | 'photo' | 'pdf' | 'payment_proof' | 'claim' | 'order_modification' | 'other'>('text');
  const [msgOrderId, setMsgOrderId] = useState('');
  const [showMsgAttach, setShowMsgAttach] = useState(false);
  const msgBottomRef = React.useRef<HTMLDivElement>(null);

  const [claimResponse, setClaimResponse] = useState('');
  const [respondingClaim, setRespondingClaim] = useState<string | null>(null);

  // Track which tabs have been loaded
  const loadedTabs = useRef<Set<string>>(new Set());

  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !supplierUser) {
      router.replace('/supplier-portal/login');
    }
  }, [authLoading, supplierUser, router]);

  // ── Load lightweight summary counts ──────────────────────────────────────
  const loadSummary = useCallback(async () => {
    if (!supplierUser) return;
    setSummaryLoading(true);
    try {
      const sid = supplierUser.supplierId;
      const [inboxRes, ordersRes, msgsRes, claimsRes, productsRes, ruptureRes] = await Promise.all([
        supabase.from('fo_orders').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid)
          .in('order_status', ['sent', 'awaiting_validation']),
        supabase.from('supplier_orders').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid)
          .in('order_status', ['awaiting_validation', 'payment_confirmed', 'in_production', 'ready_to_ship']),
        supabase.from('supplier_messages').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid).eq('sender', 'store').eq('is_read', false),
        supabase.from('supplier_claims').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid).in('claim_status', ['sent', 'awaiting_response']),
        supabase.from('products').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid),
        supabase.from('products').select('id', { count: 'exact', head: true })
          .eq('supplier_id', sid).lte('stock', 0),
      ]);
      setPendingInboxCount(inboxRes.count || 0);
      setPendingOrdersCount(ordersRes.count || 0);
      setUnreadMsgCount(msgsRes.count || 0);
      setOpenClaimsCount(claimsRes.count || 0);
      setTotalProductsCount(productsRes.count || 0);
      setRuptureCount(ruptureRes.count || 0);
    } catch (err) {
      console.error('Error loading summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  }, [supplierUser]);

  // ── Tab-specific loaders ──────────────────────────────────────────────────
  const loadInbox = useCallback(async (page = 0) => {
    if (!supplierUser) return;
    setInboxLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('fo_orders')
        .select('id, order_number, order_status, currency, subtotal, total_real_cost, notes, expected_delivery_at, supplier_validated, supplier_comment, supplier_final_amount, created_at, updated_at', { count: 'exact' })
        .eq('supplier_id', supplierUser.supplierId)
        .order('created_at', { ascending: false })
        .range(from, to);
      setInboxOrders(data || []);
      setInboxTotal(count || 0);
      setInboxPage(page);
    } catch (err) {
      console.error('Error loading inbox:', err);
    } finally {
      setInboxLoading(false);
    }
  }, [supplierUser]);

  const loadOrders = useCallback(async (page = 0) => {
    if (!supplierUser) return;
    setOrdersLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('supplier_orders')
        .select('id, order_number, order_status, total_amount, currency, items, notes, tracking_number, expected_delivery_at, created_at, updated_at', { count: 'exact' })
        .eq('supplier_id', supplierUser.supplierId)
        .order('created_at', { ascending: false })
        .range(from, to);
      setOrders(data || []);
      setOrdersTotal(count || 0);
      setOrdersPage(page);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [supplierUser]);

  const loadProducts = useCallback(async (page = 0, search = '') => {
    if (!supplierUser) return;
    setProductsLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from('products')
        .select('id, name, ref, category, image_url, stock, min_stock, sell_price_ttc, buy_price, purchase_price_supplier, product_status, sales_30d, is_suspended', { count: 'exact' })
        .eq('supplier_id', supplierUser.supplierId)
        .order('name')
        .range(from, to);
      if (search.trim()) {
        query = query.ilike('name', `%${search.trim()}%`);
      }
      const { data, count } = await query;
      setSupplierProducts(data || []);
      setProductsTotal(count || 0);
      setProductsPage(page);
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setProductsLoading(false);
    }
  }, [supplierUser]);

  const loadClaims = useCallback(async (page = 0) => {
    if (!supplierUser) return;
    setClaimsLoading(true);
    try {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count } = await supabase
        .from('supplier_claims')
        .select('id, claim_type, claim_status, product_name, description, affected_quantity, estimated_loss, requested_action, resolution_notes, created_at', { count: 'exact' })
        .eq('supplier_id', supplierUser.supplierId)
        .order('created_at', { ascending: false })
        .range(from, to);
      setClaims(data || []);
      setClaimsTotal(count || 0);
      setClaimsPage(page);
    } catch (err) {
      console.error('Error loading claims:', err);
    } finally {
      setClaimsLoading(false);
    }
  }, [supplierUser]);

  const loadDocuments = useCallback(async () => {
    if (!supplierUser) return;
    setDocsLoading(true);
    try {
      const { data } = await supabase
        .from('supplier_documents')
        .select('id, name, file_url, file_type, order_id, created_at')
        .eq('supplier_id', supplierUser.supplierId)
        .order('created_at', { ascending: false })
        .limit(50);
      setDocuments(data || []);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setDocsLoading(false);
    }
  }, [supplierUser]);

  const loadMessages = useCallback(async () => {
    if (!supplierUser) return;
    setMessagesLoading(true);
    try {
      const { data } = await supabase
        .from('supplier_messages')
        .select('id, sender, content, attachment_url, attachment_type, is_read, created_at')
        .eq('supplier_id', supplierUser.supplierId)
        .order('created_at', { ascending: true })
        .limit(100);
      setMessages(data || []);
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, [supplierUser]);

  // ── Initial load: summary + inbox (default tab) ───────────────────────────
  useEffect(() => {
    if (!supplierUser) return;
    loadSummary();
    loadInbox(0);
    loadedTabs.current.add('inbox');
  }, [supplierUser]);

  // ── Tab switch: lazy-load tab data ────────────────────────────────────────
  useEffect(() => {
    if (!supplierUser || loadedTabs.current.has(activeTab)) return;
    loadedTabs.current.add(activeTab);
    if (activeTab === 'orders') loadOrders(0);
    else if (activeTab === 'products') loadProducts(0);
    else if (activeTab === 'claims') loadClaims(0);
    else if (activeTab === 'documents') loadDocuments();
    else if (activeTab === 'messages') loadMessages();
  }, [activeTab, supplierUser]);

  // ── Load inbox order lines on expand ─────────────────────────────────────
  const loadInboxOrderLines = async (orderId: string) => {
    const { data } = await supabase
      .from('fo_order_lines')
      .select('id, product_name, product_ref, product_image_url, variant, color, size, qty_ordered, unit_price, line_total, note')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    setInboxOrders(prev => prev.map(o => o.id === orderId ? { ...o, lines: data || [] } : o));
  };

  const handleExpandInbox = async (orderId: string) => {
    if (expandedInboxId === orderId) { setExpandedInboxId(null); return; }
    setExpandedInboxId(orderId);
    const order = inboxOrders.find(o => o.id === orderId);
    if (order && !order.lines) await loadInboxOrderLines(orderId);
  };

  // ── Inbox approval action ─────────────────────────────────────────────────
  const handleInboxAction = async (orderId: string, newStatus: string) => {
    setInboxActionLoading(orderId);
    try {
      const comment = inboxComment[orderId] || null;
      const finalAmountStr = inboxFinalAmount[orderId];
      const finalAmount = finalAmountStr ? parseFloat(finalAmountStr) : null;
      const updateData: any = {
        order_status: newStatus,
        supplier_validated: newStatus === 'validated',
        updated_at: new Date().toISOString(),
      };
      if (comment) updateData.supplier_comment = comment;
      if (finalAmount !== null && !isNaN(finalAmount)) updateData.supplier_final_amount = finalAmount;
      await supabase.from('fo_orders').update(updateData).eq('id', orderId);
      const order = inboxOrders.find(o => o.id === orderId);
      if (order) {
        await supabase.from('fo_order_status_history').insert({
          order_id: orderId, old_status: order.order_status, new_status: newStatus,
          changed_by: supplierUser?.supplierName || 'Fournisseur', comment: comment || null,
        });
      }
      setInboxComment(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      setInboxFinalAmount(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      // Refresh only inbox + summary
      await Promise.all([loadInbox(inboxPage), loadSummary()]);
    } catch (err) {
      console.error('Error updating inbox order:', err);
    } finally {
      setInboxActionLoading(null);
    }
  };

  // ── Order status update ───────────────────────────────────────────────────
  const handleOrderStatusUpdate = async (orderId: string, newStatus: string) => {
    setActionLoading(orderId);
    try {
      const updateData: any = { order_status: newStatus };
      if (newStatus === 'shipped' && trackingInput) {
        updateData.tracking_number = trackingInput;
        updateData.shipped_at = new Date().toISOString();
      }
      await supabase.from('supplier_orders').update(updateData).eq('id', orderId);
      if (orderComment) {
        await supabase.from('supplier_messages').insert({
          supplier_id: supplierUser!.supplierId, order_id: orderId,
          sender: 'supplier', content: orderComment,
        });
        setOrderComment('');
      }
      await Promise.all([loadOrders(ordersPage), loadSummary()]);
      setSelectedOrder(null);
      setTrackingInput('');
    } catch (err) {
      console.error('Error updating order:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    setActionLoading(orderId);
    try {
      await supabase.from('supplier_orders').update({ order_status: 'received', received_at: new Date().toISOString() }).eq('id', orderId);
      await loadOrders(ordersPage);
    } catch (err) {
      console.error('Error confirming receipt:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docName || !docUrl || !supplierUser) return;
    setDocUploading(true);
    try {
      await supabase.from('supplier_documents').insert({
        supplier_id: supplierUser.supplierId, order_id: docOrderId || null,
        name: docName, file_url: docUrl,
        file_type: docUrl.split('.').pop()?.toLowerCase() || 'other',
      });
      setDocName(''); setDocUrl(''); setDocOrderId('');
      await loadDocuments();
    } catch (err) {
      console.error('Error uploading document:', err);
    } finally {
      setDocUploading(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = replyText.trim();
    const hasAttach = msgAttachUrl.trim() !== '';
    if (!text && !hasAttach) return;
    if (!supplierUser) return;
    setSendingMsg(true);
    try {
      const payload: any = {
        supplier_id: supplierUser.supplierId, sender: 'supplier',
        content: text || null, message_type: msgType, is_read: false,
        order_id: msgOrderId || null,
      };
      if (hasAttach) {
        payload.attachment_url = msgAttachUrl.trim();
        payload.attachment_type = msgType === 'photo' ? 'image' : msgType === 'pdf' ? 'pdf' : 'file';
        payload.attachment_name = msgAttachName.trim() || 'Pièce jointe';
      }
      await supabase.from('supplier_messages').insert(payload);
      setReplyText(''); setMsgAttachUrl(''); setMsgAttachName('');
      setMsgType('text'); setMsgOrderId(''); setShowMsgAttach(false);
      await Promise.all([loadMessages(), loadSummary()]);
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleRespondToClaim = async (claimId: string, newStatus: 'accepted' | 'refused') => {
    if (!claimResponse.trim()) return;
    setRespondingClaim(claimId);
    try {
      await supabase.from('supplier_claims').update({
        claim_status: newStatus, resolution_notes: claimResponse,
      }).eq('id', claimId);
      setClaimResponse('');
      await Promise.all([loadClaims(claimsPage), loadSummary()]);
    } catch (err) {
      console.error('Error responding to claim:', err);
    } finally {
      setRespondingClaim(null);
    }
  };

  // ── Product search ────────────────────────────────────────────────────────
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleProductSearch = (val: string) => {
    setProductSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      loadProducts(0, val);
    }, 350);
  };

  // ─── Loading / Auth guard ─────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="w-8 h-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-muted-foreground">Connexion en cours…</p>
        </div>
      </div>
    );
  }

  if (!supplierUser) return null;

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-600 text-foreground leading-none">{supplierUser.supplierName}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Portail Fournisseur</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-lg hover:bg-muted"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            Déconnexion
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Bons de commande', value: summaryLoading ? '…' : inboxTotal, icon: '📥', color: 'bg-rose-50 text-rose-700' },
            { label: 'En attente approbation', value: summaryLoading ? '…' : pendingInboxCount, icon: '⏳', color: 'bg-amber-50 text-amber-700' },
            { label: 'Mes produits', value: summaryLoading ? '…' : totalProductsCount, icon: '🏷️', color: 'bg-teal-50 text-teal-700' },
            { label: 'Réclamations ouvertes', value: summaryLoading ? '…' : openClaimsCount, icon: '⚠️', color: 'bg-red-50 text-red-700' },
            { label: 'Messages non lus', value: summaryLoading ? '…' : unreadMsgCount, icon: '💬', color: 'bg-violet-50 text-violet-700' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-border p-4">
              <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-base mb-2 ${stat.color}`}>
                {stat.icon}
              </div>
              <p className="text-2xl font-700 text-foreground tabular-nums">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1 mb-5 overflow-x-auto">
          {([
            { id: 'inbox', label: 'Boîte de réception', badge: pendingInboxCount, icon: '📥' },
            { id: 'orders', label: 'Commandes', badge: pendingOrdersCount, icon: null },
            { id: 'products', label: 'Mes produits', badge: ruptureCount, icon: null },
            { id: 'claims', label: 'Réclamations', badge: openClaimsCount, icon: null },
            { id: 'documents', label: 'Documents', badge: 0, icon: null },
            { id: 'messages', label: 'Messagerie', badge: unreadMsgCount, icon: null },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-500 whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {tab.icon && <span className="text-xs">{tab.icon}</span>}
              {tab.label}
              {tab.badge > 0 && (
                <span className={`text-[10px] font-700 rounded-full px-1.5 py-0.5 min-w-[18px] text-center tabular-nums ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ─── INBOX TAB ─── */}
        {activeTab === 'inbox' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-100 rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0 text-lg">📥</div>
              <div>
                <p className="text-sm font-600 text-foreground">Bons de commande reçus</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Consultez les bons de commande envoyés par BeautyPOS et gérez leur approbation.
                </p>
              </div>
            </div>

            {inboxLoading ? (
              <Spinner text="Chargement des bons de commande…" />
            ) : inboxOrders.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-10 text-center">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-3 text-2xl">📭</div>
                <p className="text-sm font-500 text-foreground">Aucun bon de commande reçu</p>
                <p className="text-xs text-muted-foreground mt-1">Les bons de commande envoyés par BeautyPOS apparaîtront ici.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {inboxOrders.map((order) => {
                  const isExpanded = expandedInboxId === order.id;
                  const actions = INBOX_ACTIONS[order.order_status] || [];
                  const needsAction = ['sent', 'awaiting_validation'].includes(order.order_status);

                  return (
                    <div key={order.id} className={`bg-white rounded-xl border overflow-hidden transition-all ${needsAction ? 'border-amber-200 shadow-sm shadow-amber-50' : 'border-border'}`}>
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors"
                        onClick={() => handleExpandInbox(order.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {needsAction && <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />}
                          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-600 text-foreground">{order.order_number}</p>
                              {needsAction && <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Action requise</span>}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Reçu le {new Date(order.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-500 px-2.5 py-1 rounded-full ${FO_STATUS_COLORS[order.order_status] || 'bg-stone-100 text-stone-600'}`}>
                            {FO_STATUS_LABELS[order.order_status] || order.order_status}
                          </span>
                          <span className="text-sm font-600 text-foreground tabular-nums hidden sm:block">
                            {(order.subtotal || 0).toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                          </span>
                          <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border bg-stone-50/40 p-4 space-y-5">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <div className="bg-white rounded-lg border border-border p-3">
                              <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide mb-1">Montant total</p>
                              <p className="text-base font-700 text-foreground tabular-nums">
                                {(order.subtotal || 0).toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                              </p>
                            </div>
                            {order.expected_delivery_at && (
                              <div className="bg-white rounded-lg border border-border p-3">
                                <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide mb-1">Livraison souhaitée</p>
                                <p className="text-sm font-600 text-foreground">
                                  {new Date(order.expected_delivery_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })}
                                </p>
                              </div>
                            )}
                            <div className="bg-white rounded-lg border border-border p-3">
                              <p className="text-[10px] font-600 text-muted-foreground uppercase tracking-wide mb-1">Statut</p>
                              <span className={`text-xs font-500 px-2 py-0.5 rounded-full ${FO_STATUS_COLORS[order.order_status] || 'bg-stone-100 text-stone-600'}`}>
                                {FO_STATUS_LABELS[order.order_status] || order.order_status}
                              </span>
                            </div>
                          </div>

                          {order.notes && (
                            <div>
                              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Notes de BeautyPOS</p>
                              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                                <p className="text-sm text-blue-800">{order.notes}</p>
                              </div>
                            </div>
                          )}

                          <div>
                            <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Articles commandés</p>
                            {!order.lines ? (
                              <div className="bg-white rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">
                                <svg className="w-4 h-4 animate-spin mx-auto mb-1 text-muted-foreground" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Chargement des articles…
                              </div>
                            ) : order.lines.length === 0 ? (
                              <div className="bg-white rounded-lg border border-border p-4 text-center text-sm text-muted-foreground">Aucun article dans cette commande.</div>
                            ) : (
                              <div className="bg-white rounded-lg border border-border overflow-hidden">
                                <div className="divide-y divide-border">
                                  {order.lines.map((line) => (
                                    <div key={line.id} className="flex items-center gap-3 p-3 hover:bg-stone-50 transition-colors">
                                      <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-border">
                                        {line.product_image_url ? (
                                          <img src={line.product_image_url} alt={line.product_name} loading="lazy" className="w-full h-full object-cover" />
                                        ) : (
                                          <div className="w-full h-full flex items-center justify-center">
                                            <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-500 text-foreground truncate">{line.product_name}</p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                          {line.product_ref && <span className="text-[10px] text-muted-foreground font-mono">{line.product_ref}</span>}
                                          {line.color && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{line.color}</span>}
                                          {line.size && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{line.size}</span>}
                                          {line.variant && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{line.variant}</span>}
                                        </div>
                                        {line.note && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{line.note}</p>}
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-sm font-600 text-foreground tabular-nums">
                                          {(line.line_total || 0).toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                                        </p>
                                        <p className="text-xs text-muted-foreground tabular-nums">
                                          {line.qty_ordered} × {(line.unit_price || 0).toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex items-center justify-between px-3 py-2.5 bg-stone-50 border-t border-border">
                                  <p className="text-xs font-600 text-muted-foreground">Total commande</p>
                                  <p className="text-sm font-700 text-foreground tabular-nums">
                                    {(order.subtotal || 0).toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>

                          {order.supplier_comment && (
                            <div>
                              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Votre réponse précédente</p>
                              <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                                <p className="text-sm text-emerald-800">{order.supplier_comment}</p>
                              </div>
                            </div>
                          )}

                          {actions.length > 0 && (
                            <div className="bg-white rounded-lg border border-border p-4 space-y-3">
                              <p className="text-xs font-600 text-foreground uppercase tracking-wide">Votre décision</p>
                              <div>
                                <label className="block text-xs font-500 text-muted-foreground mb-1">Montant final confirmé (optionnel)</label>
                                <input
                                  type="number" step="0.01"
                                  value={inboxFinalAmount[order.id] || ''}
                                  onChange={(e) => setInboxFinalAmount(prev => ({ ...prev, [order.id]: e.target.value }))}
                                  placeholder={`${(order.subtotal || 0).toFixed(2)} ${order.currency || 'EUR'}`}
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-500 text-muted-foreground mb-1">Commentaire / Motif (optionnel)</label>
                                <textarea
                                  value={inboxComment[order.id] || ''}
                                  onChange={(e) => setInboxComment(prev => ({ ...prev, [order.id]: e.target.value }))}
                                  placeholder="Ajoutez un commentaire…"
                                  rows={3}
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                              </div>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {actions.map((action) => (
                                  <button
                                    key={action.nextStatus}
                                    onClick={() => handleInboxAction(order.id, action.nextStatus)}
                                    disabled={inboxActionLoading === order.id}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-600 transition-colors disabled:opacity-60 ${action.color}`}
                                  >
                                    <span>{action.icon}</span>
                                    {inboxActionLoading === order.id ? 'En cours…' : action.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {actions.length === 0 && order.order_status !== 'draft' && (
                            <div className={`rounded-lg border p-3 flex items-center gap-2 ${
                              order.order_status === 'validated' ? 'bg-emerald-50 border-emerald-100' :
                              order.order_status === 'cancelled' ? 'bg-red-50 border-red-100' :
                              order.order_status === 'modification_requested' ? 'bg-orange-50 border-orange-100' : 'bg-stone-50 border-border'
                            }`}>
                              <span className="text-base">
                                {order.order_status === 'validated' ? '✓' : order.order_status === 'cancelled' ? '✕' : order.order_status === 'modification_requested' ? '✎' : 'ℹ'}
                              </span>
                              <p className="text-sm font-500 text-foreground">
                                {order.order_status === 'validated' ? 'Commande acceptée' :
                                 order.order_status === 'cancelled' ? 'Commande refusée' :
                                 order.order_status === 'modification_requested' ? 'Modification demandée — en attente de réponse' :
                                 FO_STATUS_LABELS[order.order_status] || order.order_status}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                <PaginationBar page={inboxPage} total={inboxTotal} pageSize={PAGE_SIZE} onChange={(p) => loadInbox(p)} />
              </div>
            )}
          </div>
        )}

        {/* ─── ORDERS TAB ─── */}
        {activeTab === 'orders' && (
          <div className="space-y-3">
            {ordersLoading ? (
              <Spinner text="Chargement des commandes…" />
            ) : orders.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucune commande pour le moment.</p>
              </div>
            ) : (
              <>
                {orders.map((order) => {
                  const actions = SUPPLIER_ORDER_ACTIONS[order.order_status] || [];
                  const isExpanded = selectedOrder?.id === order.id;
                  return (
                    <div key={order.id} className="bg-white rounded-xl border border-border overflow-hidden">
                      <div
                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-stone-50 transition-colors"
                        onClick={() => setSelectedOrder(isExpanded ? null : order)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                            <svg className="w-4 h-4 text-stone-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-600 text-foreground">{order.order_number}</p>
                            <p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleDateString('fr-FR')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-500 px-2.5 py-1 rounded-full ${ORDER_STATUS_COLORS[order.order_status] || 'bg-stone-100 text-stone-600'}`}>
                            {ORDER_STATUS_LABELS[order.order_status] || order.order_status}
                          </span>
                          <span className="text-sm font-600 text-foreground tabular-nums">
                            {order.total_amount.toLocaleString('fr-FR', { style: 'currency', currency: order.currency || 'EUR' })}
                          </span>
                          <svg className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                          </svg>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t border-border p-4 bg-stone-50/50 space-y-4">
                          {order.items?.length > 0 && (
                            <div>
                              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-2">Articles</p>
                              <div className="space-y-1.5">
                                {order.items.map((item: any, i: number) => (
                                  <div key={i} className="flex justify-between text-sm">
                                    <span className="text-foreground">{item.name} × {item.qty}</span>
                                    <span className="text-muted-foreground tabular-nums">{(item.total || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {order.notes && (
                            <div>
                              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                              <p className="text-sm text-foreground bg-white rounded-lg p-3 border border-border">{order.notes}</p>
                            </div>
                          )}
                          {order.tracking_number && (
                            <div className="flex items-center gap-2 text-sm">
                              <span className="text-muted-foreground">Numéro de suivi :</span>
                              <span className="font-600 text-foreground font-mono">{order.tracking_number}</span>
                            </div>
                          )}
                          {actions.length > 0 && (
                            <div className="space-y-3">
                              <p className="text-xs font-600 text-muted-foreground uppercase tracking-wide">Actions disponibles</p>
                              {order.order_status === 'ready_to_ship' && (
                                <input
                                  type="text" value={trackingInput}
                                  onChange={(e) => setTrackingInput(e.target.value)}
                                  placeholder="Numéro de suivi (optionnel)"
                                  className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                                />
                              )}
                              <textarea
                                value={orderComment}
                                onChange={(e) => setOrderComment(e.target.value)}
                                placeholder="Ajouter un commentaire (optionnel)…"
                                rows={2}
                                className="w-full px-3 py-2 rounded-lg border border-border bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                              />
                              <div className="flex flex-wrap gap-2">
                                {actions.map((action) => (
                                  <button
                                    key={action.nextStatus}
                                    onClick={() => handleOrderStatusUpdate(order.id, action.nextStatus)}
                                    disabled={actionLoading === order.id}
                                    className={`px-4 py-2 rounded-lg text-sm font-600 transition-colors disabled:opacity-60 ${action.color}`}
                                  >
                                    {actionLoading === order.id ? 'En cours…' : action.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                          {order.order_status === 'shipped' && (
                            <button
                              onClick={() => handleConfirmReceipt(order.id)}
                              disabled={actionLoading === order.id}
                              className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-600 transition-colors disabled:opacity-60"
                            >
                              {actionLoading === order.id ? 'En cours…' : '✓ Confirmer la réception'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <PaginationBar page={ordersPage} total={ordersTotal} pageSize={PAGE_SIZE} onChange={(p) => loadOrders(p)} />
              </>
            )}
          </div>
        )}

        {/* ─── PRODUCTS TAB ─── */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 rounded-xl p-4 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center shrink-0 text-lg">🏷️</div>
              <div>
                <p className="text-sm font-600 text-foreground">Vos produits rattachés</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {totalProductsCount} produit(s) rattaché(s) à votre compte fournisseur.
                  {ruptureCount > 0 && <span className="text-red-600 font-500"> {ruptureCount} en rupture.</span>}
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
              <input
                type="text"
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                placeholder="Rechercher un produit…"
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            {productsLoading ? (
              <Spinner text="Chargement des produits…" />
            ) : supplierProducts.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucun produit trouvé.</p>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl border border-border overflow-hidden">
                  <div className="divide-y divide-border">
                    {supplierProducts.map((product) => (
                      <div key={product.id} className="flex items-center gap-3 p-3 hover:bg-stone-50 transition-colors">
                        <div className="w-10 h-10 rounded-lg bg-stone-100 overflow-hidden shrink-0 border border-border">
                          {product.image_url ? (
                            <img src={product.image_url} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-500 text-foreground truncate">{product.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-[10px] text-muted-foreground font-mono">{product.ref}</span>
                            {product.category && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{product.category}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-1">
                          <p className="text-sm font-600 text-foreground tabular-nums">{product.sell_price_ttc.toFixed(2)} €</p>
                          <div className="flex items-center gap-1.5 justify-end">
                            <span className={`text-[10px] font-600 px-1.5 py-0.5 rounded-full ${
                              product.stock <= 0 ? 'bg-red-100 text-red-700' :
                              product.stock <= product.min_stock ? 'bg-amber-100 text-amber-700': 'bg-emerald-100 text-emerald-700'
                            }`}>
                              Stock: {product.stock}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <PaginationBar page={productsPage} total={productsTotal} pageSize={PAGE_SIZE} onChange={(p) => loadProducts(p, productSearch)} />
              </>
            )}
          </div>
        )}

        {/* ─── CLAIMS TAB ─── */}
        {activeTab === 'claims' && (
          <div className="space-y-3">
            {claimsLoading ? (
              <Spinner text="Chargement des réclamations…" />
            ) : claims.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucune réclamation pour le moment.</p>
              </div>
            ) : (
              <>
                {claims.map((claim) => (
                  <div key={claim.id} className="bg-white rounded-xl border border-border p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-600 text-foreground">{claim.product_name || 'Réclamation'}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(claim.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <span className={`text-xs font-500 px-2.5 py-1 rounded-full shrink-0 ${
                        claim.claim_status === 'accepted' ? 'bg-emerald-100 text-emerald-700' :
                        claim.claim_status === 'refused'? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {CLAIM_STATUS_LABELS[claim.claim_status] || claim.claim_status}
                      </span>
                    </div>
                    <p className="text-sm text-foreground">{claim.description}</p>
                    {claim.resolution_notes && (
                      <div className="bg-stone-50 rounded-lg p-3 border border-border">
                        <p className="text-xs font-600 text-muted-foreground mb-1">Résolution</p>
                        <p className="text-sm text-foreground">{claim.resolution_notes}</p>
                      </div>
                    )}
                    {['sent', 'awaiting_response'].includes(claim.claim_status) && (
                      <div className="space-y-2 pt-1">
                        <textarea
                          value={respondingClaim === claim.id ? claimResponse : ''}
                          onChange={(e) => { setRespondingClaim(claim.id); setClaimResponse(e.target.value); }}
                          placeholder="Votre réponse à cette réclamation…"
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRespondToClaim(claim.id, 'accepted')}
                            disabled={respondingClaim === claim.id && !claimResponse.trim()}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-600 transition-colors disabled:opacity-50"
                          >Accepter</button>
                          <button
                            onClick={() => handleRespondToClaim(claim.id, 'refused')}
                            disabled={respondingClaim === claim.id && !claimResponse.trim()}
                            className="px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-600 transition-colors disabled:opacity-50"
                          >Refuser</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <PaginationBar page={claimsPage} total={claimsTotal} pageSize={PAGE_SIZE} onChange={(p) => loadClaims(p)} />
              </>
            )}
          </div>
        )}

        {/* ─── DOCUMENTS TAB ─── */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {/* Upload form */}
            <div className="bg-white rounded-xl border border-border p-4">
              <p className="text-sm font-600 text-foreground mb-3">Ajouter un document</p>
              <form onSubmit={handleUploadDocument} className="space-y-3">
                <input
                  type="text" value={docName} onChange={(e) => setDocName(e.target.value)}
                  placeholder="Nom du document" required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <input
                  type="url" value={docUrl} onChange={(e) => setDocUrl(e.target.value)}
                  placeholder="URL du fichier" required
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <button
                  type="submit" disabled={docUploading}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 disabled:opacity-60 transition-colors"
                >
                  {docUploading ? 'Envoi…' : 'Ajouter le document'}
                </button>
              </form>
            </div>

            {docsLoading ? (
              <Spinner text="Chargement des documents…" />
            ) : documents.length === 0 ? (
              <div className="bg-white rounded-xl border border-border p-8 text-center">
                <p className="text-sm text-muted-foreground">Aucun document pour le moment.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="divide-y divide-border">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 hover:bg-stone-50 transition-colors">
                      <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center shrink-0 text-base">
                        {doc.file_type === 'pdf' ? '📄' : doc.file_type === 'jpg' || doc.file_type === 'png' ? '🖼️' : '📎'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-500 text-foreground truncate">{doc.name}</p>
                        <p className="text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString('fr-FR')}</p>
                      </div>
                      <a
                        href={doc.file_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-primary font-600 hover:underline shrink-0"
                      >Ouvrir</a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── MESSAGES TAB ─── */}
        {activeTab === 'messages' && (
          <div className="space-y-4">
            {messagesLoading ? (
              <Spinner text="Chargement des messages…" />
            ) : (
              <div className="bg-white rounded-xl border border-border overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">Aucun message pour le moment.</p>
                    </div>
                  ) : (
                    messages.map((msg) => (
                      <div key={msg.id} className={`flex ${msg.sender === 'supplier' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                          msg.sender === 'supplier' ?'bg-primary text-primary-foreground' :'bg-stone-100 text-foreground'
                        }`}>
                          {msg.content && <p className="text-sm">{msg.content}</p>}
                          {msg.attachment_url && (
                            <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
                              className={`text-xs underline mt-1 block ${msg.sender === 'supplier' ? 'text-white/80' : 'text-primary'}`}>
                              📎 Pièce jointe
                            </a>
                          )}
                          <p className={`text-[10px] mt-1 ${msg.sender === 'supplier' ? 'text-white/60' : 'text-muted-foreground'}`}>
                            {new Date(msg.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={msgBottomRef} />
                </div>

                {/* Reply form */}
                <div className="border-t border-border p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={msgType}
                      onChange={(e) => setMsgType(e.target.value as any)}
                      className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    >
                      <option value="text">Message</option>
                      <option value="photo">Photo</option>
                      <option value="pdf">PDF</option>
                      <option value="payment_proof">Preuve paiement</option>
                      <option value="order_modification">Modification commande</option>
                      <option value="claim">Réclamation</option>
                      <option value="other">Autre</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setShowMsgAttach(!showMsgAttach)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg border border-border hover:bg-muted"
                    >📎 Pièce jointe</button>
                  </div>

                  {showMsgAttach && (
                    <div className="space-y-2">
                      <input
                        type="url" value={msgAttachUrl} onChange={(e) => setMsgAttachUrl(e.target.value)}
                        placeholder="URL de la pièce jointe"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                      <input
                        type="text" value={msgAttachName} onChange={(e) => setMsgAttachName(e.target.value)}
                        placeholder="Nom du fichier (optionnel)"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  )}

                  <form onSubmit={handleSendMessage} className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Votre message…"
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    />
                    <button
                      type="submit"
                      disabled={sendingMsg || (!replyText.trim() && !msgAttachUrl.trim())}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-600 hover:opacity-90 disabled:opacity-50 transition-colors self-end"
                    >
                      {sendingMsg ? '…' : 'Envoyer'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
