import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST /api/caisse/day-summary — upsert a day summary (clôture de caisse)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.summary_date) return NextResponse.json({ error: 'Missing summary_date' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('day_summaries')
    .upsert(body, { onConflict: 'summary_date' });

  if (error) {
    console.error('[api/caisse/day-summary POST]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
