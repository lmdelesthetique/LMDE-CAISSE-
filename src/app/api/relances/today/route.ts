import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes } from 'crypto';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lmdecaisse.com';

// Auto-generate a client_token for a devis that doesn't have one yet
async function ensureClientToken(supabase: any, devisId: string): Promise<string> {
  const token = randomBytes(20).toString('hex');
  await supabase
    .from('devis_pro')
    .update({ client_token: token, updated_at: new Date().toISOString() })
    .eq('id', devisId);
  return token;
}

function subst(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Always work in UTC to avoid timezone shifts
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr.substring(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().substring(0, 10);
}

// Returns cycle date in UTC, fully timezone-safe
function getCycleDate(dayOfMonth: number, monthOffset: number): string {
  const now = new Date();
  // Work in UTC
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + monthOffset; // JS Date handles over/underflow
  // Last day of target month (UTC)
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(dayOfMonth, lastDay);
  return new Date(Date.UTC(year, month, day)).toISOString().substring(0, 10);
}

function accompagnementSuffix(accomp: string[]): string {
  if (!accomp?.length) return '';
  if (accomp.includes('reconnaissance')) return '\n\nCe que tu construis me touche, et je veux que tu le saches.';
  if (accomp.includes('petit_mot')) return '\n\n(Un petit mot t\'attend dans ton prochain colis 🤍)';
  if (accomp.includes('cadeaux') || accomp.includes('cadeau')) return '\n\n(Regarde au fond du colis — il y a quelque chose pour toi 🎁)';
  if (accomp.includes('conseils_vocaux')) return '\n\nJe t\'ai laissé un petit vocal sur WhatsApp, ça sera plus simple que de lire.';
  return '';
}

export async function GET(req: NextRequest) {
  const debug = req.nextUrl.searchParams.get('debug') === '1';
  const supabase = createAdminClient();
  const today = new Date().toISOString().substring(0, 10);
  const windowStart = addDays(today, -5);

  const dbg: any = { today, windowStart, steps: [] };

  // 1. Load active Sequence C templates
  const { data: templates, error: tplErr } = await supabase
    .from('relance_templates')
    .select('*')
    .eq('sequence', 'C')
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  if (tplErr) return NextResponse.json({ error: tplErr.message, debug: dbg }, { status: 500 });
  dbg.templates = (templates ?? []).map((t: any) => ({ etape: t.etape, delai_jours: t.delai_jours }));

  // 2. Load devis with date_reassort
  const { data: devisList, error: devisErr } = await supabase
    .from('devis_pro')
    .select(`
      id, numero, date_reassort, statut, items, client_token, client_pays,
      client:clients(id, first_name, last_name, phone, whatsapp, email)
    `)
    .not('date_reassort', 'is', null)
    .not('statut', 'in', '("annule","brouillon")')
    .order('date_reassort', { ascending: true });

  if (devisErr) return NextResponse.json({ error: devisErr.message, debug: dbg }, { status: 500 });
  dbg.devis_count = (devisList ?? []).length;

  const devisIds = (devisList ?? []).map((d: any) => d.id);

  // 3. Load relance logs (last 60 days)
  let sentMap: Record<string, Record<string, any[]>> = {};
  if (devisIds.length > 0) {
    const since = addDays(today, -60);
    const { data: logs, error: logsErr } = await supabase
      .from('devis_pro_relances')
      .select('devis_id, etape, sent_at, statut, canal')
      .eq('sequence', 'C')
      .in('devis_id', devisIds)
      .gte('sent_at', since);

    dbg.logs_error = logsErr?.message ?? null;
    for (const log of logs ?? []) {
      if (!sentMap[log.devis_id]) sentMap[log.devis_id] = {};
      if (!sentMap[log.devis_id][log.etape]) sentMap[log.devis_id][log.etape] = [];
      sentMap[log.devis_id][log.etape].push(log);
    }
    dbg.logs_count = (logs ?? []).length;
  }

  // 4. Build pending actions (monthly recurrence)
  const pendingC: any[] = [];

  for (const devis of devisList ?? []) {
    try {
      const client = Array.isArray(devis.client) ? devis.client[0] : devis.client;
      if (!client) continue;

      // Extract day-of-month safely
      const rawDate = String(devis.date_reassort).substring(0, 10);
      const dayOfMonth = new Date(rawDate + 'T12:00:00Z').getUTCDate();
      if (!dayOfMonth || isNaN(dayOfMonth)) continue;

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
      // Ensure a client_token exists (auto-generate if missing)
      let clientToken = devis.client_token;
      if (!clientToken) {
        try { clientToken = await ensureClientToken(supabase, devis.id); } catch { /* non-blocking */ }
      }
      const lienFiche = clientToken ? `${SITE_URL}/devis/${clientToken}` : SITE_URL;
      const accomp: string[] = [];
      const devisLogs = sentMap[devis.id] ?? {};

      const step = { devis_id: devis.id, numero: devis.numero, dayOfMonth, cycles: [] as any[] };

      for (const monthOffset of [-1, 0, 1]) {
        const cycleDate = getCycleDate(dayOfMonth, monthOffset);
        const cycleWindowStart = addDays(cycleDate, -10);
        const cycleWindowEnd = addDays(cycleDate, 20);

        const cycleDbg = { monthOffset, cycleDate, cycleWindowStart, cycleWindowEnd, checks: [] as any[] };

        const timeline = (templates ?? []).map((tpl: any) => {
          const stepDate = addDays(cycleDate, Number(tpl.delai_jours));
          const logsForEtape = (devisLogs[tpl.etape] ?? []) as any[];
          const sentThisCycle = logsForEtape.find(
            (log: any) => log.statut === 'envoye' &&
              log.sent_at.substring(0, 10) >= cycleWindowStart &&
              log.sent_at.substring(0, 10) <= cycleWindowEnd
          );
          return { etape: tpl.etape, canal: tpl.canal, delai_jours: tpl.delai_jours, step_date: stepDate, sent_at: sentThisCycle?.sent_at ?? null, statut: sentThisCycle?.statut ?? null };
        });

        for (const tpl of templates ?? []) {
          const delai = Number(tpl.delai_jours);
          const stepDate = addDays(cycleDate, delai);

          const checkDbg: any = { etape: tpl.etape, stepDate, inWindow: stepDate >= windowStart && stepDate <= today };

          if (stepDate < windowStart || stepDate > today) {
            checkDbg.skip = 'out_of_window';
            cycleDbg.checks.push(checkDbg);
            continue;
          }

          const logsForEtape = (devisLogs[tpl.etape] ?? []) as any[];
          const alreadySentThisCycle = logsForEtape.some(
            (log: any) => log.statut === 'envoye' &&
              log.sent_at.substring(0, 10) >= cycleWindowStart &&
              log.sent_at.substring(0, 10) <= cycleWindowEnd
          );

          checkDbg.alreadySent = alreadySentThisCycle;
          if (alreadySentThisCycle) {
            checkDbg.skip = 'already_sent';
            cycleDbg.checks.push(checkDbg);
            continue;
          }

          checkDbg.skip = null; // will be added
          cycleDbg.checks.push(checkDbg);

          const vars: Record<string, string> = {
            'prénom': firstName, 'produits': produits, 'montant': montant,
            'date': fmtDate(cycleDate), 'conseil': 'Conseil à configurer 💡',
            'lien_fiche': lienFiche, 'produit': itemsArr[0]?.name ?? 'produit',
          };

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
            devis_statut: devis.statut,
            corps: subst(tpl.corps + accompagnementSuffix(accomp), vars),
            sujet: tpl.sujet ? subst(tpl.sujet, vars) : null,
            apercu: tpl.apercu ? subst(tpl.apercu, vars) : null,
            lien_fiche: lienFiche,
            timeline,
          });
        }
        step.cycles.push(cycleDbg);
      }
      dbg.steps.push(step);
    } catch (err: any) {
      console.error('[relances/today] devis error:', err.message, devis?.id);
      dbg.steps.push({ devis_id: devis?.id, error: err.message });
    }
  }

  // 5. Sequences A/B/D/E
  const { data: seqList, error: seqErr } = await supabase
    .from('client_relance_sequences')
    .select(`
      id, client_id, sequence, etape_actuelle, started_at, devis_id, statut,
      client:clients(id, first_name, last_name, phone, whatsapp, email),
      devis:devis_pro(id, numero, items, client_token, client_pays)
    `)
    .eq('statut', 'active')
    .in('sequence', ['A', 'B', 'D', 'E']);

  if (seqErr) console.error('[relances/today] seqErr:', seqErr.message);

  const { data: abTemplates } = await supabase
    .from('relance_templates')
    .select('*')
    .in('sequence', ['A', 'B', 'D', 'E'])
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  const pendingSeq: any[] = [];

  for (const seq of seqList ?? []) {
    try {
      const client = Array.isArray(seq.client) ? (seq.client as any[])[0] : seq.client as any;
      if (!client) continue;

      const seqTemplates = (abTemplates ?? []).filter((t: any) => t.sequence === seq.sequence);
      const currentIdx = seqTemplates.findIndex((t: any) => t.etape === seq.etape_actuelle);
      const nextTpl = currentIdx >= 0 ? seqTemplates[currentIdx + 1] : seqTemplates[0];
      if (!nextTpl) continue;

      const firstName = (client.first_name?.trim() && !/^\d+$/.test(client.first_name))
        ? client.first_name.trim() : (client.last_name?.trim() || 'Madame');
      const devis = Array.isArray(seq.devis) ? (seq.devis as any[])[0] : seq.devis as any;
      const itemsArr = devis ? (Array.isArray(devis.items) ? devis.items : []) : [];
      const produits = itemsArr.filter((i: any) => !i.isBonus).slice(0, 6).map((i: any) => i.name).join(', ') || '—';
      const lienFiche = devis?.client_token ? `${SITE_URL}/devis/${devis.client_token}` : SITE_URL;

      const daysSinceStart = Math.floor((Date.now() - new Date(seq.started_at).getTime()) / 86400000);
      // First step (nothing sent yet) is always due immediately
      const isDue = seq.etape_actuelle === null || daysSinceStart >= Number(nextTpl.delai_jours);

      const vars: Record<string, string> = {
        'prénom': firstName, 'produits': produits, 'conseil': 'Conseil à configurer 💡',
        'lien_fiche': lienFiche, 'produit': itemsArr[0]?.name ?? 'produit',
        'montant': devis?.client_pays ? `${Number(devis.client_pays).toFixed(2)} €` : '—', 'date': '—',
      };

      pendingSeq.push({
        type: seq.sequence, sequence_id: seq.id, client_id: client.id,
        client_prenom: firstName, client_wa: client.whatsapp ?? client.phone ?? null,
        client_email: client.email ?? null, devis_id: seq.devis_id ?? null,
        devis_numero: devis?.numero ?? null, etape_actuelle: seq.etape_actuelle,
        next_etape: nextTpl.etape, next_canal: nextTpl.canal,
        next_delai: nextTpl.delai_jours, days_in_sequence: daysSinceStart,
        is_due: isDue, template_id: nextTpl.id,
        corps: subst(nextTpl.corps, vars),
        sujet: nextTpl.sujet ? subst(nextTpl.sujet, vars) : null,
        apercu: nextTpl.apercu ? subst(nextTpl.apercu, vars) : null,
        started_at: seq.started_at,
      });
    } catch (err: any) {
      console.error('[relances/today] seq error:', err.message);
    }
  }

  const response: any = { date: today, pending_c: pendingC, pending_sequences: pendingSeq };
  if (debug) response.debug = dbg;
  return NextResponse.json(response);
}
