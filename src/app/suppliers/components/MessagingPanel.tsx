'use client';

import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client'; // used only for realtime subscription

interface Message {
  id: string;
  supplierId: string;
  orderId?: string | null;
  sender: 'store' | 'supplier';
  content?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  messageType: 'text' | 'photo' | 'pdf' | 'payment_proof' | 'claim' | 'order_modification' | 'order_card' | 'invoice' | 'other';
  isRead: boolean;
  createdAt: string;
}

interface FoOrderRef {
  id: string;
  order_number: string;
  order_status: string;
  subtotal: number;
  total_real_cost: number | null;
  created_at: string;
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
  /** When set (inside an order detail), enables "Utiliser comme facture finale"
   *  on ALL supplier attachments — even those without order_id on the message. */
  currentOrderId?: string;
  /** Called after a final invoice is selected so the parent can navigate to Réception */
  onInvoiceSelected?: () => void;
}

const IS_IMG = (url: string, type?: string | null) =>
  /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) || (type ?? '').startsWith('image/');
const IS_PDF = (url: string) => url.toLowerCase().includes('.pdf') || url.toLowerCase().includes('/pdf');
const IS_XLS = (name?: string | null) => /\.(xls|xlsx|csv)$/i.test(name ?? '');

export default function MessagingPanel({ supplierId, supplierName, orders = [], onRefresh, currentOrderId, onInvoiceSelected }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(currentOrderId ?? '');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [uploadingFile, setUploadingFile] = useState(false);

  // PDF preview toggled per message id
  const [pdfPreviews, setPdfPreviews] = useState<Set<string>>(new Set());
  const togglePdfPreview = (id: string) =>
    setPdfPreviews(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  // "Use as final invoice" state
  const [usingInvoice, setUsingInvoice] = useState<string | null>(null);
  const [usedInvoice, setUsedInvoice] = useState<string | null>(null);
  const [invoiceJustSelected, setInvoiceJustSelected] = useState(false);

  // Invoice picker state
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [invoices, setInvoices] = useState<FoOrderRef[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/supplier-messages?supplierId=${supplierId}`);
      const json = await res.json();
      if (json.messages) {
        setMessages(json.messages.map((row: any) => ({
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
      const res = await fetch('/api/supplier-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          content: text,
          messageType: 'text',
          orderId: selectedOrderId || null,
          sender: 'store',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur envoi');
      }
      setInput('');
      setSelectedOrderId('');
      await loadMessages();
      onRefresh?.();
    } catch (err: any) {
      console.error('[MessagingPanel] send error:', err);
      alert(`Erreur : ${err.message}`);
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

      const msgRes = await fetch('/api/supplier-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          messageType: msgType,
          orderId: selectedOrderId || null,
          sender: 'store',
          attachmentUrl: json.url,
          attachmentName: json.name,
          attachmentType: json.type,
        }),
      });
      if (!msgRes.ok) throw new Error('Erreur enregistrement pièce jointe');

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
    if (!msg.attachmentUrl) return;
    // Use message's own order_id, or fall back to the currentOrderId context
    const targetOrderId = msg.orderId || currentOrderId;
    if (!targetOrderId) return;

    setUsingInvoice(msg.id);
    try {
      const res = await fetch(`/api/fo-orders/${targetOrderId}/use-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceUrl: msg.attachmentUrl, invoiceName: msg.attachmentName }),
      });
      if (res.ok) {
        setUsedInvoice(msg.id);
        setInvoiceJustSelected(true);
        onRefresh?.();
        onInvoiceSelected?.();
      }
    } catch { /* non-blocking */ } finally {
      setUsingInvoice(null);
    }
  };

  // ─── Invoice picker ─────────────────────────────────────────────────────────

  const handleOpenInvoicePicker = async () => {
    setShowInvoicePicker(true);
    if (invoices.length > 0) return;
    setLoadingInvoices(true);
    try {
      const { data } = await supabase
        .from('fo_orders')
        .select('id, order_number, order_status, subtotal, total_real_cost, created_at')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false })
        .limit(100);
      setInvoices(data ?? []);
    } catch {
      setInvoices([]);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleSendInvoice = async (order: FoOrderRef) => {
    setSendingInvoice(true);
    try {
      const total = order.total_real_cost ?? order.subtotal;
      const content = JSON.stringify({
        type: 'invoice',
        id: order.id,
        numero: order.order_number,
        status: order.order_status,
        totalTTC: total,
        date: order.created_at,
      });
      const res = await fetch('/api/supplier-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId,
          content,
          messageType: 'invoice',
          orderId: selectedOrderId || null,
          sender: 'store',
        }),
      });
      if (!res.ok) throw new Error('Erreur envoi facture');
      setShowInvoicePicker(false);
      setInvoiceSearch('');
      setSelectedOrderId('');
      await loadMessages();
      onRefresh?.();
    } catch (err: any) {
      alert(`Erreur : ${err.message}`);
    } finally {
      setSendingInvoice(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  const unreadCount = messages.filter(m => m.sender === 'supplier' && !m.isRead).length;
  const orderRef = (orderId: string | null | undefined) => orders.find(o => o.id === orderId);
  // A supplier attachment can become the final invoice if:
  // - it has its own order_id, OR
  // - we're already inside a specific order context (currentOrderId)
  const canUseMsg = (msg: Message) =>
    !!msg.attachmentUrl &&
    msg.sender === 'supplier' &&
    !!(msg.orderId || currentOrderId);

  return (
    <div className="bg-white border border-border rounded-xl shadow-card flex flex-col" style={{ height: 680 }}>

      {/* ── Bannière "Facture finale sélectionnée → aller à Réception" ── */}
      {invoiceJustSelected && (
        <div className="flex items-center gap-3 px-4 py-3 bg-violet-50 border-b border-violet-200 shrink-0">
          <span className="text-lg">✅</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-600 text-violet-800">Facture finale enregistrée</p>
            <p className="text-xs text-violet-600">Allez dans l'onglet <strong>Réception</strong> pour saisir les prix réels et valider la commande.</p>
          </div>
          <button
            onClick={() => setInvoiceJustSelected(false)}
            className="shrink-0 text-violet-400 hover:text-violet-600 transition-colors"
          >
            <Icon name="XMarkIcon" size={14} />
          </button>
        </div>
      )}

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
            const canUseAsInvoice = canUseMsg(msg);
            const alreadyUsed = usedInvoice === msg.id;
            const isPdfMsg = msg.attachmentUrl ? IS_PDF(msg.attachmentUrl) : false;

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
                    {/* Invoice card */}
                    {msg.messageType === 'invoice' && (() => {
                      try {
                        const inv = JSON.parse(msg.content ?? '{}');
                        const statusMap: Record<string, { label: string; cls: string }> = {
                          draft:                      { label: '📝 Brouillon',               cls: 'text-gray-600 bg-gray-50 border-gray-200' },
                          sent:                       { label: '📤 Envoyée',                 cls: 'text-blue-600 bg-blue-50 border-blue-200' },
                          awaiting_validation:        { label: '⏳ En attente validation',   cls: 'text-amber-700 bg-amber-50 border-amber-200' },
                          validated:                  { label: '✅ Validée',                 cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                          modification_requested:     { label: '🔄 Modif. demandée',         cls: 'text-orange-700 bg-orange-50 border-orange-200' },
                          payment_pending:            { label: '💳 Paiement en attente',     cls: 'text-amber-700 bg-amber-50 border-amber-200' },
                          payment_in_progress:        { label: '💳 Paiement en cours',       cls: 'text-blue-700 bg-blue-50 border-blue-200' },
                          paid:                       { label: '💰 Payée',                   cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                          payment_received_by_supplier: { label: '✅ Paiement reçu',         cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                          in_preparation:             { label: '📋 En préparation',          cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                          in_production:              { label: '🏭 En production',           cls: 'text-indigo-700 bg-indigo-50 border-indigo-200' },
                          ready_to_ship:              { label: '📦 Prête à expédier',        cls: 'text-violet-700 bg-violet-50 border-violet-200' },
                          shipped:                    { label: '🚢 En chemin',               cls: 'text-cyan-700 bg-cyan-50 border-cyan-200' },
                          partially_received:         { label: '📦 Partiellement reçue',     cls: 'text-teal-700 bg-teal-50 border-teal-200' },
                          fully_received:             { label: '✅ Reçue',                   cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                          costs_recorded:             { label: '📊 Coûts enregistrés',       cls: 'text-slate-700 bg-slate-50 border-slate-200' },
                          stock_integrated:           { label: '🏪 Stock intégré',           cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                          closed:                     { label: '🔒 Clôturée',                cls: 'text-gray-600 bg-gray-50 border-gray-200' },
                          suspended:                  { label: '⏸️ Suspendue',              cls: 'text-orange-700 bg-orange-50 border-orange-200' },
                          cancelled:                  { label: '❌ Annulée',                 cls: 'text-red-700 bg-red-50 border-red-200' },
                        };
                        const s = statusMap[inv.status] ?? { label: inv.status ?? '—', cls: 'text-gray-600 bg-gray-50 border-gray-200' };
                        return (
                          <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden min-w-[220px]">
                            <div className="px-3 py-2 bg-gradient-to-r from-violet-600 to-violet-500 flex items-center gap-2">
                              <span className="text-white text-base">📦</span>
                              <span className="text-white font-700 text-sm">{inv.numero || 'Commande'}</span>
                              <span className={`ml-auto text-[10px] font-600 px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>
                            </div>
                            <div className="px-3 py-2.5 space-y-1">
                              <p className="text-xs text-muted-foreground">
                                📅 {inv.date ? new Date(inv.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}
                              </p>
                              <p className="text-base font-700 text-violet-700 mt-1">
                                {typeof inv.totalTTC === 'number' ? inv.totalTTC.toFixed(2) : '—'} €
                              </p>
                            </div>
                          </div>
                        );
                      } catch {
                        return <p className="whitespace-pre-wrap">{msg.content}</p>;
                      }
                    })()}

                    {msg.messageType !== 'invoice' && msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}

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
                          <>
                            <a
                              href={msg.attachmentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-500 hover:opacity-80 transition-opacity ${isStore ? 'bg-white/15 text-white' : 'bg-white border border-border text-foreground'}`}
                            >
                              <span className="text-lg">
                                {isPdfMsg ? '📄' : IS_XLS(msg.attachmentName) ? '📊' : '📎'}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-600">{msg.attachmentName ?? 'Fichier'}</p>
                                <p className="opacity-70">Cliquer pour ouvrir</p>
                              </div>
                            </a>
                            {isPdfMsg && (
                              <button
                                onClick={() => togglePdfPreview(msg.id)}
                                className="mt-1.5 text-[11px] font-600 text-primary hover:underline bg-transparent border-none cursor-pointer p-0 block"
                              >
                                {pdfPreviews.has(msg.id) ? '▲ Masquer l\'aperçu' : '👁 Aperçu de la facture'}
                              </button>
                            )}
                            {isPdfMsg && pdfPreviews.has(msg.id) && (
                              <iframe
                                src={`${msg.attachmentUrl}#toolbar=0`}
                                className="mt-2 w-full rounded-lg border border-border"
                                style={{ height: 420 }}
                                title={msg.attachmentName ?? 'Aperçu PDF'}
                              />
                            )}
                          </>
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

          {/* Invoice picker button */}
          <button
            type="button"
            onClick={handleOpenInvoicePicker}
            disabled={sendingInvoice}
            title="Envoyer une facture dans la conversation"
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-border text-muted-foreground hover:bg-violet-50 hover:border-violet-300 hover:text-violet-600 transition-colors shrink-0"
          >
            <span className="text-base leading-none">🧾</span>
          </button>

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
          📎 Fichier (PDF · Image · Excel, max 20 Mo) · 🧾 Envoyer une facture · Shift+Entrée saut de ligne
        </p>
      </div>

      {/* ── Invoice picker modal ── */}
      {showInvoicePicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowInvoicePicker(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xl">📦</span>
                <h3 className="font-700 text-foreground">Envoyer une commande fournisseur</h3>
              </div>
              <button
                onClick={() => setShowInvoicePicker(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-border">
              <input
                type="text"
                placeholder="Rechercher par numéro de commande…"
                value={invoiceSearch}
                onChange={e => setInvoiceSearch(e.target.value)}
                autoFocus
                className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
              {loadingInvoices ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (() => {
                const q = invoiceSearch.toLowerCase();
                const filtered = invoices.filter(f =>
                  !q || f.order_number.toLowerCase().includes(q)
                );
                if (filtered.length === 0) {
                  return <p className="text-center text-muted-foreground text-sm py-8">Aucune commande trouvée</p>;
                }
                const STATUS_LABELS: Record<string, string> = {
                  draft: '📝 Brouillon', sent: '📤 Envoyée', awaiting_validation: '⏳ En attente validation',
                  validated: '✅ Validée', modification_requested: '🔄 Modif. demandée',
                  payment_pending: '💳 Paiement en attente', payment_in_progress: '💳 Paiement en cours',
                  paid: '💰 Payée', payment_received_by_supplier: '✅ Paiement reçu',
                  in_preparation: '📋 En préparation', in_production: '🏭 En production',
                  ready_to_ship: '📦 Prête à expédier', shipped: '🚢 En chemin',
                  partially_received: '📦 Partiellement reçue', fully_received: '✅ Reçue',
                  costs_recorded: '📊 Coûts enregistrés', stock_integrated: '🏪 Stock intégré',
                  closed: '🔒 Clôturée', suspended: '⏸️ Suspendue', cancelled: '❌ Annulée',
                };
                const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;
                return filtered.map(f => (
                  <button
                    key={f.id}
                    onClick={() => handleSendInvoice(f)}
                    disabled={sendingInvoice}
                    className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:border-violet-300 hover:bg-violet-50 transition-colors disabled:opacity-50"
                  >
                    <span className="text-2xl shrink-0">📦</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-600 text-sm text-foreground truncate">{f.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(f.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-700 text-violet-700 text-sm">{(f.total_real_cost ?? f.subtotal).toFixed(2)} €</p>
                      <p className="text-[10px] text-muted-foreground">{statusLabel(f.order_status)}</p>
                    </div>
                  </button>
                ));
              })()}
            </div>

            {sendingInvoice && (
              <div className="flex items-center justify-center gap-2 px-5 py-3 border-t border-border text-sm text-violet-600">
                <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Envoi en cours…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
