import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/campagne-contenus/new-count?since=ISO_DATE — count new videos uploaded by ambassadrices
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since');
  const supabase = createAdminClient();

  let query = supabase
    .from('campagne_contenus')
    .select('id', { count: 'exact', head: true })
    .not('video_path', 'is', null);

  if (since) query = query.gt('video_uploaded_at', since);

  const { count, error } = await query;
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
