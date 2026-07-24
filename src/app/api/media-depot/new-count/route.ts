import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// GET /api/media-depot/new-count?since=ISO_DATE — count items uploaded after given date
export async function GET(req: NextRequest) {
  const since = req.nextUrl.searchParams.get('since');
  const supabase = makeAdmin();

  let query = supabase.from('media_depot').select('id', { count: 'exact', head: true });
  if (since) query = query.gt('created_at', since);

  const { count, error } = await query;
  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
