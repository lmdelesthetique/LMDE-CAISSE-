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
    const formData = await request.formData();

    const file = formData.get('video') as File | null;
    const contenuId = formData.get('contenuId') as string | null;
    const assignmentId = formData.get('assignmentId') as string | null;
    const productId = formData.get('productId') as string | null;
    const ambassadriceId = formData.get('ambassadriceId') as string | null;

    if (!file || !contenuId || !ambassadriceId) {
      return NextResponse.json({ error: 'Paramètres manquants : video, contenuId, ambassadriceId requis' }, { status: 400 });
    }

    const supabase = makeAdminClient();

    // Verify contenu exists
    const { data: contenu, error: contenuErr } = await supabase
      .from('campagne_contenus')
      .select('id, assignment_id')
      .eq('id', contenuId)
      .maybeSingle();

    if (contenuErr || !contenu) {
      return NextResponse.json({ error: 'Contenu introuvable' }, { status: 404 });
    }

    // Build storage path: ambassadrice_id/assignment_id/product_id/timestamp.ext
    const ext = file.name.split('.').pop()?.toLowerCase() || 'mp4';
    const timestamp = Date.now();
    const safeProdId = (productId || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '');
    const safeAmbId = ambassadriceId.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeAssId = (assignmentId || contenu.assignment_id || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '');
    const path = `${safeAmbId}/${safeAssId}/${safeProdId}/${timestamp}.${ext}`;

    // If a video already exists, delete the old one first
    const { data: existing } = await supabase
      .from('campagne_contenus')
      .select('video_path')
      .eq('id', contenuId)
      .maybeSingle();

    if (existing?.video_path) {
      await supabase.storage.from('ambassadrice-videos').remove([existing.video_path]);
    }

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('ambassadrice-videos')
      .upload(path, buffer, { contentType: file.type || 'video/mp4', upsert: true });

    if (uploadError) {
      console.error('[upload-video] storage error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Update campagne_contenus record
    const { error: updateError } = await supabase
      .from('campagne_contenus')
      .update({
        video_path: uploadData.path,
        video_filename: file.name,
        video_size_bytes: file.size,
        video_uploaded_at: new Date().toISOString(),
        video_deleted_at: null,
        statut: 'realise',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contenuId);

    if (updateError) {
      console.error('[upload-video] db update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, path: uploadData.path });
  } catch (e: any) {
    console.error('[upload-video] exception:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
