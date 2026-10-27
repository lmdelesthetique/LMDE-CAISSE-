import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export type SegmentKey =
  | 'tous'
  | 'actifs_30j'
  | 'tièdes_90j'
  | 'inactifs_90j'
  | 'inactifs_6mois'
  | 'vip'
  | 'abonnees'
  | 'sans_abonnement'
  | 'points_eleves'
  | 'nouvelles'
  | 'nouvelle_cliente'
  | 'a_reactiver_45j'
  | 'fidelite_300pts'
  | 'anniversaire_mois'
  | 'pro'
  | 'ambassadrice'
  | 'a_achete_guide'
  | 'debutante';

export interface SegmentInfo {
  key: SegmentKey;
  label: string;
  description: string;
  icon: string;
}

export const SEGMENTS: SegmentInfo[] = [
  { key: 'tous', label: 'Toutes les clientes', description: 'Toutes les clientes avec un numéro de téléphone', icon: '👥' },
  { key: 'nouvelle_cliente', label: 'Nouvelles (14j)', description: 'Fiche créée dans les 14 derniers jours', icon: '🌸' },
  { key: 'nouvelles', label: 'Nouvelles (30j)', description: 'Clientes créées dans les 30 derniers jours', icon: '🌟' },
  { key: 'actifs_30j', label: 'Actives (30j)', description: 'Achat dans les 30 derniers jours', icon: '🔥' },
  { key: 'tièdes_90j', label: 'Tièdes (31-90j)', description: 'Dernier achat il y a 31 à 90 jours', icon: '⚡' },
  { key: 'a_reactiver_45j', label: 'À réactiver (45-89j)', description: 'Dernier achat il y a 45 à 89 jours', icon: '⏰' },
  { key: 'inactifs_90j', label: 'Inactives (90j+)', description: 'Aucun achat depuis plus de 90 jours', icon: '😴' },
  { key: 'inactifs_6mois', label: 'Inactives (6 mois+)', description: 'Aucun achat depuis plus de 6 mois', icon: '💤' },
  { key: 'vip', label: 'VIP (500€+)', description: 'Total dépensé supérieur à 500€', icon: '⭐' },
  { key: 'pro', label: 'Professionnelles', description: 'Clientes de type professionnel', icon: '🏢' },
  { key: 'debutante', label: 'Débutantes (kit)', description: 'A acheté un kit débutant', icon: '💅' },
  { key: 'abonnees', label: 'Abonnées', description: 'Clientes avec abonnement actif', icon: '💎' },
  { key: 'sans_abonnement', label: 'Sans abonnement', description: 'Clientes sans abonnement actif', icon: '📦' },
  { key: 'fidelite_300pts', label: 'Fidélité 300+ pts', description: 'Plus de 300 points de fidélité', icon: '🥇' },
  { key: 'points_eleves', label: 'Points élevés (200+)', description: 'Plus de 200 points de fidélité', icon: '🏆' },
  { key: 'anniversaire_mois', label: 'Anniversaire ce mois', description: 'Date d\'anniversaire dans le mois en cours', icon: '🎂' },
  { key: 'ambassadrice', label: 'Ambassadrices', description: 'Ambassadrices actives LMDE', icon: '🌺' },
  { key: 'a_achete_guide', label: 'A acheté le guide', description: 'A commandé le guide LMDE', icon: '📖' },
];

export interface ClientForSegment {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  loyalty_points?: number;
}

function cleanClient(c: any): ClientForSegment {
  return {
    id: c.id,
    first_name: c.first_name ?? '',
    last_name: c.last_name ?? '',
    phone: c.phone ?? '',
    email: c.email ?? undefined,
    loyalty_points: c.loyalty_points ?? 0,
  };
}

const BASE_SELECT = 'id, first_name, last_name, phone, email, loyalty_points, created_at';
const PAGE_SIZE = 1000;

