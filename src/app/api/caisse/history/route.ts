import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Martinique = UTC-4, pas d'heure d'été
const MTQ_OFFSET = '-04:00';
const dayStart = (d: string) => `${d}T00:00:00${MTQ_OFFSET}`;
const dayEnd   = (d: string) => `${d}T23:59:59${MTQ_OFFSET}`;

// GET /api/caisse/history?limit=30
// Returns last N sessions with CA + ticket count from real (non-demo) receipts
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '30'), 60);
  const supabase = createAdminClient();

  const { data: sessions, error } = await supabase
    .from('caisse_sessions')
    .select('id, date, caissier_name, fond_ouverture, fond_compte, fond_theorique, ecart, fond_demain, montant_a_deposer, statut, heure_cloture, created_at')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    if (error.code === '42P01') return NextResponse.json([]);
    console.error('[api/caisse/history GET]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!sessions || sessions.length === 0) return NextResponse.json([]);

  const oldest = sessions[sessions.length - 1].date;
  const newest = sessions[0].date;

  // Fetch real (non-demo, non-test-client) completed receipts in range
  const { data: receipts } = await supabase
    .from('receipts')
    .select('created_at, total_amount, client_name')
    .eq('status', 'completed')
    .neq('is_demo', true)
    .gte('created_at', dayStart(oldest))
    .lte('created_at', dayEnd(newest));

  // Group by Martinique date — convert UTC timestamp to local date
  const byDate: Record<string, { ca: number; count: number }> = {};
  for (const r of receipts ?? []) {
    // Filter out internal test client
    const cn = (r.client_name ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (cn === 'CHRISTY LHOMME') continue;

    // Convert UTC created_at to Martinique date
    const localDate = new Date(r.created_at as string).toLocaleDateString('en-CA', {
      timeZone: 'America/Martinique',
    });

    if (!byDate[localDate]) byDate[localDate] = { ca: 0, count: 0 };
    byDate[localDate].ca += parseFloat(String(r.total_amount ?? 0));
    byDate[localDate].count += 1;
  }

  const result = sessions.map((s) => ({
    ...s,
    ca_total: byDate[s.date]?.ca ?? 0,
    nombre_tickets: byDate[s.date]?.count ?? 0,
  }));

  return NextResponse.json(result);
}
