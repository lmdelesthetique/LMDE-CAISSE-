import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentStats } from '@/lib/segmentationService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

export async function GET() {
  try {
    const supabase = makeAdminClient();

    const [segmentStats, campaignsResult] = await Promise.all([
      getSegmentStats(),
      supabase.from('campagnes_marketing')
        .select('id, nom, segment, statut, total_clients, envoyes, erreurs, sent_at, created_at')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

    const campaigns = campaignsResult.data ?? [];
    const totalCampaigns = campaigns.length;
    const totalSent = campaigns.reduce((s, c) => s + (c.envoyes ?? 0), 0);
    const totalErrors = campaigns.reduce((s, c) => s + (c.erreurs ?? 0), 0);
    const successRate = totalSent + totalErrors > 0
      ? Math.round((totalSent / (totalSent + totalErrors)) * 100)
      : 100;

    return NextResponse.json({ segmentStats, campaigns, totalCampaigns, totalSent, successRate });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