// Fetches ALL rows by paginating through Supabase's 1000-row limit
async function fetchAll(buildQuery: (from: number, to: number) => any): Promise<any[]> {
  const results: any[] = [];
  let page = 0;
  while (true) {
    const from = page * PAGE_SIZE;
    const { data } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (!data?.length) break;
    results.push(...data);
    if (data.length < PAGE_SIZE) break;
    page++;
  }
  return results;
}

export async function getSegmentClients(segment: SegmentKey): Promise<ClientForSegment[]> {
  const supabase = makeAdminClient();
  const now = new Date();
  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  const d6m = new Date(now); d6m.setMonth(now.getMonth() - 6);

  async function allClientsWithPhone(): Promise<any[]> {
    return fetchAll((from, to) =>
      supabase.from('clients').select(BASE_SELECT)
        .not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
    );
  }

  async function receiptClientIds(since: Date, until?: Date): Promise<Set<string>> {
    const rows = await fetchAll((from, to) => {
      let q = supabase.from('receipts').select('client_id')
        .gte('created_at', since.toISOString())
        .not('client_id', 'is', null)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });
      if (until) q = q.lt('created_at', until.toISOString());
      return q.range(from, to);
    });
    return new Set(rows.map((r: any) => r.client_id));
  }

  // Fetch clients by IDs in batches of 500 (IN clause limit)
  async function clientsByIds(ids: string[]): Promise<any[]> {
    if (!ids.length) return [];
    const results: any[] = [];
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .in('id', chunk).not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
      );
      results.push(...rows);
    }
    return results;
  }

  switch (segment) {
    case 'tous':
      return (await allClientsWithPhone()).map(cleanClient);

    case 'actifs_30j': {
      const ids = [...await receiptClientIds(d30)];
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'tièdes_90j': {
      const recent = await receiptClientIds(d30);
      const older = await receiptClientIds(d90, d30);
      const ids = [...older].filter(id => !recent.has(id));
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'inactifs_90j': {
      const recent = await receiptClientIds(d90);
      const all = await allClientsWithPhone();
      return all.filter(c => !recent.has(c.id)).map(cleanClient);
    }

    case 'inactifs_6mois': {
      const recent = await receiptClientIds(d6m);
      const all = await allClientsWithPhone();
      return all.filter(c => !recent.has(c.id)).map(cleanClient);
    }

    case 'vip': {
      const receipts = await fetchAll((from, to) =>
        supabase.from('receipts').select('client_id, total_amount')
          .not('client_id', 'is', null).neq('status', 'cancelled').order('created_at', { ascending: true }).range(from, to)
      );
      const totals: Record<string, number> = {};
      for (const r of receipts) {
        totals[r.client_id] = (totals[r.client_id] ?? 0) + parseFloat(r.total_amount ?? 0);
      }
      const ids = Object.entries(totals).filter(([, v]) => v >= 500).map(([k]) => k);
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'abonnees': {
      const subs = await fetchAll((from, to) =>
        supabase.from('client_subscriptions').select('client_id').eq('status', 'active').order('id', { ascending: true }).range(from, to)
      );
      const ids = [...new Set(subs.map((s: any) => s.client_id).filter(Boolean))];
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'sans_abonnement': {
      const subs = await fetchAll((from, to) =>
        supabase.from('client_subscriptions').select('client_id').eq('status', 'active').order('id', { ascending: true }).range(from, to)
      );
      const subIds = new Set(subs.map((s: any) => s.client_id));
      const all = await allClientsWithPhone();
      return all.filter(c => !subIds.has(c.id)).map(cleanClient);
    }

    case 'points_eleves': {
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .gte('loyalty_points', 200).not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'nouvelles': {
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .gte('created_at', d30.toISOString()).not('phone', 'is', null).neq('phone', '').order('created_at', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'nouvelle_cliente': {
      const d14 = new Date(now); d14.setDate(now.getDate() - 14);
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .gte('created_at', d14.toISOString()).not('phone', 'is', null).neq('phone', '').order('created_at', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'a_reactiver_45j': {
      const d45 = new Date(now); d45.setDate(now.getDate() - 45);
      const d89 = new Date(now); d89.setDate(now.getDate() - 89);
      const recent = await receiptClientIds(d45);
      const older = await receiptClientIds(d89, d45);
      const ids = [...older].filter(id => !recent.has(id));
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'fidelite_300pts': {
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .gte('loyalty_points', 300).not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'anniversaire_mois': {
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .like('birth_date', `%-${month}-%`).not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'pro': {
      const rows = await fetchAll((from, to) =>
        supabase.from('clients').select(BASE_SELECT)
          .eq('client_type', 'professionnel').not('phone', 'is', null).neq('phone', '').order('id', { ascending: true }).range(from, to)
      );
      return rows.map(cleanClient);
    }

    case 'ambassadrice': {
      const ambassadrices = await fetchAll((from, to) =>
        supabase.from('ambassadrices').select('telephone').eq('statut', 'active').order('id', { ascending: true }).range(from, to)
      );
      const phones = ambassadrices.map((a: any) => a.telephone).filter(Boolean);
      if (!phones.length) return [];
      const all = await allClientsWithPhone();
      return all.filter(c => phones.some((p: string) => p === c.phone || p.replace(/\s/g, '') === (c.phone ?? '').replace(/\s/g, ''))).map(cleanClient);
    }

    case 'a_achete_guide': {
      const receipts = await fetchAll((from, to) =>
        supabase.from('receipts').select('client_id').filter('items::text', 'ilike', '%guide%').not('client_id', 'is', null).neq('status', 'cancelled').order('created_at', { ascending: true }).range(from, to)
      );
      const ids = [...new Set(receipts.map((r: any) => r.client_id).filter(Boolean))];
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'debutante': {
      const receipts = await fetchAll((from, to) =>
        supabase.from('receipts').select('client_id').filter('items::text', 'ilike', '%kit%').not('client_id', 'is', null).neq('status', 'cancelled').order('created_at', { ascending: true }).range(from, to)
      );
      const ids = [...new Set(receipts.map((r: any) => r.client_id).filter(Boolean))];
      return (await clientsByIds(ids)).map(cleanClient);
    }

    default:
      return [];
  }
}

// Fast count — avoids fetching all rows (used for preview badges)
export async function getSegmentCount(segment: SegmentKey): Promise<number> {
  const supabase = makeAdminClient();
  const now = new Date();
  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  const d6m = new Date(now); d6m.setMonth(now.getMonth() - 6);

  switch (segment) {
    case 'tous': {
      const { count } = await supabase.from('clients')
        .select('*', { count: 'exact', head: true })
        .not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'nouvelles': {
      const { count } = await supabase.from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', d30.toISOString())
        .not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'points_eleves': {
      const { count } = await supabase.from('clients')
        .select('*', { count: 'exact', head: true })
        .gte('loyalty_points', 200)
        .not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'abonnees': {
      const { count } = await supabase.from('client_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    }
    case 'actifs_30j': {
      const { data } = await supabase.from('receipts')
        .select('client_id')
        .gte('created_at', d30.toISOString())
        .not('client_id', 'is', null).neq('status', 'cancelled');
      return new Set((data ?? []).map((r: any) => r.client_id)).size;
    }
    case 'tièdes_90j': {
      const [{ data: d30Data }, { data: d90Data }] = await Promise.all([
        supabase.from('receipts').select('client_id').gte('created_at', d30.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
        supabase.from('receipts').select('client_id').gte('created_at', d90.toISOString()).lt('created_at', d30.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
      ]);
      const recent = new Set((d30Data ?? []).map((r: any) => r.client_id));
      const older = new Set((d90Data ?? []).map((r: any) => r.client_id));
      return [...older].filter(id => !recent.has(id)).length;
    }
    case 'inactifs_90j': {
      const [{ data: activeData }, { count: total }] = await Promise.all([
        supabase.from('receipts').select('client_id').gte('created_at', d90.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).not('phone', 'is', null).neq('phone', ''),
      ]);
      const activeIds = new Set((activeData ?? []).map((r: any) => r.client_id));
      return Math.max(0, (total ?? 0) - activeIds.size);
    }
    case 'inactifs_6mois': {
      const [{ data: activeData }, { count: total }] = await Promise.all([
        supabase.from('receipts').select('client_id').gte('created_at', d6m.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).not('phone', 'is', null).neq('phone', ''),
      ]);
      const activeIds = new Set((activeData ?? []).map((r: any) => r.client_id));
      return Math.max(0, (total ?? 0) - activeIds.size);
    }
    case 'vip': {
      const { data } = await supabase.from('receipts')
        .select('client_id, total_amount')
        .not('client_id', 'is', null).neq('status', 'cancelled');
      const totals: Record<string, number> = {};
      for (const r of data ?? []) {
        totals[r.client_id] = (totals[r.client_id] ?? 0) + parseFloat(r.total_amount ?? 0);
      }
      return Object.values(totals).filter(v => v >= 500).length;
    }
    case 'sans_abonnement': {
      const [{ data: subs }, { count: total }] = await Promise.all([
        supabase.from('client_subscriptions').select('client_id').eq('status', 'active'),
        supabase.from('clients').select('*', { count: 'exact', head: true }).not('phone', 'is', null).neq('phone', ''),
      ]);
      const subIds = new Set((subs ?? []).map((s: any) => s.client_id));
      return Math.max(0, (total ?? 0) - subIds.size);
    }
    case 'nouvelle_cliente': {
      const d14 = new Date(now); d14.setDate(now.getDate() - 14);
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).gte('created_at', d14.toISOString()).not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'a_reactiver_45j': {
      const d45 = new Date(now); d45.setDate(now.getDate() - 45);
      const d89 = new Date(now); d89.setDate(now.getDate() - 89);
      const [{ data: d45Data }, { data: d89Data }] = await Promise.all([
        supabase.from('receipts').select('client_id').gte('created_at', d45.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
        supabase.from('receipts').select('client_id').gte('created_at', d89.toISOString()).lt('created_at', d45.toISOString()).not('client_id', 'is', null).neq('status', 'cancelled'),
      ]);
      const recent = new Set((d45Data ?? []).map((r: any) => r.client_id));
      const older = new Set((d89Data ?? []).map((r: any) => r.client_id));
      return [...older].filter(id => !recent.has(id)).length;
    }
    case 'fidelite_300pts': {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).gte('loyalty_points', 300).not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'anniversaire_mois': {
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).like('birth_date', `%-${month}-%`).not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'pro': {
      const { count } = await supabase.from('clients').select('*', { count: 'exact', head: true }).eq('client_type', 'professionnel').not('phone', 'is', null).neq('phone', '');
      return count ?? 0;
    }
    case 'ambassadrice': {
      const { count } = await supabase.from('ambassadrices').select('*', { count: 'exact', head: true }).eq('statut', 'active');
      return count ?? 0;
    }
    case 'a_achete_guide': {
      const { data } = await supabase.from('receipts').select('client_id').filter('items::text', 'ilike', '%guide%').not('client_id', 'is', null).neq('status', 'cancelled');
      return new Set((data ?? []).map((r: any) => r.client_id)).size;
    }
    case 'debutante': {
      const { data } = await supabase.from('receipts').select('client_id').filter('items::text', 'ilike', '%kit%').not('client_id', 'is', null).neq('status', 'cancelled');
      return new Set((data ?? []).map((r: any) => r.client_id)).size;
    }
    default:
      return 0;
  }
}

export async function getSegmentStats(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENTS.map(async ({ key }) => {
      const count = await getSegmentCount(key);
      return [key, count] as [SegmentKey, number];
    })
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}
