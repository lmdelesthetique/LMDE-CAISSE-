'use client';

import React, { useState, useRef, useEffect } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';

interface Message {
  id: string;
  supplierId: string;
  orderId?: string | null;
  productId?: string | null;
  sender: 'store' | 'supplier';
  content?: string | null;
  attachmentUrl?: string | null;
  attachmentType?: string | null;
  attachmentName?: string | null;
  messageType: 'text' | 'photo' | 'pdf' | 'payment_proof' | 'claim' | 'order_modification' | 'other';
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

const MESSAGE_TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  text: { label: 'Message', icon: 'ChatBubbleLeftIcon', color: 'text-blue-600' },
  photo: { label: 'Photo', icon: 'PhotoIcon', color: 'text-emerald-600' },
  pdf: { label: 'PDF', icon: 'DocumentIcon', color: 'text-red-600' },
  payment_proof: { label: 'Preuve paiement', icon: 'CreditCardIcon', color: 'text-teal-600' },
  claim: { label: 'Réclamation', icon: 'ExclamationCircleIcon', color: 'text-orange-600' },
  order_modification: { label: 'Modification commande', icon: 'PencilSquareIcon', color: 'text-purple-600' },
  other: { label: 'Autre', icon: 'PaperClipIcon', color: 'text-gray-600' },
};

export default function MessagingPanel({ supplierId, supplierName, orders = [], onRefresh }: Props) {
  const supabase = createClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [messageType, setMessageType] = useState<Message['messageType']>('text');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentName, setAttachmentName] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [showAttachPanel, setShowAttachPanel] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

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
          productId: row.product_id,
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
        const unreadIds = data.filter((m: any) => m.sender === 'supplier' && !m.is_read).map((m: any) => m.id);
        if (unreadIds.length > 0) {
          await supabase.from('supplier_messages').update({ is_read: true }).in('id', unreadIds);
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();
    // Real-time subscription
    const channel = supabase
      .channel(`supplier_messages_${supplierId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'supplier_messages',
        filter: `supplier_id=eq.${supplierId}`,
      }, () => { loadMessages(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supplierId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    const hasAttachment = attachmentUrl.trim() !== '';
    if (!text && !hasAttachment) return;
    if (sending) return;
    setSending(true);
    try {
      const payload: any = {
        supplier_id: supplierId,
        sender: 'store',
        sender_type: 'admin',
        content: text || null,
        message_type: messageType,
        is_read: false,
        order_id: selectedOrderId || null,
      };
      if (hasAttachment) {
        payload.attachment_url = attachmentUrl.trim();
        payload.attachment_type = messageType === 'photo' ? 'image' : messageType === 'pdf' ? 'pdf' : 'file';
        payload.attachment_name = attachmentName.trim() || 'Pièce jointe';
      }
      await supabase.from('supplier_messages').insert(payload);
      setInput('');
      setAttachmentUrl('');
      setAttachmentName('');
      setMessageType('text');
      setSelectedOrderId('');
      setShowAttachPanel(false);
      await loadMessages();
      onRefresh?.();
    } catch (err) {
      console.error('Error sending message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  const isImageUrl = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);

  const unreadCount = messages.filter((m) => m.sender === 'supplier' && !m.isRead).length;

  return (
    <div className="bg-white border border-border rounded-xl shadow-card flex flex-col" style={{ height: '680px' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Icon name="ChatBubbleLeftRightIcon" size={18} className="text-primary" />
          <h3 className="font-600 text-foreground">Messagerie {supplierName ? `— ${supplierName}` : 'fournisseur'}</h3>
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
            <p className="text-muted-foreground text-xs mt-1">Envoyez votre premier message ci-dessous</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isStore = msg.sender === 'store';
            const typeInfo = MESSAGE_TYPE_LABELS[msg.messageType] || MESSAGE_TYPE_LABELS.text;
            const orderRef = orders.find((o) => o.id === msg.orderId);
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
                  {/* Order link badge */}
                  {orderRef && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-500 self-end">
                      📦 {orderRef.order_number}
                    </span>
                  )}
                  {/* Message type badge (non-text) */}
                  {msg.messageType !== 'text' && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full bg-muted font-500 ${typeInfo.color} self-${isStore ? 'end' : 'start'}`}>
                      {typeInfo.label}
                    </span>
                  )}
                  <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isStore ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm'
                  }`}>
                    {msg.content && <p>{msg.content}</p>}
                    {msg.attachmentUrl && (
                      <div className="mt-2">
                        {isImageUrl(msg.attachmentUrl) ? (
                          <a href={msg.attachmentUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={msg.attachmentUrl}
                              alt={msg.attachmentName || 'Image'}
                              className="max-w-full rounded-lg max-h-40 object-cover border border-white/20"
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`flex items-center gap-2 text-xs underline opacity-90 mt-1 ${isStore ? 'text-primary-foreground' : 'text-primary'}`}
                          >
                            <Icon name="PaperClipIcon" size={13} />
                            {msg.attachmentName || 'Pièce jointe'}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground px-1">{formatTime(msg.createdAt)}</span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Attachment panel */}
      {showAttachPanel && (
        <div className="px-5 py-3 border-t border-border bg-muted/20 shrink-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs font-600 text-muted-foreground">Type :</p>
            {(['photo', 'pdf', 'payment_proof', 'claim', 'order_modification', 'other'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setMessageType(t)}
                className={`text-[10px] px-2 py-0.5 rounded-full border font-500 transition-colors ${
                  messageType === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {MESSAGE_TYPE_LABELS[t].label}
              </button>
            ))}
          </div>
          <input
            type="url"
            value={attachmentUrl}
            onChange={(e) => setAttachmentUrl(e.target.value)}
            placeholder="URL de la pièce jointe (image, PDF…)"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <input
            type="text"
            value={attachmentName}
            onChange={(e) => setAttachmentName(e.target.value)}
            placeholder="Nom du fichier (optionnel)"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          {orders.length > 0 && (
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
            >
              <option value="">— Lier à une commande (optionnel) —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.order_number}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Input */}
      <div className="px-5 py-3.5 border-t border-border shrink-0">
        <div className="flex items-end gap-2">
          <button
            onClick={() => setShowAttachPanel(!showAttachPanel)}
            className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-colors shrink-0 ${
              showAttachPanel ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
            title="Pièce jointe"
          >
            <Icon name="PaperClipIcon" size={16} />
          </button>
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Écrivez votre message… (Entrée pour envoyer)"
              rows={2}
              className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>
          <button
            onClick={handleSend}
            disabled={(!input.trim() && !attachmentUrl.trim()) || sending}
            className="flex items-center justify-center w-10 h-10 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <Icon name="PaperAirplaneIcon" size={16} />
            }
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">Shift+Entrée pour un saut de ligne · 📎 pour joindre un fichier/photo/PDF</p>
      </div>
    </div>
  );
}
