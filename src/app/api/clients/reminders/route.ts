import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = createAdminClient();
  const results: any[] = [];

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
    const daysOverdue = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
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
  let allClients: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone, email, date_of_birth')
      .not('date_of_birth', 'is', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (!data?.length) break;
    allClients = allClients.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  for (const c of allClients) {
    if (!c.date_of_birth) continue;
    const bDate = new Date(c.date_of_birth);
    const thisYearBirthday = new Date(today.getFullYear(), bDate.getMonth(), bDate.getDate());
    const diffDays = Math.floor((thisYearBirthday.getTime() - today.getTime()) / 86400000);
    if (diffDays >= 0 && diffDays <= 7) {
      results.push({
        id: `bday-${c.id}`,
        name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        phone: c.phone ?? null,
        email: c.email ?? null,
        type: 'birthday',
        detail: diffDays === 0 ? `🎂 Anniversaire aujourd'hui !` : `🎂 Anniversaire dans ${diffDays} jour${diffDays > 1 ? 's' : ''}`,
        urgency: diffDays === 0 ? 'high' : diffDays <= 2 ? 'medium' : 'low',
        birthdayDate: c.date_of_birth,
      });
    }
  }

  // 3. Devis PRO en attente de confirmation (envoyé il y a > 3 jours, statut 'envoye')
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
  const { data: pendingDevis } = await supabase
    .from('devis_pro')
    .select('id, numero, client_pays, sent_at, created_at, client:clients(id, first_name, last_name, phone, whatsapp, email)')
    .eq('statut', 'envoye')
    .or(`sent_at.lte.${threeDaysAgo},and(sent_at.is.null,created_at.lte.${threeDaysAgo})`)
    .order('created_at', { ascending: false })
    .limit(50);

  for (const d of pendingDevis ?? []) {
    const client = d.client as any;
    if (!client) continue;
    const sentDate = d.sent_at ?? d.created_at;
    const daysWaiting = Math.floor((Date.now() - new Date(sentDate).getTime()) / 86400000);
    results.push({
      id: `devis-${d.id}`,
      name: `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim(),
      phone: client.whatsapp ?? client.phone ?? null,
      email: client.email ?? null,
      type: 'devis_pending',
      detail: `Devis ${d.numero ?? d.id.slice(0, 8)} envoyé il y a ${daysWaiting} j — ${Number(d.client_pays ?? 0).toFixed(2)} € — en attente de confirmation`,
      urgency: daysWaiting > 7 ? 'high' : daysWaiting > 5 ? 'medium' : 'low',
      daysWaiting,
      amount: Number(d.client_pays ?? 0),
      devisId: d.id,
      devisNumero: d.numero,
    });
  }

  // Sort by urgency
  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2));

  return NextResponse.json({ reminders: results });
}
