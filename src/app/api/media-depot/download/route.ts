import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

const BUCKET = 'media-depot';

// GET /api/media-depot/download?id=UUID — generate a signed URL with Content-Disposition: attachment
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id manquant' }, { status: 400 });

  const supabase = makeAdmin();

  const { data: row, error: rowErr } = await supabase
    .from('media_depot')
    .select('file_path, file_name')
    .eq('id', id)
    .maybeSingle();

  if (rowErr || !row) return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path, 300, { download: row.file_name });

  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Erreur URL' }, { status: 500 });

  return NextResponse.json({ url: data.signedUrl });
}
