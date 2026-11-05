import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lmdecaisse.com';

function subst(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

// Given a day-of-month and a year/month offset from today, return the cycle date "YYYY-MM-DD"
function getCycleDate(dayOfMonth: number, monthOffset: number): string {
  const ref = new Date();
  const year = ref.getFullYear();
  const month = ref.getMonth() + monthOffset; // can be negative or > 11, Date handles it
  // Clamp day to last day of that month
  const lastDay = new Date(year, month + 1, 0).getDate();
  const clampedDay = Math.min(dayOfMonth, lastDay);
  const d = new Date(year, month, clampedDay);
  return d.toISOString().split('T')[0];
}

function accompagnementSuffix(accomp: string[]): string {
  if (!accomp?.length) return '';
  if (accomp.includes('reconnaissance')) return '\n\nCe que tu construis me touche, et je veux que tu le saches.';
  if (accomp.includes('petit_mot')) return '\n\n(Un petit mot t\'attend dans ton prochain colis 🤍)';
  if (accomp.includes('cadeaux') || accomp.includes('cadeau')) return '\n\n(Regarde au fond du colis — il y a quelque chose pour toi 🎁)';
  if (accomp.includes('conseils_vocaux')) return '\n\nJe t\'ai laissé un petit vocal sur WhatsApp, ça sera plus simple que de lire.';
  return '';
}

export async function GET() {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];
  const windowStart = addDays(today, -5); // show overdue up to 5 days back

  // 1. Load all active Sequence C templates
  const { data: templates, error: tplErr } = await supabase
    .from('relance_templates')
    .select('*')
    .eq('sequence', 'C')
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });

  // 2. Load devis with date_reassort set
  const { data: devisList, error: devisErr } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, date_reassort, items, client_token, client_pays,
      client:clients(id, first_name, last_name, phone, whatsapp, email)
    `)
    .not('date_reassort', 'is', null)
    .not('statut', 'in', '("annule","brouillon")')
    .order('date_reassort', { ascending: true });

  if (devisErr) return NextResponse.json({ error: devisErr.message }, { status: 500 });

  const devisIds = (devisList ?? []).map((d: any) => d.id);

  // 3. Load relance logs for last 60 days (enough to cover a full monthly cycle)
  let sentMap: Record<string, Record<string, any[]>> = {}; // devis_id → etape → log[]

  if (devisIds.length > 0) {
    const since = addDays(today, -60);
    const { data: logs } = await supabase
      .from('devis_pro_relances')
      .select('devis_id, etape, sent_at, statut, canal')
      .eq('sequence', 'C')
      .in('devis_id', devisIds)
      .gte('sent_at', since);

    for (const log of logs ?? []) {
      if (!sentMap[log.devis_id]) sentMap[log.devis_id] = {};
      if (!sentMap[log.devis_id][log.etape]) sentMap[log.devis_id][log.etape] = [];
      sentMap[log.devis_id][log.etape].push(log);
    }
  }

  // 4. Build pending actions using MONTHLY RECURRENCE
  const pendingC: any[] = [];

  for (const devis of devisList ?? []) {
    const client = devis.client as any;
    if (!client) continue;

    // Extract day-of-month from date_reassort (e.g. "2026-11-05" → 5)
    const dayOfMonth = new Date(devis.date_reassort + 'T12:00:00Z').getUTCDate();

    const firstName = (client.first_name?.trim() && !/^\d+$/.test(client.first_name))
      ? client.first_name.trim()
      : (client.last_name?.trim() || 'Madame');

    const itemsArr = Array.isArray(devis.items) ? devis.items : [];
    const produits = itemsArr
      .filter((i: any) => !i.isBonus)
      .slice(0, 6)
      .map((i: any) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`)
      .join(', ') || '—';
    const montant = devis.client_pays ? `${Number(devis.client_pays).toFixed(2)} €` : '—';
    const lienFiche = devis.client_token ? `${SITE_URL}/devis/${devis.client_token}` : SITE_URL;
    const accomp: string[] = [];

    const devisLogs = sentMap[devis.id] ?? {};

    // Check cycles: previous month, current month, next month
    // (previous for late J+15 messages, next for early J-7 messages)
    for (const monthOffset of [-1, 0, 1]) {
      const cycleDate = getCycleDate(dayOfMonth, monthOffset);

      // Window for "already sent this cycle" = cycleDate ± 20 days
      const cycleWindowStart = addDays(cycleDate, -10);
      const cycleWindowEnd = addDays(cycleDate, 20);

      // Build timeline for this cycle
      const timeline = (templates ?? []).map((tpl: any) => {
        const stepDate = addDays(cycleDate, tpl.delai_jours);
        const logsForEtape = (devisLogs[tpl.etape] ?? []) as any[];
        const sentThisCycle = logsForEtape.find(
          (log: any) => log.statut === 'envoye' && log.sent_at >= cycleWindowStart && log.sent_at <= cycleWindowEnd + 'T23:59:59Z'
        );
        return {
          etape: tpl.etape,
          canal: tpl.canal,
          delai_jours: tpl.delai_jours,
          step_date: stepDate,
          sent_at: sentThisCycle?.sent_at ?? null,
          statut: sentThisCycle?.statut ?? null,
        };
      });

      for (const tpl of templates ?? []) {
        const stepDate = addDays(cycleDate, tpl.delai_jours);

        // Skip if outside the display window
        if (stepDate < windowStart || stepDate > today) continue;

        // Skip if already sent in this cycle
        const logsForEtape = (devisLogs[tpl.etape] ?? []) as any[];
        const alreadySentThisCycle = logsForEtape.some(
          (log: any) => log.statut === 'envoye' && log.sent_at >= cycleWindowStart && log.sent_at <= cycleWindowEnd + 'T23:59:59Z'
        );
        if (alreadySentThisCycle) continue;

        const vars: Record<string, string> = {
          'prénom': firstName,
          'produits': produits,
          'montant': montant,
          'date': fmtDate(cycleDate),
          'conseil': 'Conseil à configurer 💡',
          'lien_fiche': lienFiche,
          'produit': itemsArr[0]?.name ?? 'produit',
        };

        const corps = subst(tpl.corps + accompagnementSuffix(accomp), vars);
        const sujet = tpl.sujet ? subst(tpl.sujet, vars) : null;

        pendingC.push({
          type: 'C',
          devis_id: devis.id,
          devis_numero: devis.numero,
          client_id: client.id,
          client_prenom: firstName,
          client_wa: client.whatsapp ?? client.phone ?? null,
          client_email: client.email ?? null,
          etape: tpl.etape,
          canal: tpl.canal,
          template_id: tpl.id,
          step_date: stepDate,
          cycle_date: cycleDate,
          overdue: stepDate < today,
          corps,
          sujet,
          apercu: tpl.apercu ? subst(tpl.apercu, vars) : null,
          lien_fiche: lienFiche,
          timeline,
        });
      }
    }
  }

  // 5. Load active sequences A/B/D/E
  const { data: seqList, error: seqErr } = await supabase
    .from('client_relance_sequences')
    .select(`
      id, client_id, sequence, etape_actuelle, started_at, devis_id, statut,
      client:clients(id, first_name, last_name, phone, whatsapp, email),
      devis:devis_pro(id, numero, items, client_token, client_pays)
    `)
    .eq('statut', 'active')
    .in('sequence', ['A', 'B', 'D', 'E']);

  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });

  const { data: abTemplates } = await supabase
    .from('relance_templates')
    .select('*')
    .in('sequence', ['A', 'B', 'D', 'E'])
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  const pendingSeq: any[] = [];

  for (const seq of seqList ?? []) {
    const client = seq.client as any;
    if (!client) continue;

    const seqTemplates = (abTemplates ?? []).filter((t: any) => t.sequence === seq.sequence);
    const currentIdx = seqTemplates.findIndex((t: any) => t.etape === seq.etape_actuelle);
    const nextTpl = currentIdx >= 0 ? seqTemplates[currentIdx + 1] : seqTemplates[0];
    if (!nextTpl) continue;

    const firstName = (client.first_name?.trim() && !/^\d+$/.test(client.first_name))
      ? client.first_name.trim()
      : (client.last_name?.trim() || 'Madame');
    const devis = seq.devis as any;
    const itemsArr = devis ? (Array.isArray(devis.items) ? devis.items : []) : [];
    const produits = itemsArr.filter((i: any) => !i.isBonus).slice(0, 6).map((i: any) => i.name).join(', ') || '—';
    const lienFiche = devis?.client_token ? `${SITE_URL}/devis/${devis.client_token}` : SITE_URL;

    const daysSinceStart = Math.floor((Date.now() - new Date(seq.started_at).getTime()) / 86400000);
    const isDue = daysSinceStart >= nextTpl.delai_jours;

    const vars: Record<string, string> = {
      'prénom': firstName,
      'produits': produits,
      'conseil': 'Conseil à configurer 💡',
      'lien_fiche': lienFiche,
      'produit': itemsArr[0]?.name ?? 'produit',
      'montant': devis?.client_pays ? `${Number(devis.client_pays).toFixed(2)} €` : '—',
      'date': '—',
    };

    const corps = subst(nextTpl.corps, vars);
    const sujet = nextTpl.sujet ? subst(nextTpl.sujet, vars) : null;

    pendingSeq.push({
      type: seq.sequence,
      sequence_id: seq.id,
      client_id: client.id,
      client_prenom: firstName,
      client_wa: client.whatsapp ?? client.phone ?? null,
      client_email: client.email ?? null,
      devis_id: seq.devis_id ?? null,
      devis_numero: devis?.numero ?? null,
      etape_actuelle: seq.etape_actuelle,
      next_etape: nextTpl.etape,
      next_canal: nextTpl.canal,
      next_delai: nextTpl.delai_jours,
      days_in_sequence: daysSinceStart,
      is_due: isDue,
      template_id: nextTpl.id,
      corps,
      sujet,
      apercu: nextTpl.apercu ? subst(nextTpl.apercu, vars) : null,
      started_at: seq.started_at,
    });
  }

  return NextResponse.json({
    date: today,
    pending_c: pendingC,
    pending_sequences: pendingSeq,
  });
}
