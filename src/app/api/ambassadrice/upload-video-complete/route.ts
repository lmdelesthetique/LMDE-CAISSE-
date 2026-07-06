import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const { contenuId, path, filename, sizeBytes } = body;
    if (!contenuId || !path) {
      return NextResponse.json({ error: 'contenuId et path requis' }, { status: 400 });
    }

    const supabase = makeAdminClient();

    // First update video fields + try to set statut=realise
    const { error } = await supabase
      .from('campagne_contenus')
      .update({
        video_path: path,
        video_filename: filename ?? null,
        video_size_bytes: sizeBytes ?? null,
        video_uploaded_at: new Date().toISOString(),
        video_deleted_at: null,
        statut: 'realise',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contenuId);

    if (error) {
      // If 'realise' is not yet in the statut constraint, fall back to 'tourne'
      if (error.message.includes('campagne_contenus_statut_check') || error.message.includes('violates check constraint')) {
        const { error: fallbackErr } = await supabase
          .from('campagne_contenus')
          .update({
            video_path: path,
            video_filename: filename ?? null,
            video_size_bytes: sizeBytes ?? null,
            video_uploaded_at: new Date().toISOString(),
            video_deleted_at: null,
            statut: 'tourne',
            updated_at: new Date().toISOString(),
          })
          .eq('id', contenuId);
        if (fallbackErr) {
          console.error('[upload-video-complete] fallback db update error:', fallbackErr);
          return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, warning: 'statut set to tourne — run migration to enable realise' });
      }
      console.error('[upload-video-complete] db update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[upload-video-complete] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
