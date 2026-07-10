'use client';

import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  supplierId: string;
  orderId?: string | null;
  sender: 'store' | 'supplier';
  content?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  messageType: 'text' | 'photo' | 'pdf' | 'payment_proof' | 'claim' | 'order_modification' | 'order_card' | 'other';
  isRead: boolean;
  createdAt: string;
}

interface Order {
  id: string;
  order_number: string;
}

interface Props {
  supplierId: string;
  supplierName?: string;
  orders?: Order[];
  onRefresh?: () => void;
}

const IS_IMG = (url: string, type?: string | null) =>
  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || (type ?? '').startsWith('image/');
const IS_PDF = (url: string) => url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/pdf');
const IS_XLS = (name?: string | null) => /\.(xls|xlsx|csv)$/i.test(name ?? '');

export default function MessagingPanel({ supplierId, supplierName, orders = [], onRefresh }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  // "Use as final invoice" state
  const [usingInvoice, setUsingInvoice] = useState<string | null>(null);
  const [usedInvoice, setUsedInvoice] = useState<string | null>(null);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('supplier_messages')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: true });

      if (data) {
        setMessages(data.map((row: any) => ({
          id: row.id,
          supplierId: row.supplier_id,
          orderId: row.order_id,
          sender: row.sender,
          content: row.content,
          attachmentUrl: row.attachment_url,
          attachmentType: row.attachment_type,
          attachmentName: row.attachment_name,
          messageType: row.message_type || 'text',
          isRead: row.is_read,
          createdAt: row.created_at,
        })));
        // Mark supplier messages as read
        const unreadIds = data
          .filter((m: any) => m.sender === 'supplier' && !m.is_read)
          .map((m: any) => m.id);
        if (unreadIds.length > 0) {
          await supabase.from('supplier_messages').update({ is_read: true }).in('id', unreadIds);
        }
      }
    } catch (err) {
      console.error('[MessagingPanel] loadMessages error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    const channel = supabase
      .channel(`supplier_messages_${supplierId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'supplier_messages', filter: `supplier_id=eq.${supplierId}` }, () => loadMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supplierId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Send text message ──────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await supabase.from('supplier_messages').insert({
        supplier_id: supplierId,
        sender: 'store',
        sender_type: 'admin',
        content: text,
        message_type: 'text',
        is_read: false,
        order_id: selectedOrderId || null,
      });
      setInput('');
      setSelectedOrderId('');
      await loadMessages();
      onRefresh?.();
    } catch (err) {
      console.error('[MessagingPanel] send error:', err);
    } finally {
      setSending(false);
    }
  };

  // ─── Upload file ────────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('supplierId', supplierId);

      const res = await fetch('/api/supplier-messages/upload', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error || 'Erreur upload');

      const isImg = IS_IMG(json.url, json.type);
      const isPdf = IS_PDF(json.url);
      const msgType = isImg ? 'photo' : isPdf ? 'pdf' : 'other';

      await supabase.from('supplier_messages').insert({
        supplier_id: supplierId,
        sender: 'store',
        sender_type: 'admin',
        content: null,
        message_type: msgType,
        is_read: false,
        order_id: selectedOrderId || null,
        attachment_url: json.url,
        attachment_name: json.name,
        attachment_type: json.type,
      });

      setSelectedOrderId('');
      await loadMessages();
      onRefresh?.();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  // ─── Use as final invoice ───────────────────────────────────────────────────

  const handleUseAsInvoice = async (msg: Message) => {
    if (!msg.attachmentUrl || !msg.orderId) return;
    setUsingInvoice(msg.id);
    try {
      const res = await fetch(`/api/fo-orders/${msg.orderId}/use-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceUrl: msg.attachmentUrl, invoiceName: msg.attachmentName }),
      });
      if (res.ok) {
        setUsedInvoice(msg.id);
        onRefresh?.();
      }
    } catch { /* non-blocking */ } finally {
      setUsingInvoice(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const unreadCount = messages.filter(m => m.sender === 'supplier' && !m.isRead).length;
  const orderRef = (orderId: string | null | undefined) => orders.find(o => o.id === orderId);

  return (
    <div className="bg-white border border-border rounded-xl shadow-card flex flex-col" style={{ height: 680 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="ChatBubbleLeftRightIcon" size={18} className="text-primary" />
          <h3 className="font-600 text-foreground">Messagerie {supplierName ? `— ${supplierName}` : ''}</h3>
          {unreadCount > 0 && (
            <span className="text-[10px] font-700 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">{unreadCount}</span>
          )}
          <span className="text-xs text-muted-foreground">({messages.length} message{messages.length !== 1 ? 's' : ''})</span>
        </div>
        <button onClick={loadMessages} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors" title="Actualiser">
          <Icon name="ArrowPathIcon" size={15} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Icon name="ChatBubbleLeftRightIcon" size={40} className="text-muted-foreground mb-3" />
            <p className="text-muted-foreground text-sm">Aucun message pour l'instant</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isStore = msg.sender === 'store';
            const isOrderCard = msg.messageType === 'order_card';
            const ref = orderRef(msg.orderId);
            const hasAttachment = !!msg.attachmentUrl;
            const canUseAsInvoice = hasAttachment && msg.sender === 'supplier' && !!msg.orderId;
            const alreadyUsed = usedInvoice === msg.id;

            return (
              <div key={msg.id} className={`flex ${isStore ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[78%] ${isStore ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  {!isStore && (
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                        <Icon name="TruckIcon" size={12} className="text-amber-600" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Fournisseur</span>
                    </div>
                  )}

                  {/* Order card badge */}
                  {isOrderCard && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-600 self-start mb-0.5">
                      📦 Commande envoyée
                    </span>
                  )}

                  {/* Order link badge */}
                  {ref && !isOrderCard && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-500">
                      📦 {ref.order_number}
                    </span>
                  )}

                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isOrderCard
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
                      : isStore
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

                    {/* File attachment */}
                    {msg.attachmentUrl && (
                      <div className={msg.content ? 'mt-2' : ''}>
                        {IS_IMG(msg.attachmentUrl, msg.attachmentType) ? (
                          <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.attachmentUrl}
                              alt={msg.attachmentName ?? 'Image'}
                              className="max-w-full rounded-lg max-h-40 object-cover border border-white/20"
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-500 hover:opacity-80 transition-opacity ${isStore ? 'bg-white/15 text-white' : 'bg-white border border-border text-foreground'}`}
                          >
                            <span className="text-lg">
                              {IS_PDF(msg.attachmentUrl) ? '📄' : IS_XLS(msg.attachmentName) ? '📊' : '📎'}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-600">{msg.attachmentName ?? 'Fichier'}</p>
                              <p className="opacity-70">Cliquer pour ouvrir</p>
                            </div>
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* "Use as final invoice" button — only on supplier file messages linked to an order */}
                  {canUseAsInvoice && (
                    <button
                      onClick={() => handleUseAsInvoice(msg)}
                      disabled={!!usingInvoice || alreadyUsed}
                      className={`text-[10px] font-600 px-2 py-0.5 rounded-full border transition-colors ${
                        alreadyUsed
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                          : 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100'
                      } disabled:opacity-60`}
                    >
                      {alreadyUsed ? '✅ Facture finale enregistrée' : usingInvoice === msg.id ? '…' : '✅ Utiliser comme facture finale'}
                    </button>
                  )}

                  <span className="text-[11px] text-muted-foreground px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose area */}
      <div className="px-5 py-3.5 border-t border-border shrink-0">
        {/* Order link (optional) */}
        {orders.length > 0 && (
          <div className="mb-2">
            <select
              value={selectedOrderId}
              onChange={e => setSelectedOrderId(e.target.value)}
              className="w-full px-3 py-1.5 text-xs border border-border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 text-muted-foreground"
            >
              <option value="">— Lier à une commande (optionnel) —</option>
              {orders.map(o => <option key={o.id} value={o.id}>{o.order_number}</option>)}
            </select>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* File upload button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingFile}
            title="Joindre un fichier (PDF, image, Excel…)"
            className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors shrink-0 ${uploadingFile ? 'border-primary/40 bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted'}`}
          >
            {uploadingFile
              ? <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              : <Icon name="PaperClipIcon" size={16} />
            }
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.csv,image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Text input */}
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écrivez votre message… (Entrée pour envoyer)"
              rows={2}
              className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Icon name="PaperAirplaneIcon" size={16} />
            }
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          📎 PDF · Image · Excel/CSV (max 20 Mo) · Shift+Entrée saut de ligne
        </p>
      </div>
    </div>
  );
}
