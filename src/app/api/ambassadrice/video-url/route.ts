import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get('path');

  if (!path) {
    return NextResponse.json({ error: 'Paramètre path manquant' }, { status: 400 });
  }

  try {
    const supabase = makeAdminClient();

    // Generate signed URL valid 1 hour
    const { data, error } = await supabase.storage
      .from('ambassadrice-videos')
      .createSignedUrl(path, 3600);

    if (error || !data) {
      return NextResponse.json({ error: 'Impossible de générer l\'URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
