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

    const { contenuId, ambassadriceId, assignmentId, productId, filename, contentType } = body;
    if (!contenuId || !ambassadriceId || !filename) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const supabase = makeAdminClient();

    // Verify contenu exists
    const { data: contenu, error: contenuErr } = await supabase
      .from('campagne_contenus')
      .select('id, video_path')
      .eq('id', contenuId)
      .maybeSingle();
    if (contenuErr || !contenu) {
      return NextResponse.json({ error: 'Contenu introuvable' }, { status: 404 });
    }

    // Build storage path — only alphanumeric and hyphens
    const ext = (filename.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '');
    const timestamp = Date.now();
    const safeAmbId = ambassadriceId.replace(/[^a-zA-Z0-9]/g, '');
    const safeAssId = (assignmentId || 'unknown').replace(/[^a-zA-Z0-9]/g, '');
    const safeProdId = (productId || 'unknown').replace(/[^a-zA-Z0-9]/g, '');
    const path = `${safeAmbId}/${safeAssId}/${safeProdId}/${timestamp}.${ext}`;

    // Delete previous video if any
    if (contenu.video_path) {
      await supabase.storage.from('ambassadrice-videos').remove([contenu.video_path]);
    }

    // Create signed upload URL (browser uploads directly to Supabase, bypassing Next.js)
    const { data, error } = await supabase.storage
      .from('ambassadrice-videos')
      .createSignedUploadUrl(path);

    if (error || !data) {
      console.error('[upload-presigned] createSignedUploadUrl error:', error);
      return NextResponse.json({ error: error?.message ?? 'Impossible de créer l\'URL d\'upload' }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
  } catch (e: any) {
    console.error('[upload-presigned] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
