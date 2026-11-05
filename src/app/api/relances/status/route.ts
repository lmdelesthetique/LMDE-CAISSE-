import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function getCycleDate(dayOfMonth: number, monthOffset: number): string {
  const ref = new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth() + monthOffset;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, lastDay);
  return new Date(year, month, clampedDay).toISOString().split('T')[0];
}

export async function GET() {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  // Load all active Seq C templates
  const { data: templates } = await supabase
    .from('relance_templates')
    .select('id, etape, canal, delai_jours')
    .eq('sequence', 'C')
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  // Load devis with date_reassort
  const { data: devisList, error } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, date_reassort, statut, client_pays,
      client:clients(id, first_name, last_name, phone, whatsapp)
    `)
    .not('date_reassort', 'is', null)
    .not('statut', 'in', '("annule","brouillon")')
    .order('date_reassort', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const devisIds = (devisList ?? []).map((d: any) => d.id);

  // Load all recent relance logs (last 60 days)
  let logsMap: Record<string, any[]> = {}; // devis_id → logs[]
  if (devisIds.length > 0) {
    const since = addDays(today, -60);
    const { data: logs } = await supabase
      .from('devis_pro_relances')
      .select('devis_id, etape, sent_at, statut, canal')
      .eq('sequence', 'C')
      .in('devis_id', devisIds)
      .gte('sent_at', since)
      .order('sent_at', { ascending: false });

    for (const log of logs ?? []) {
      if (!logsMap[log.devis_id]) logsMap[log.devis_id] = [];
      logsMap[log.devis_id].push(log);
    }
  }

  const result = (devisList ?? []).map((devis: any) => {
    const client = devis.client as any;
    const dayOfMonth = new Date(devis.date_reassort + 'T12:00:00Z').getUTCDate();
    const logs = logsMap[devis.id] ?? [];

    // Current cycle date
    const currentCycle = getCycleDate(dayOfMonth, 0);
    const nextCycle = getCycleDate(dayOfMonth, 1);

    // Last log entry
    const lastLog = logs[0] ?? null;

    // Next upcoming step (first step not yet sent in current or next cycle)
    let nextStep: { etape: string; canal: string; date: string } | null = null;
    for (const monthOffset of [0, 1]) {
      const cycleDate = getCycleDate(dayOfMonth, monthOffset);
      const cycleWindowStart = addDays(cycleDate, -10);
      const cycleWindowEnd = addDays(cycleDate, 20);

      for (const tpl of templates ?? []) {
        const stepDate = addDays(cycleDate, (tpl as any).delai_jours);
        if (stepDate < today) continue; // skip past steps
        const alreadySent = logs.some(
          (l: any) => l.etape === (tpl as any).etape && l.statut === 'envoye' &&
            l.sent_at >= cycleWindowStart && l.sent_at <= cycleWindowEnd + 'T23:59:59Z'
        );
        if (!alreadySent) {
          nextStep = { etape: (tpl as any).etape, canal: (tpl as any).canal, date: stepDate };
          break;
        }
      }
      if (nextStep) break;
    }

    // Steps due today (overdue or today)
    const dueToday: { etape: string; canal: string; overdue: boolean }[] = [];
    for (const monthOffset of [-1, 0]) {
      const cycleDate = getCycleDate(dayOfMonth, monthOffset);
      const cycleWindowStart = addDays(cycleDate, -10);
      const cycleWindowEnd = addDays(cycleDate, 20);
      const windowStart = addDays(today, -5);

      for (const tpl of templates ?? []) {
        const stepDate = addDays(cycleDate, (tpl as any).delai_jours);
        if (stepDate < windowStart || stepDate > today) continue;
        const alreadySent = logs.some(
          (l: any) => l.etape === (tpl as any).etape && l.statut === 'envoye' &&
            l.sent_at >= cycleWindowStart && l.sent_at <= cycleWindowEnd + 'T23:59:59Z'
        );
        if (!alreadySent) {
          dueToday.push({ etape: (tpl as any).etape, canal: (tpl as any).canal, overdue: stepDate < today });
        }
      }
    }

    const firstName = (client?.first_name?.trim() && !/^\d+$/.test(client.first_name))
      ? client.first_name.trim() : (client?.last_name?.trim() || '—');

    return {
      devis_id: devis.id,
      numero: devis.numero,
      statut: devis.statut,
      client_name: `${firstName} ${client?.last_name ?? ''}`.trim(),
      has_whatsapp: !!(client?.whatsapp || client?.phone),
      day_of_month: dayOfMonth,
      current_cycle: currentCycle,
      next_cycle: nextCycle,
      last_sent_at: lastLog?.sent_at ?? null,
      last_etape: lastLog?.etape ?? null,
      next_step: nextStep,
      due_today: dueToday,
      total_logs: logs.filter((l: any) => l.statut === 'envoye').length,
    };
  });

  return NextResponse.json({ devis: result, templates_count: (templates ?? []).length });
}
