'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SupplierInfo {
  supplierId: string;
  supplierName: string;
}

interface ChatMessage {
  id: string;
  created_at: string;
  content: string | null;
  sender_type: 'admin' | 'supplier';
  message_type: string;
  is_read: boolean;
  order_id: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
}

interface OrderLine {
  id: string;
  product_name: string | null;
  product_ref: string | null;
  product_image_url: string | null;
  qty_ordered: number;
  unit_price: number;
  line_total: number;
}

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  order_status: string;
  total_real_cost: number | null;
  subtotal: number | null;
  currency: string | null;
  supplier_response: string | null;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon', sent: 'Envoyée', awaiting_validation: 'En attente validation',
  modification_requested: 'Modif. demandée', validated: 'Validée',
  payment_pending: 'Paiement en attente', payment_in_progress: 'Paiement en cours',
  paid: 'Payée ✅', payment_received_by_supplier: 'Paiement reçu ✅',
  in_preparation: 'En préparation', in_production: 'En production',
  ready_to_ship: 'Prête à expédier', shipped: 'Expédiée',
  partially_received: 'Reçue partiellement', fully_received: 'Reçue',
  closed: 'Clôturée', cancelled: 'Annulée',
};

const STATUS_COLOR: Record<string, string> = {
  draft: '#9ca3af', sent: '#3b82f6', awaiting_validation: '#f59e0b',
  modification_requested: '#f97316', validated: '#10b981',
  payment_pending: '#f59e0b', payment_in_progress: '#3b82f6',
  paid: '#059669', payment_received_by_supplier: '#059669',
  in_preparation: '#8b5cf6', in_production: '#8b5cf6',
  ready_to_ship: '#14b8a6', shipped: '#6366f1',
  partially_received: '#f59e0b', fully_received: '#059669',
  closed: '#6b7280', cancelled: '#ef4444',
};

const IS_PDF = (url: string) => url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/pdf');
const IS_IMG = (url: string, type?: string | null) =>
  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || (type ?? '').startsWith('image/');
const IS_XLS = (name?: string | null) =>
  /\.(xls|xlsx|csv)$/i.test(name ?? '');

// ─── Main component ───────────────────────────────────────────────────────────

