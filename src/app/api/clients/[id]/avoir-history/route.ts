import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AvoirEntry {
  id: string;
  date: string;
  type: 'credit' | 'debit';
  source: 'retour' | 'caisse' | 'devis';
  source_ref: string | null;
  amount: number;
  balance_after: number;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [returnsRes, receiptsRes, devisRes] = await Promise.all([
    supabase
      .from('returns')
      .select('id, created_at, total_amount, avoir_number, refund_type')
      .eq('client_id', id)
      .eq('refund_type', 'store_credit')
      .order('created_at', { ascending: true }),

    supabase
      .from('receipts')
      .select('id, created_at, ticket_number, store_credit_used')
      .eq('client_id', id)
      .neq('status', 'cancelled')
      .gt('store_credit_used', 0)
      .order('created_at', { ascending: true }),

    supabase
      .from('devis_pro')
      .select('id, created_at, updated_at, numero, paiements, statut')
      .eq('client_id', id)
      .eq('statut', 'livre')
      .not('paiements', 'is', null)
      .order('updated_at', { ascending: true }),
  ]);

  const entries: Array<Omit<AvoirEntry, 'balance_after'> & { balance_after?: number }> = [];

  // Credits from returns
  for (const r of returnsRes.data ?? []) {
    entries.push({
      id: `ret_${r.id}`,
      date: r.created_at,
      type: 'credit',
      source: 'retour',
      source_ref: r.avoir_number ?? null,
      amount: Number(r.total_amount ?? 0),
    });
  }

  // Debits from POS receipts
  for (const r of receiptsRes.data ?? []) {
    const used = Number(r.store_credit_used ?? 0);
    if (used > 0) {
      entries.push({
        id: `rec_${r.id}`,
        date: r.created_at,
        type: 'debit',
        source: 'caisse',
        source_ref: r.ticket_number ?? null,
        amount: used,
      });
    }
  }

  // Debits from devis pro
  for (const d of devisRes.data ?? []) {
    const paiements: any[] = Array.isArray(d.paiements) ? d.paiements : [];
    const avoirTotal = paiements
      .filter((p: any) => p.method === 'avoir')
      .reduce((sum: number, p: any) => sum + Number(p.amount ?? 0), 0);
    if (avoirTotal > 0.005) {
      entries.push({
        id: `dev_${d.id}`,
        date: d.updated_at,
        type: 'debit',
        source: 'devis',
        source_ref: d.numero ?? null,
        amount: avoirTotal,
      });
    }
  }

  // Sort by date ascending, compute running balance
  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let running = 0;
  const result: AvoirEntry[] = entries.map(e => {
    running = e.type === 'credit' ? running + e.amount : Math.max(0, running - e.amount);
    return { ...e, balance_after: Math.round(running * 100) / 100 };
  });

  return NextResponse.json({ history: result.reverse(), current_balance: Math.round(running * 100) / 100 });
}
