import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ contenuId: string }> }
) {
  const { contenuId } = await params;

  try {
    const supabase = makeAdminClient();

    const { data: contenu, error: fetchErr } = await supabase
      .from('campagne_contenus')
      .select('video_path')
      .eq('id', contenuId)
      .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!contenu?.video_path) return NextResponse.json({ error: 'Aucune vidéo trouvée pour ce contenu' }, { status: 404 });

    // Delete from Supabase Storage
    const { error: storageErr } = await supabase.storage
      .from('ambassadrice-videos')
      .remove([contenu.video_path]);

    if (storageErr) {
      return NextResponse.json({ error: storageErr.message }, { status: 500 });
    }

    // Update DB record: clear video fields, mark deletion timestamp
    await supabase
      .from('campagne_contenus')
      .update({
        video_path: null,
        video_filename: null,
        video_size_bytes: null,
        video_uploaded_at: null,
        video_deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contenuId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
