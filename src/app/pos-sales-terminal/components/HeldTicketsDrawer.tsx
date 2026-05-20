'use client';

import React from 'react';
import Icon from '@/components/ui/AppIcon';
import type { HeldTicket } from './POSTerminal';

interface HeldTicketsDrawerProps {
  tickets: HeldTicket[];
  onRecall: (t: HeldTicket) => void;
  onClose: () => void;
}

export default function HeldTicketsDrawer({ tickets, onRecall, onClose }: HeldTicketsDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-80 bg-white h-full shadow-modal flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[15px] font-600 text-foreground">Tickets en attente</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
          {tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <Icon name="ClockIcon" size={28} className="text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Aucun ticket en attente</p>
            </div>
          ) : (
            tickets.map((t) => (
              <div key={t.id} className="border border-border rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-600 text-foreground">{t.label}</p>
                    {t.client && <p className="text-xs text-muted-foreground mt-0.5">{t.client}</p>}
                  </div>
                  <span className="text-[11px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md">{t.heldAt}</span>
                </div>
                <div className="space-y-0.5 mb-3">
                  {t.items.map((item) => (
                    <p key={item.id} className="text-xs text-muted-foreground truncate">
                      {item.qty}× {item.name}
                    </p>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-700 tabular-nums text-foreground">
                    {t.items.reduce((s, i) => {
                      const base = i.price * i.qty;
                      const disc = i.discountType === 'percent' ? base * (i.discount / 100) : i.discount;
                      return s + Math.max(0, base - disc) * (1 + i.tva);
                    }, 0).toFixed(2)} €
                  </span>
                  <button
                    onClick={() => onRecall(t)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-600 hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Icon name="ArrowPathIcon" size={13} />
                    Récupérer
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}