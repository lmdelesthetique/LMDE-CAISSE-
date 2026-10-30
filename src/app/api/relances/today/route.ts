import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lmdecaisse.com';

// Variable substitution helper
function subst(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{([^}]+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Accompagnement personalisation suffix
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
  // Show steps due today OR overdue within last 5 days
  const windowStart = addDays(today, -5);

  // 1. Load all active Sequence C templates
  const { data: templates, error: tplErr } = await supabase
    .from('relance_templates')
    .select('*')
    .eq('sequence', 'C')
    .eq('actif', true)
    .order('delai_jours', { ascending: true });

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 500 });

  // 2. Load devis with date_reassort set (active devis only)
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

  // 3. Load existing relances logs for these devis (Sequence C)
  const devisIds = (devisList ?? []).map((d: any) => d.id);
  let sentMap: Record<string, Record<string, any>> = {}; // devis_id → etape → log

  if (devisIds.length > 0) {
    const { data: logs } = await supabase
      .from('devis_pro_relances')
      .select('devis_id, etape, sent_at, statut, canal')
      .eq('sequence', 'C')
      .in('devis_id', devisIds);

    for (const log of logs ?? []) {
      if (!sentMap[log.devis_id]) sentMap[log.devis_id] = {};
      sentMap[log.devis_id][log.etape] = log;
    }
  }

  // 4. Build pending actions
  const pendingC: any[] = [];

  for (const devis of devisList ?? []) {
    const client = devis.client as any;
    if (!client) continue;

    const reassortDate = devis.date_reassort as string;
    const firstName = (client.first_name?.trim() && !/^\d+$/.test(client.first_name)) ? client.first_name.trim() : (client.last_name?.trim() || 'Madame');
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

    // Build full timeline for this devis
    const timeline = (templates ?? []).map((tpl: any) => {
      const stepDate = addDays(reassortDate, tpl.delai_jours);
      const log = devisLogs[tpl.etape];
      return {
        etape: tpl.etape,
        canal: tpl.canal,
        delai_jours: tpl.delai_jours,
        step_date: stepDate,
        sent_at: log?.sent_at ?? null,
        statut: log?.statut ?? null,
      };
    });

    // Find steps due today (within window, not yet sent)
    for (const tpl of templates ?? []) {
      const stepDate = addDays(reassortDate, tpl.delai_jours);
      if (stepDate < windowStart || stepDate > today) continue;
      const log = devisLogs[tpl.etape];
      if (log?.statut === 'envoye') continue; // already sent

      const vars: Record<string, string> = {
        'prénom': firstName,
        'produits': produits,
        'montant': montant,
        'date': fmtDate(reassortDate),
        'conseil': 'Conseil à configurer 💡',
        'lien_fiche': lienFiche,
        'produit': itemsArr[0]?.name ?? 'produit',
      };

      const corpsRaw = tpl.corps + accompagnementSuffix(accomp);
      const corps = subst(corpsRaw, vars);
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
        overdue: stepDate < today,
        corps,
        sujet,
        apercu: tpl.apercu ? subst(tpl.apercu, vars) : null,
        lien_fiche: lienFiche,
        timeline,
      });
    }
  }

  // 5. Load active sequences A/B
  const { data: seqList, error: seqErr } = await supabase
    .from('client_relance_sequences')
    .select(`
      id, client_id, sequence, etape_actuelle, started_at, devis_id, statut,
      client:clients(id, first_name, last_name, phone, whatsapp, email),
      devis:devis_pro(id, numero, items, client_token, client_pays)
    `)
    .eq('statut', 'active')
    .in('sequence', ['A', 'B']);

  if (seqErr) return NextResponse.json({ error: seqErr.message }, { status: 500 });

  // Load templates for A/B
  const { data: abTemplates } = await supabase
    .from('relance_templates')
    .select('*')
    .in('sequence', ['A', 'B'])
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

    const firstName = (client.first_name?.trim() && !/^\d+$/.test(client.first_name)) ? client.first_name.trim() : (client.last_name?.trim() || 'Madame');
    const devis = seq.devis as any;
    const itemsArr = devis ? (Array.isArray(devis.items) ? devis.items : []) : [];
    const produits = itemsArr.filter((i: any) => !i.isBonus).slice(0, 6).map((i: any) => i.name).join(', ') || '—';
    const lienFiche = devis?.client_token ? `${SITE_URL}/devis/${devis.client_token}` : SITE_URL;
    const accomp: string[] = [];

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

    const corps = subst(nextTpl.corps + accompagnementSuffix(accomp), vars);
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