export default function SupplierTokenPortal() {
  const { token } = useParams<{ token: string }>();
  const supabase = useRef(createClient()).current;

  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [info, setInfo] = useState<SupplierInfo | null>(null);
  const [tab, setTab] = useState<'chat' | 'orders'>('chat');

  // Messages
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevAdminMsgCount = useRef(0);
  const [newMsgToast, setNewMsgToast] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderLines, setOrderLines] = useState<Record<string, OrderLine[]>>({});
  const [loadingLines, setLoadingLines] = useState<string | null>(null);

  // Push notifications
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'denied' | 'unsupported'>('default');

  // Compose
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Load supplier info from token ─────────────────────────────────────────

  useEffect(() => {
    if (!token) return;
    fetch(`/api/supplier-portal/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setState('invalid'); return; }
        setInfo({ supplierId: data.supplierId, supplierName: data.supplierName });
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  // ─── Push notification subscription ────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushStatus('unsupported');
      return;
    }
    // Register the service worker if not already registered
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    setPushStatus(Notification.permission as 'default' | 'granted' | 'denied');
  }, []);

  const subscribeToPush = async () => {
    if (!token) return;
    try {
      const permission = await Notification.requestPermission();
      setPushStatus(permission as 'default' | 'granted' | 'denied');
      if (permission !== 'granted') return;

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });

      await fetch(`/api/supplier-portal/${token}/push-subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch {
      // permission denied or push not supported
    }
  };

  // Auto-subscribe if permission already granted
  useEffect(() => {
    if (state !== 'ready' || !token || pushStatus !== 'granted') return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          // Re-save subscription in case it changed
          await fetch(`/api/supplier-portal/${token}/push-subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(existing.toJSON()),
          });
        }
      } catch {}
    })();
  }, [state, token, pushStatus]);

  // ─── Load messages ──────────────────────────────────────────────────────────

  const playNotif = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } catch {}
  };

  // Use API route (admin client) to bypass RLS for anon users
  const loadMessages = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (!isRefresh) setMsgsLoading(true);
    try {
      const res = await fetch(`/api/supplier-portal/${token}/messages`);
      const json = await res.json();
      const msgs = (json.messages ?? []) as ChatMessage[];
      const adminCount = msgs.filter(m => m.sender_type === 'admin').length;
      if (isRefresh && adminCount > prevAdminMsgCount.current) {
        playNotif();
        setNewMsgToast(true);
        setTimeout(() => setNewMsgToast(false), 4000);
      }
      prevAdminMsgCount.current = adminCount;
      setMessages(msgs);
    } catch {
      if (!isRefresh) setMessages([]);
    } finally {
      if (!isRefresh) setMsgsLoading(false);
    }
  }, [token]);

  // ─── Load orders ────────────────────────────────────────────────────────────

  const loadOrders = useCallback(async () => {
    if (!info) return;
    setOrdersLoading(true);
    try {
      const { data } = await supabase
        .from('fo_orders')
        .select('id, order_number, created_at, order_status, total_real_cost, subtotal, currency, supplier_response')
        .eq('supplier_id', info.supplierId)
        .not('order_status', 'eq', 'cancelled')
        .order('created_at', { ascending: false });
      setOrders((data ?? []) as Order[]);
    } catch {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [info, supabase]);

  const toggleOrder = useCallback(async (orderId: string) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderLines[orderId]) return; // already loaded
    setLoadingLines(orderId);
    try {
      const { data } = await supabase
        .from('fo_order_lines')
        .select('id, product_name, product_ref, product_image_url, qty_ordered, unit_price, line_total')
        .eq('order_id', orderId)
        .order('id');
      setOrderLines(prev => ({ ...prev, [orderId]: (data ?? []) as OrderLine[] }));
    } catch { /* silent */ } finally {
      setLoadingLines(null);
    }
  }, [expandedOrderId, orderLines, supabase]);

  useEffect(() => {
    if (!info) return;
    loadMessages();
    loadOrders();
  }, [info, loadMessages, loadOrders]);

  // ─── Scroll to bottom when messages load ───────────────────────────────────

  useEffect(() => {
    if (tab === 'chat') {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
    }
  }, [messages, tab]);

  // ─── Realtime + polling fallback ───────────────────────────────────────────

  useEffect(() => {
    if (!info) return;
    // Realtime (fires if RLS allows anon)
    const ch = supabase
      .channel(`portal_token_${info.supplierId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'supplier_messages', filter: `supplier_id=eq.${info.supplierId}` }, () => loadMessages(true))
      .subscribe();
    // Polling every 20s as guaranteed fallback
    const poll = setInterval(() => loadMessages(true), 20000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [info, supabase, loadMessages]);

  // ─── Send text message ──────────────────────────────────────────────────────

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending || !info) return;
    setSending(true);
    setSendError(null);
    const content = text.trim();
    setText('');
    try {
      const res = await fetch('/api/supplier-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId: info.supplierId, content, messageType: 'text' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      await loadMessages();
    } catch (err: any) {
      setSendError(err.message || 'Erreur envoi');
      setText(content); // restore text so user can retry
    } finally {
      setSending(false);
    }
  };

  // ─── Upload file ────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !info) return;
    e.target.value = '';
    setUploadingFile(true);

    const fd = new FormData();
    fd.append('file', file);
    fd.append('supplierId', info.supplierId);

    const res = await fetch('/api/supplier-messages/upload', { method: 'POST', body: fd });
    const json = await res.json();

    if (!res.ok || !json.url) {
      alert('Erreur lors de l\'envoi du fichier. Veuillez réessayer.');
      setUploadingFile(false);
      return;
    }

    const isImg = IS_IMG(json.url, json.type);
    const isPdf = IS_PDF(json.url);
    const msgType = isImg ? 'photo' : isPdf ? 'pdf' : 'other';

    const msgRes = await fetch('/api/supplier-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: info.supplierId,
        messageType: msgType,
        attachmentUrl: json.url,
        attachmentName: json.name,
        attachmentType: json.type,
      }),
    });

    if (!msgRes.ok) {
      const err = await msgRes.json().catch(() => ({}));
      setSendError(err.error || 'Erreur enregistrement fichier');
    } else {
      await loadMessages();
    }
    setUploadingFile(false);
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // ─── States ─────────────────────────────────────────────────────────────────

  if (state === 'loading') return <Fullscreen><Spinner /></Fullscreen>;
  if (state === 'invalid') return (
    <Fullscreen>
      <div style={{ textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>❌</div>
        <p style={{ fontWeight: 700, fontSize: 18, color: '#111' }}>Lien invalide</p>
        <p style={{ color: '#6b7280', marginTop: 8, fontSize: 14 }}>Ce lien n'existe pas ou a été désactivé.</p>
      </div>
    </Fullscreen>
  );

  const unread = messages.filter(m => m.sender_type === 'admin' && !m.is_read).length;

  // ─── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#f0f2f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', maxWidth: 680, margin: '0 auto', position: 'relative' }}>

      {/* New message toast */}
      {newMsgToast && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: '#075e54', color: '#fff', borderRadius: 20,
          padding: '10px 20px', fontSize: 13, fontWeight: 600,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)', zIndex: 100,
          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          💬 Nouveau message reçu
        </div>
      )}

      {/* Header */}
      <div style={{ background: '#075e54', color: '#fff', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#128c7e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          🏭
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 16, margin: 0, lineHeight: 1.2 }}>Le Monde de l'Esthétique</p>
          <p style={{ fontSize: 12, opacity: 0.8, margin: 0 }}>{info?.supplierName}</p>
        </div>
      </div>

      {/* Push notification banner */}
      {pushStatus === 'default' && (
        <div style={{ background: '#dcfce7', borderBottom: '1px solid #86efac', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <p style={{ flex: 1, margin: 0, fontSize: 13, color: '#166534', fontWeight: 500 }}>
            Recevez les messages même quand l'appli est fermée
          </p>
          <button
            onClick={subscribeToPush}
            style={{ background: '#16a34a', border: 'none', borderRadius: 16, padding: '7px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
          >
            Activer
          </button>
        </div>
      )}
      {pushStatus === 'granted' && (
        <div style={{ background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>🔔</span>
          <p style={{ margin: 0, fontSize: 12, color: '#15803d' }}>Notifications activées</p>
        </div>
      )}
      {pushStatus === 'denied' && (
        <div style={{ background: '#fef9c3', borderBottom: '1px solid #fde047', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 14 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: 12, color: '#92400e' }}>Notifications bloquées — activez-les dans les réglages de votre navigateur</p>
        </div>
      )}

      {/* Tabs */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', flexShrink: 0 }}>
        {(['chat', 'orders'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 400, color: tab === t ? '#075e54' : '#6b7280', fontSize: 14,
            borderBottom: tab === t ? '2px solid #075e54' : '2px solid transparent',
            position: 'relative',
          }}>
            {t === 'chat' ? '💬 Messages' : '📦 Commandes'}
            {t === 'chat' && unread > 0 && (
              <span style={{ position: 'absolute', top: 8, right: 24, background: '#25d366', color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {unread}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Chat tab */}
      {tab === 'chat' && (
        <>
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {msgsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><Spinner /></div>
            ) : messages.length === 0 ? (
              <EmptyChat />
            ) : (
              messages.map(msg => <MessageBubble key={msg.id} msg={msg} formatTime={formatTime} />)
            )}
            <div ref={messagesEndRef} style={{ height: 8 }} />
          </div>

          {/* Error banner */}
          {sendError && (
            <div style={{ background: '#fef2f2', borderTop: '1px solid #fecaca', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 13, color: '#dc2626', flex: 1 }}>{sendError}</span>
              <button onClick={() => setSendError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}>×</button>
            </div>
          )}

          {/* Compose */}
          <form onSubmit={sendText} style={{ background: '#f0f2f5', padding: '8px 12px', display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0, borderTop: '1px solid #e5e7eb' }}>
            {/* File upload button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              title="Joindre un fichier, photo ou facture"
              style={{ width: 40, height: 40, borderRadius: '50%', background: uploadingFile ? '#d1fae5' : '#fff', border: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 18 }}
            >
              {uploadingFile ? <SmallSpinner /> : '📎'}
            </button>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.csv,image/*" onChange={handleFileChange} style={{ display: 'none' }} />

            {/* Text input */}
            <div style={{ flex: 1, background: '#fff', borderRadius: 20, border: '1px solid #e5e7eb', padding: '8px 14px', display: 'flex', alignItems: 'flex-end' }}>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(e as any); } }}
                placeholder="Écrivez votre message…"
                rows={1}
                style={{ flex: 1, border: 'none', outline: 'none', resize: 'none', fontSize: 15, fontFamily: 'inherit', background: 'transparent', lineHeight: 1.4, maxHeight: 100, overflowY: 'auto' }}
              />
            </div>

            {/* Send button */}
            <button
              type="submit"
              disabled={!text.trim() || sending}
              style={{ width: 40, height: 40, borderRadius: '50%', background: (!text.trim() || sending) ? '#e5e7eb' : '#25d366', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: !text.trim() || sending ? 'default' : 'pointer', flexShrink: 0 }}
            >
              {sending ? <SmallSpinner /> : <SendIcon />}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '4px 0 8px', background: '#f0f2f5', flexShrink: 0 }}>
            📎 Facture · PDF · Photo · Excel/CSV acceptés (max 20 Mo)
          </p>
        </>
      )}

      {/* Orders tab */}
      {tab === 'orders' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {ordersLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}><Spinner /></div>
          ) : orders.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: '#9ca3af' }}>
              <p style={{ fontSize: 32, marginBottom: 8 }}>📦</p>
              <p>Aucune commande</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orders.map(o => {
                const isExpanded = expandedOrderId === o.id;
                const lines = orderLines[o.id] ?? [];
                const isLoadingThis = loadingLines === o.id;
                return (
                  <div key={o.id} style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 8px rgba(0,0,0,.08)', overflow: 'hidden' }}>
                    {/* Header — cliquable */}
                    <button
                      onClick={() => toggleOrder(o.id)}
                      style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '14px 16px', textAlign: 'left' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>📦 {o.order_number}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: `${STATUS_COLOR[o.order_status] ?? '#9ca3af'}20`, color: STATUS_COLOR[o.order_status] ?? '#9ca3af' }}>
                            {STATUS_LABEL[o.order_status] ?? o.order_status}
                          </span>
                          <span style={{ fontSize: 14, color: '#9ca3af', transition: 'transform .2s', display: 'inline-block', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                          {new Date(o.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>
                        {(o.total_real_cost ?? o.subtotal) != null && (
                          <p style={{ fontWeight: 700, fontSize: 15, margin: 0, color: '#111' }}>
                            {(o.total_real_cost ?? o.subtotal ?? 0).toFixed(2)} {o.currency ?? 'EUR'}
                          </p>
                        )}
                      </div>
                    </button>

                    {/* Détail expandé */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #f1f5f9', padding: '12px 16px 16px' }}>
                        {/* Bouton voir dans la conversation */}
                        <button
                          onClick={() => setTab('chat')}
                          style={{ width: '100%', marginBottom: 14, padding: '9px 0', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#0369a1', cursor: 'pointer' }}
                        >
                          💬 Voir dans la conversation
                        </button>

                        {isLoadingThis ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}><Spinner /></div>
                        ) : lines.length === 0 ? (
                          <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>Aucun produit trouvé</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {lines.map(line => (
                              <div key={line.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fafafa', borderRadius: 12, padding: 10 }}>
                                {/* Photo grande */}
                                <div style={{ width: 80, height: 80, borderRadius: 10, overflow: 'hidden', flexShrink: 0, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {line.product_image_url ? (
                                    <img
                                      src={line.product_image_url}
                                      alt={line.product_name ?? ''}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span style={{ fontSize: 28 }}>📦</span>
                                  )}
                                </div>
                                {/* Infos */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 700, fontSize: 14, margin: '0 0 3px', lineHeight: 1.3 }}>{line.product_name ?? '—'}</p>
                                  {line.product_ref && <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 6px' }}>Réf : {line.product_ref}</p>}
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: 12, background: '#e0f2fe', color: '#0369a1', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                                      Qté : {line.qty_ordered}
                                    </span>
                                    <span style={{ fontSize: 12, background: '#f0fdf4', color: '#15803d', borderRadius: 8, padding: '2px 8px', fontWeight: 600 }}>
                                      {line.unit_price.toFixed(2)} € / u
                                    </span>
                                    <span style={{ fontSize: 12, background: '#faf5ff', color: '#7e22ce', borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>
                                      = {line.line_total.toFixed(2)} €
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {/* Total */}
                            {(o.total_real_cost ?? o.subtotal) != null && (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #e5e7eb', paddingTop: 10, marginTop: 2 }}>
                                <span style={{ fontWeight: 700, fontSize: 16, color: '#111' }}>
                                  Total : {(o.total_real_cost ?? o.subtotal ?? 0).toFixed(2)} {o.currency ?? 'EUR'}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ msg, formatTime }: { msg: ChatMessage; formatTime: (s: string) => string }) {
  const isSupplier = msg.sender_type === 'supplier';
  const isOrderCard = msg.message_type === 'order_card';
  const [showPreview, setShowPreview] = useState(false);
  const isPdf = msg.attachment_url ? IS_PDF(msg.attachment_url) : false;

  return (
    <div style={{ display: 'flex', justifyContent: isSupplier ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
      <div style={{ maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: isSupplier ? 'flex-end' : 'flex-start', gap: 2 }}>

        {/* Order card badge */}
        {isOrderCard && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, marginBottom: 2 }}>
            📦 Commande
          </span>
        )}

        {/* Order card — rendered outside the bubble */}
        {msg.message_type === 'invoice' && (() => {
          try {
            const inv = JSON.parse(msg.content ?? '{}');
            const statusMap: Record<string, { label: string; bg: string; color: string }> = {
              draft:                        { label: '📝 Brouillon',               bg: '#f1f5f9', color: '#475569' },
              sent:                         { label: '📤 Envoyée',                 bg: '#dbeafe', color: '#1e40af' },
              awaiting_validation:          { label: '⏳ En attente validation',   bg: '#fef3c7', color: '#92400e' },
              validated:                    { label: '✅ Validée',                 bg: '#d1fae5', color: '#065f46' },
              modification_requested:       { label: '🔄 Modif. demandée',         bg: '#ffedd5', color: '#9a3412' },
              payment_pending:              { label: '💳 Paiement en attente',     bg: '#fef3c7', color: '#92400e' },
              payment_in_progress:          { label: '💳 Paiement en cours',       bg: '#dbeafe', color: '#1e40af' },
              paid:                         { label: '💰 Payée',                   bg: '#d1fae5', color: '#065f46' },
              payment_received_by_supplier: { label: '✅ Paiement reçu',           bg: '#d1fae5', color: '#065f46' },
              in_preparation:               { label: '📋 En préparation',          bg: '#e0e7ff', color: '#3730a3' },
              in_production:                { label: '🏭 En production',           bg: '#e0e7ff', color: '#3730a3' },
              ready_to_ship:                { label: '📦 Prête à expédier',        bg: '#ede9fe', color: '#5b21b6' },
              shipped:                      { label: '🚢 En chemin',               bg: '#cffafe', color: '#164e63' },
              partially_received:           { label: '📦 Partiellement reçue',     bg: '#ccfbf1', color: '#134e4a' },
              fully_received:               { label: '✅ Reçue',                   bg: '#d1fae5', color: '#065f46' },
              costs_recorded:               { label: '📊 Coûts enregistrés',       bg: '#f1f5f9', color: '#334155' },
              stock_integrated:             { label: '🏪 Stock intégré',           bg: '#d1fae5', color: '#065f46' },
              closed:                       { label: '🔒 Clôturée',                bg: '#f1f5f9', color: '#475569' },
              suspended:                    { label: '⏸️ Suspendue',              bg: '#ffedd5', color: '#9a3412' },
              cancelled:                    { label: '❌ Annulée',                 bg: '#fee2e2', color: '#991b1b' },
            };
            const s = statusMap[inv.status] ?? { label: inv.status ?? '—', bg: '#f1f5f9', color: '#475569' };
            return (
              <div style={{ borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', overflow: 'hidden', minWidth: 220, boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
                <div style={{ padding: '8px 12px', background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>📦</span>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, flex: 1 }}>{inv.numero || 'Commande'}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.color }}>{s.label}</span>
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: 12, color: '#64748b' }}>📅 {inv.date ? new Date(inv.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</p>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#7c3aed' }}>{typeof inv.totalTTC === 'number' ? inv.totalTTC.toFixed(2) : '—'} €</p>
                </div>
              </div>
            );
          } catch {
            return <p style={{ margin: 0, lineHeight: 1.5 }}>{msg.content}</p>;
          }
        })()}

        {msg.message_type !== 'invoice' && (
        <div style={{
          padding: '8px 12px',
          borderRadius: isSupplier ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: isOrderCard ? '#f0fdf4' : isSupplier ? '#dcf8c6' : '#fff',
          border: isOrderCard ? '1px solid #bbf7d0' : '1px solid transparent',
          boxShadow: '0 1px 2px rgba(0,0,0,.1)',
          fontSize: 14, color: '#111', wordBreak: 'break-word', whiteSpace: 'pre-wrap',
          width: showPreview ? 300 : undefined,
        }}>
          {msg.content && <p style={{ margin: 0, lineHeight: 1.5 }}>{msg.content}</p>}

          {/* Attachment */}
          {msg.attachment_url && (
            <div style={{ marginTop: msg.content ? 8 : 0 }}>
              {IS_IMG(msg.attachment_url, msg.attachment_type) ? (
                <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                  <img src={msg.attachment_url} alt={msg.attachment_name ?? 'Image'} style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                </a>
              ) : (
                <>
                  <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" download={msg.attachment_name ?? undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, textDecoration: 'none', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: 24 }}>
                      {isPdf ? '📄' : IS_XLS(msg.attachment_name) ? '📊' : '📎'}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {msg.attachment_name ?? 'Fichier'}
                      </p>
                      <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Appuyer pour télécharger</p>
                    </div>
                  </a>
                  {/* PDF inline preview toggle */}
                  {isPdf && (
                    <button
                      onClick={() => setShowPreview(p => !p)}
                      style={{ marginTop: 6, fontSize: 12, color: '#075e54', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
                    >
                      {showPreview ? '▲ Masquer l\'aperçu' : '👁 Voir l\'aperçu'}
                    </button>
                  )}
                  {isPdf && showPreview && (
                    <iframe
                      src={`${msg.attachment_url}#toolbar=0`}
                      style={{ marginTop: 8, width: '100%', height: 400, borderRadius: 8, border: '1px solid #e2e8f0', display: 'block' }}
                      title={msg.attachment_name ?? 'Aperçu PDF'}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>
        )}
        <span style={{ fontSize: 11, color: '#9ca3af', paddingLeft: 4, paddingRight: 4 }}>{formatTime(msg.created_at)}</span>
      </div>
    </div>
  );
}

function EmptyChat() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, paddingTop: 60, color: '#9ca3af' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
      <p style={{ fontSize: 15, margin: 0, fontWeight: 600 }}>Pas encore de message</p>
      <p style={{ fontSize: 13, marginTop: 4 }}>Envoyez votre premier message ou déposez votre facture ci-dessous.</p>
    </div>
  );
}

function Fullscreen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f2f5', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 32, height: 32, border: '3px solid #d1fae5', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function SmallSpinner() {
  return (
    <div style={{ width: 18, height: 18, border: '2px solid #d1fae5', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
  );
}

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}
