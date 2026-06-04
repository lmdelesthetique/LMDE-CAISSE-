'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

interface ReminderClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: 'balance_due' | 'birthday';
  detail: string;
  urgency: 'high' | 'medium' | 'low';
  daysOverdue?: number;
  birthdayDate?: string;
  amount?: number;
  reservationNumber?: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' });
}

export default function ClientReminders() {
  const [reminders, setReminders] = useState<ReminderClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'balance_due' | 'birthday'>('all');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const loadReminders = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const results: ReminderClient[] = [];

    try {
      // 1. Reservations with unpaid balance > 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: reservations } = await supabase
        .from('reservations')
        .select('id, reservation_number, client_name, client_phone, client_email, balance_due, created_at, reservation_status')
        .in('reservation_status', ['pending', 'deposit_paid', 'ready'])
        .gt('balance_due', 0)
        .lte('created_at', thirtyDaysAgo.toISOString());

      for (const r of reservations ?? []) {
        const createdAt = new Date(r.created_at);
        const daysOverdue = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        results.push({
          id: `res-${r.id}`,
          name: r.client_name,
          phone: r.client_phone ?? null,
          email: r.client_email ?? null,
          type: 'balance_due',
          detail: `Solde impayé depuis ${daysOverdue} jours — Réservation ${r.reservation_number}`,
          urgency: daysOverdue > 60 ? 'high' : daysOverdue > 45 ? 'medium' : 'low',
          daysOverdue,
          amount: parseFloat(r.balance_due ?? 0),
          reservationNumber: r.reservation_number,
        });
      }

      // 2. Birthday reminders — clients with birthday in next 7 days
      const today = new Date();
      const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      const clients = await fetchAll<any>((from, to) =>
        supabase
          .from('clients')
          .select('id, first_name, last_name, phone, email, date_of_birth')
          .not('date_of_birth', 'is', null)
          .range(from, to)
      );

      for (const c of clients) {
        if (!c.date_of_birth) continue;
        const bDate = new Date(c.date_of_birth);
        const bMD = `${String(bDate.getMonth() + 1).padStart(2, '0')}-${String(bDate.getDate()).padStart(2, '0')}`;

        // Check if birthday is within next 7 days
        const thisYearBirthday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
        const diffDays = Math.floor((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 7) {
          const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim();
          results.push({
            id: `bday-${c.id}`,
            name,
            phone: c.phone ?? null,
            email: c.email ?? null,
            type: 'birthday',
            detail: diffDays === 0 ? `🎂 Anniversaire aujourd'hui !` : `🎂 Anniversaire dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`,
            urgency: diffDays === 0 ? 'high' : diffDays <= 2 ? 'medium' : 'low',
            birthdayDate: c.date_of_birth,
          });
        }
      }

      // Sort by urgency
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      results.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);
      setReminders(results);
    } catch (e) {
      console.error('Reminders load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const markSent = (id: string) => {
    setSentIds(prev => new Set([...prev, id]));
  };

  const filtered = reminders.filter(r => filter === 'all' || r.type === filter);
  const balanceCount = reminders.filter(r => r.type === 'balance_due').length;
  const birthdayCount = reminders.filter(r => r.type === 'birthday').length;

  const urgencyConfig = {
    high: { color: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500', label: 'Urgent' },
    medium: { color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500', label: 'Moyen' },
    low: { color: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-400', label: 'Normal' },
  };

  return (
    <div className="bg-white border border-border rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <Icon name="BellAlertIcon" size={20} className="text-violet-600" />
            </div>
            <div>
              <h3 className="text-base font-700 text-foreground">Relances clients</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Soldes impayés +30j et anniversaires à venir</p>
            </div>
          </div>
          <button
            onClick={loadReminders}
            className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Actualiser"
          >
            <Icon name="ArrowPathIcon" size={16} />
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mt-4">
          {[
            { id: 'all' as const, label: 'Toutes', count: reminders.length },
            { id: 'balance_due' as const, label: '💰 Soldes impayés', count: balanceCount },
            { id: 'birthday' as const, label: '🎂 Anniversaires', count: birthdayCount },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-500 transition-colors ${
                filter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                filter === tab.id ? 'bg-white/20 text-white' : 'bg-border text-muted-foreground'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-border max-h-[500px] overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Icon name="ArrowPathIcon" size={24} className="animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Icon name="CheckCircleIcon" size={40} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm font-500">Aucune relance nécessaire</p>
            <p className="text-xs mt-1">Tous les clients sont à jour</p>
          </div>
        ) : (
          filtered.map(reminder => {
            const urg = urgencyConfig[reminder.urgency];
            const isSent = sentIds.has(reminder.id);
            return (
              <div key={reminder.id} className={`px-5 py-4 ${isSent ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    reminder.type === 'birthday' ? 'bg-pink-100' : 'bg-amber-100'
                  }`}>
                    <span className="text-base">{reminder.type === 'birthday' ? '🎂' : '💰'}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-600 text-foreground">{reminder.name}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-600 px-2 py-0.5 rounded-full border ${urg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${urg.dot}`} />
                        {urg.label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{reminder.detail}</p>
                    {reminder.amount && reminder.amount > 0 && (
                      <p className="text-sm font-700 text-amber-700 mt-1 tabular-nums">
                        Solde dû : {reminder.amount.toFixed(2)} €
                      </p>
                    )}
                    {(reminder.phone || reminder.email) && (
                      <div className="flex items-center gap-3 mt-1.5">
                        {reminder.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon name="PhoneIcon" size={11} />
                            {reminder.phone}
                          </span>
                        )}
                        {reminder.email && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Icon name="EnvelopeIcon" size={11} />
                            {reminder.email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {!isSent ? (
                      <>
                        {reminder.phone && (
                          <button
                            onClick={() => markSent(reminder.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-500 hover:bg-emerald-100 transition-colors"
                          >
                            <Icon name="PhoneIcon" size={11} />
                            Appeler
                          </button>
                        )}
                        {reminder.email && (
                          <button
                            onClick={() => markSent(reminder.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors"
                          >
                            <Icon name="EnvelopeIcon" size={11} />
                            Email
                          </button>
                        )}
                        <button
                          onClick={() => markSent(reminder.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-muted border border-border text-muted-foreground text-xs font-500 hover:bg-muted/80 transition-colors"
                        >
                          <Icon name="CheckIcon" size={11} />
                          Fait
                        </button>
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-600 font-500">
                        <Icon name="CheckCircleIcon" size={14} />
                        Relancé
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {filtered.length > 0 && (
        <div className="px-5 py-3 bg-muted/30 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{filtered.length} relance{filtered.length > 1 ? 's' : ''} en attente</span>
          <button
            onClick={() => setSentIds(new Set(filtered.map(r => r.id)))}
            className="text-xs text-primary font-500 hover:underline"
          >
            Tout marquer comme fait
          </button>
        </div>
      )}
    </div>
  );
}
