import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET — called by Vercel cron every 30 min
// Also callable manually: GET /api/cron/marketing-scheduler?preview=1 (dry run)
export async function GET(req: NextRequest) {
  const preview = req.nextUrl.searchParams.get('preview') === '1';
  const supabase = makeAdminClient();
  const now = new Date().toISOString();

  // Find campaigns that are scheduled and due
  const { data: due, error } = await supabase
    .from('campagnes_marketing')
    .select('id, nom, segment, scheduled_at')
    .eq('statut', 'programme')
    .not('scheduled_at', 'is', null)
    .lte('scheduled_at', now);

  if (error) {
    console.error('[marketing-scheduler] query error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!due?.length) {
    return NextResponse.json({ ok: true, triggered: 0, message: 'Aucune campagne à envoyer' });
  }

  if (preview) {
    return NextResponse.json({ ok: true, due: due.map(c => ({ id: c.id, nom: c.nom?.split('|||')[0], scheduled_at: c.scheduled_at })) });
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.lmdecaisse.com';
  const results: { id: string; ok: boolean; error?: string }[] = [];

  for (const campaign of due) {
    try {
      const res = await fetch(`${siteUrl}/api/marketing/campagnes/${campaign.id}/envoyer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      results.push({ id: campaign.id, ok: res.ok, error: res.ok ? undefined : data.error });
      console.log(`[marketing-scheduler] campaign ${campaign.id}: ${res.ok ? '✅' : '❌'}`);
    } catch (e: any) {
      results.push({ id: campaign.id, ok: false, error: e.message });
      console.error(`[marketing-scheduler] campaign ${campaign.id} exception:`, e.message);
    }
  }

  const triggered = results.filter(r => r.ok).length;
  return NextResponse.json({ ok: true, triggered, total: due.length, results });
}
