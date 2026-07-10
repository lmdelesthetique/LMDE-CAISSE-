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

export async function GET() {
  const supabase = makeAdmin();

  const { data, error } = await supabase
    .from('media_depot')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') return NextResponse.json({ items: [], tableExists: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate signed URLs (1h)
  const items = await Promise.all(
    (data ?? []).map(async (row: any) => {
      const { data: signed } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(row.file_path, 3600);
      return { ...row, url: signed?.signedUrl ?? null };
    })
  );

  return NextResponse.json({ items, tableExists: true });
}

export async function POST(req: NextRequest) {
  const supabase = makeAdmin();
  const form = await req.formData();
  const file = form.get('file') as File | null;
  const uploaderName = (form.get('uploader_name') as string ?? '').trim();

  if (!file) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  if (!uploaderName) return NextResponse.json({ error: 'Nom manquant' }, { status: 400 });

  const mime = file.type;
  const fileType = mime.startsWith('video/') ? 'video' : 'photo';
  const ext = file.name.split('.').pop() ?? 'bin';
  const id = crypto.randomUUID();
  const now = new Date();
  const filePath = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${id}.${ext}`;

  const bytes = await file.arrayBuffer();

  // Ensure bucket exists
  const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (bucketErr && !bucketErr.message.includes('already exists')) {
    return NextResponse.json({ error: bucketErr.message }, { status: 500 });
  }

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, bytes, { contentType: mime, upsert: false });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 });

  const { data: row, error: dbErr } = await supabase
    .from('media_depot')
    .insert({
      id,
      file_path: filePath,
      file_name: file.name,
      file_type: fileType,
      mime_type: mime,
      uploader_name: uploaderName,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (dbErr) {
    await supabase.storage.from(BUCKET).remove([filePath]);
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  return NextResponse.json({ item: row }, { status: 201 });
}
