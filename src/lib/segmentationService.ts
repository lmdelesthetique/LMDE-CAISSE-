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
  | 'nouvelles';

export interface SegmentInfo {
  key: SegmentKey;
  label: string;
  description: string;
  icon: string;
}

export const SEGMENTS: SegmentInfo[] = [
  { key: 'tous', label: 'Toutes les clientes', description: 'Toutes les clientes avec un numéro de téléphone', icon: '👥' },
  { key: 'actifs_30j', label: 'Actives (30j)', description: 'Achat dans les 30 derniers jours', icon: '🔥' },
  { key: 'tièdes_90j', label: 'Tièdes (31-90j)', description: 'Dernier achat il y a 31 à 90 jours', icon: '⚡' },
  { key: 'inactifs_90j', label: 'Inactives (90j+)', description: 'Aucun achat depuis plus de 90 jours', icon: '😴' },
  { key: 'inactifs_6mois', label: 'Inactives (6 mois+)', description: 'Aucun achat depuis plus de 6 mois', icon: '💤' },
  { key: 'vip', label: 'VIP (500€+)', description: 'Total dépensé supérieur à 500€', icon: '⭐' },
  { key: 'abonnees', label: 'Abonnées', description: 'Clientes avec abonnement actif', icon: '💎' },
  { key: 'sans_abonnement', label: 'Sans abonnement', description: 'Clientes sans abonnement actif', icon: '📦' },
  { key: 'points_eleves', label: 'Points élevés (200+)', description: 'Plus de 200 points de fidélité', icon: '🏆' },
  { key: 'nouvelles', label: 'Nouvelles (30j)', description: 'Clientes créées dans les 30 derniers jours', icon: '🌟' },
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

export async function getSegmentClients(segment: SegmentKey): Promise<ClientForSegment[]> {
  const supabase = makeAdminClient();
  const now = new Date();
  const d30 = new Date(now); d30.setDate(now.getDate() - 30);
  const d90 = new Date(now); d90.setDate(now.getDate() - 90);
  const d6m = new Date(now); d6m.setMonth(now.getMonth() - 6);

  async function allClientsWithPhone(): Promise<any[]> {
    const { data } = await supabase
      .from('clients').select(BASE_SELECT)
      .not('phone', 'is', null).neq('phone', '');
    return data ?? [];
  }

  async function receiptClientIds(since: Date, until?: Date): Promise<Set<string>> {
    let q = supabase.from('receipts').select('client_id')
      .gte('created_at', since.toISOString())
      .not('client_id', 'is', null)
      .neq('status', 'cancelled');
    if (until) q = q.lt('created_at', until.toISOString());
    const { data } = await q;
    return new Set((data ?? []).map((r: any) => r.client_id));
  }

  async function clientsByIds(ids: string[]): Promise<any[]> {
    if (!ids.length) return [];
    const { data } = await supabase
      .from('clients').select(BASE_SELECT).in('id', ids)
      .not('phone', 'is', null).neq('phone', '');
    return data ?? [];
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
      const { data: receipts } = await supabase
        .from('receipts').select('client_id, total_amount')
        .not('client_id', 'is', null).neq('status', 'cancelled');
      const totals: Record<string, number> = {};
      for (const r of receipts ?? []) {
        totals[r.client_id] = (totals[r.client_id] ?? 0) + parseFloat(r.total_amount ?? 0);
      }
      const ids = Object.entries(totals).filter(([, v]) => v >= 500).map(([k]) => k);
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'abonnees': {
      const { data: subs } = await supabase
        .from('client_subscriptions').select('client_id').eq('status', 'active');
      const ids = [...new Set((subs ?? []).map((s: any) => s.client_id).filter(Boolean))];
      return (await clientsByIds(ids)).map(cleanClient);
    }

    case 'sans_abonnement': {
      const { data: subs } = await supabase
        .from('client_subscriptions').select('client_id').eq('status', 'active');
      const subIds = new Set((subs ?? []).map((s: any) => s.client_id));
      const all = await allClientsWithPhone();
      return all.filter(c => !subIds.has(c.id)).map(cleanClient);
    }

    case 'points_eleves': {
      const { data } = await supabase
        .from('clients').select(BASE_SELECT)
        .gte('loyalty_points', 200)
        .not('phone', 'is', null).neq('phone', '');
      return (data ?? []).map(cleanClient);
    }

    case 'nouvelles': {
      const { data } = await supabase
        .from('clients').select(BASE_SELECT)
        .gte('created_at', d30.toISOString())
        .not('phone', 'is', null).neq('phone', '');
      return (data ?? []).map(cleanClient);
    }

    default:
      return [];
  }
}

export async function getSegmentStats(): Promise<Record<SegmentKey, number>> {
  const entries = await Promise.all(
    SEGMENTS.map(async ({ key }) => {
      const clients = await getSegmentClients(key);
      return [key, clients.length] as [SegmentKey, number];
    })
  );
  return Object.fromEntries(entries) as Record<SegmentKey, number>;
}
