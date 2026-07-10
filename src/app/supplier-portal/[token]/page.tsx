'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Compose
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
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

  // ─── Load messages ──────────────────────────────────────────────────────────

  // Use API route (admin client) to bypass RLS for anon users
  const loadMessages = useCallback(async () => {
    if (!token) return;
    setMsgsLoading(true);
    try {
      const res = await fetch(`/api/supplier-portal/${token}/messages`);
      const json = await res.json();
      setMessages((json.messages ?? []) as ChatMessage[]);
    } catch {
      setMessages([]);
    } finally {
      setMsgsLoading(false);
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

  // ─── Real-time (polling fallback — real-time requires anon RLS) ────────────

  useEffect(() => {
    if (!info) return;
    // Try real-time; if RLS blocks it, polling every 5s as fallback
    const ch = supabase
      .channel(`portal_token_${info.supplierId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'supplier_messages', filter: `supplier_id=eq.${info.supplierId}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [info, supabase, loadMessages]);

  // ─── Send text message ──────────────────────────────────────────────────────

  const sendText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending || !info) return;
    setSending(true);
    const content = text.trim();
    setText('');
    await fetch('/api/supplier-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplierId: info.supplierId, content, messageType: 'text' }),
    });
    await loadMessages();
    setSending(false);
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

    await fetch('/api/supplier-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierId: info.supplierId,
        content: null,
        messageType: msgType,
        attachmentUrl: json.url,
        attachmentName: json.name,
        attachmentType: json.type,
      }),
    });

    await loadMessages();
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orders.map(o => (
                <div key={o.id} style={{ background: '#fff', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{o.order_number}</p>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 20, background: `${STATUS_COLOR[o.order_status] ?? '#9ca3af'}20`, color: STATUS_COLOR[o.order_status] ?? '#9ca3af' }}>
                      {STATUS_LABEL[o.order_status] ?? o.order_status}
                    </span>
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
                </div>
              ))}
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

  return (
    <div style={{ display: 'flex', justifyContent: isSupplier ? 'flex-end' : 'flex-start', marginBottom: 2 }}>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: isSupplier ? 'flex-end' : 'flex-start', gap: 2 }}>

        {/* Order card badge */}
        {isOrderCard && (
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#dbeafe', color: '#1d4ed8', fontWeight: 600, marginBottom: 2 }}>
            📦 Commande
          </span>
        )}

        <div style={{
          padding: '8px 12px',
          borderRadius: isSupplier ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: isOrderCard ? '#f0fdf4' : isSupplier ? '#dcf8c6' : '#fff',
          border: isOrderCard ? '1px solid #bbf7d0' : '1px solid transparent',
          boxShadow: '0 1px 2px rgba(0,0,0,.1)',
          fontSize: 14,
          color: '#111',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}>
          {msg.content && <p style={{ margin: 0, lineHeight: 1.5 }}>{msg.content}</p>}

          {/* Attachment */}
          {msg.attachment_url && (
            <div style={{ marginTop: msg.content ? 8 : 0 }}>
              {IS_IMG(msg.attachment_url, msg.attachment_type) ? (
                <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
                  <img src={msg.attachment_url} alt={msg.attachment_name ?? 'Image'} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'cover', display: 'block' }} />
                </a>
              ) : (
                <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer" download={msg.attachment_name ?? undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, textDecoration: 'none', border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 24 }}>
                    {IS_PDF(msg.attachment_url) ? '📄' : IS_XLS(msg.attachment_name) ? '📊' : '📎'}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.attachment_name ?? 'Fichier'}
                    </p>
                    <p style={{ fontSize: 11, color: '#64748b', margin: 0 }}>Appuyer pour télécharger</p>
                  </div>
                </a>
              )}
            </div>
          )}
        </div>
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
