'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Icon from '@/components/ui/AppIcon';
import { normalizePhone } from '@/lib/utils/phoneUtils';

interface ReminderClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  type: 'balance_due' | 'birthday' | 'devis_pending';
  detail: string;
  urgency: 'high' | 'medium' | 'low';
  daysOverdue?: number;
  daysWaiting?: number;
  birthdayDate?: string;
  amount?: number;
  reservationNumber?: string;
  devisId?: string;
  devisNumero?: string;
}

export default function ClientReminders() {
  const [reminders, setReminders] = useState<ReminderClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'balance_due' | 'birthday' | 'devis_pending'>('all');
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  const loadReminders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/clients/reminders');
      if (!res.ok) throw new Error('fetch failed');
      const { reminders: data } = await res.json();
      setReminders(Array.isArray(data) ? data : []);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReminders(); }, [loadReminders]);

  const markSent = (id: string) => setSentIds(prev => new Set([...prev, id]));

  const filtered = reminders.filter(r => filter === 'all' || r.type === filter);
  const balanceCount = reminders.filter(r => r.type === 'balance_due').length;
  const birthdayCount = reminders.filter(r => r.type === 'birthday').length;
  const devisCount = reminders.filter(r => r.type === 'devis_pending').length;

  const urgencyConfig = {
    high: { color: 'text-red-700 bg-red-50 border-red-200', dot: 'bg-red-500', label: 'Urgent' },
    medium: { color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500', label: 'Moyen' },
    low: { color: 'text-blue-700 bg-blue-50 border-blue-200', dot: 'bg-blue-400', label: 'Normal' },
  };

  const typeIcon: Record<ReminderClient['type'], string> = {
    birthday: '🎂',
    balance_due: '💰',
    devis_pending: '📋',
  };

  const buildDevisRelanceMsg = (r: ReminderClient): string => {
    const name = (r.name || '').split(' ')[0] || 'Madame';
    return [
      `Bonjour ${name} 🌸`,
      ``,
      `Je vous fais une petite relance concernant votre devis PRO ${r.devisNumero ? `*${r.devisNumero}*` : ''} d'un montant de *${r.amount?.toFixed(2)} €*.`,
      ``,
      `Il attend votre confirmation depuis ${r.daysWaiting} jour${(r.daysWaiting ?? 0) > 1 ? 's' : ''}. Souhaitez-vous valider cette commande ou apporter des modifications ? 😊`,
      ``,
      `— Le Monde de l'Esthétique ✨`,
    ].join('\n');
  };

  const buildBirthdayMsg = (r: ReminderClient): string => {
    const name = (r.name || '').split(' ')[0] || 'Madame';
    return `Bonjour ${name} 🎂✨\n\nToute l'équipe du Monde de l'Esthétique vous souhaite un très joyeux anniversaire ! 🎉\n\nNous espérons que votre journée est magnifique. Merci de votre fidélité 💖\n\n— LMDE ✨`;
  };

  const buildBalanceMsg = (r: ReminderClient): string => {
    const name = (r.name || '').split(' ')[0] || 'Madame';
    return `Bonjour ${name} 🌸\n\nNous vous contactons au sujet de votre solde restant de *${r.amount?.toFixed(2)} €* (${r.reservationNumber ?? ''}).\n\nPourriez-vous nous confirmer la date de règlement ? N'hésitez pas à nous contacter pour toute question. 😊\n\n— Le Monde de l'Esthétique ✨`;
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
              <p className="text-xs text-muted-foreground mt-0.5">Soldes impayés, anniversaires, devis en attente</p>
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
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { id: 'all' as const, label: 'Toutes', count: reminders.length },
            { id: 'balance_due' as const, label: '💰 Soldes impayés', count: balanceCount },
            { id: 'birthday' as const, label: '🎂 Anniversaires', count: birthdayCount },
            { id: 'devis_pending' as const, label: '📋 Devis en attente', count: devisCount },
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
            const phone = reminder.phone ? normalizePhone(reminder.phone) : null;

            const waMsg = reminder.type === 'devis_pending'
              ? buildDevisRelanceMsg(reminder)
              : reminder.type === 'birthday'
              ? buildBirthdayMsg(reminder)
              : buildBalanceMsg(reminder);

            return (
              <div key={reminder.id} className={`px-5 py-4 ${isSent ? 'opacity-50' : ''}`}>
                <div className="flex items-start gap-3">
                  {/* Type icon */}
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    reminder.type === 'birthday' ? 'bg-pink-100'
                    : reminder.type === 'devis_pending' ? 'bg-violet-100'
                    : 'bg-amber-100'
                  }`}>
                    <span className="text-base">{typeIcon[reminder.type]}</span>
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
                    {reminder.amount && reminder.amount > 0 && reminder.type !== 'devis_pending' && (
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
                        {phone && (
                          <a
                            href={`https://wa.me/${phone}?text=${encodeURIComponent(waMsg)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => markSent(reminder.id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 text-xs font-500 hover:bg-green-100 transition-colors"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.373 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                            </svg>
                            WhatsApp
                          </a>
                        )}
                        {reminder.email && !phone && (
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
