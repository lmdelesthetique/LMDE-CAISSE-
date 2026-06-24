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
  const filename = searchParams.get('filename'); // only set when admin wants to download

  if (!path) {
    return NextResponse.json({ error: 'Paramètre path manquant' }, { status: 400 });
  }

  try {
    const supabase = makeAdminClient();

    // Pass download option only when filename is explicitly provided (admin download)
    // Without it, the URL is used for inline video preview (ambassadrice portal)
    const options = filename ? { download: filename } : undefined;

    const { data, error } = await supabase.storage
      .from('ambassadrice-videos')
      .createSignedUrl(path, 3600, options);

    if (error || !data) {
      console.error('[video-url] createSignedUrl error:', error);
      return NextResponse.json({ error: error?.message ?? 'Impossible de générer l\'URL' }, { status: 500 });
    }

    return NextResponse.json({ url: data.signedUrl });
  } catch (e: any) {
    console.error('[video-url] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
