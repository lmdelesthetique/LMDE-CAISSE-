import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET /api/caisse/history?limit=30
// Returns last N sessions with CA + ticket count from receipts
export async function GET(req: NextRequest) {
  const limit = Math.min(parseInt(new URL(req.url).searchParams.get('limit') ?? '30'), 60);
  const supabase = makeClient();

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

  // Compute CA + ticket count per day from receipts
  const oldest = sessions[sessions.length - 1].date;
  const newest = sessions[0].date;

  const { data: receipts } = await supabase
    .from('receipts')
    .select('created_at, total_amount')
    .eq('status', 'completed')
    .gte('created_at', `${oldest}T00:00:00`)
    .lte('created_at', `${newest}T23:59:59`);

  // Group by date
  const byDate: Record<string, { ca: number; count: number }> = {};
  for (const r of receipts ?? []) {
    const d = (r.created_at as string).slice(0, 10);
    if (!byDate[d]) byDate[d] = { ca: 0, count: 0 };
    byDate[d].ca += parseFloat(String(r.total_amount ?? 0));
    byDate[d].count += 1;
  }

  const result = sessions.map((s) => ({
    ...s,
    ca_total: byDate[s.date]?.ca ?? 0,
    nombre_tickets: byDate[s.date]?.count ?? 0,
  }));

  return NextResponse.json(result);
}
