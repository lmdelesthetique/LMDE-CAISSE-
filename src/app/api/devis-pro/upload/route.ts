import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'devis-pro';

async function ensureBucket(supabase: ReturnType<typeof createAdminClient>) {
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (createErr) {
    const msg = createErr.message.toLowerCase();
    const isAlreadyExists = msg.includes('already exists') || msg.includes('duplicate') || msg.includes('23505') || msg.includes('409');
    if (!isAlreadyExists) {
      console.error('[devis-pro/upload] createBucket error:', createErr.message);
    }
  }
  await supabase.storage.updateBucket(BUCKET, { public: true });
}

export async function POST(req: NextRequest) {
  let formData: FormData;
  try { formData = await req.formData(); } catch { return NextResponse.json({ error: 'Invalid form data' }, { status: 400 }); }

  const file = formData.get('file') as Blob | null;
  const filename = (formData.get('filename') as string | null) ?? `devis-${Date.now()}.pdf`;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const supabase = createAdminClient();
  await ensureBucket(supabase);

  const buffer = Buffer.from(await file.arrayBuffer());

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, buffer, { contentType: 'application/pdf', upsert: true });

  if (error) {
    console.error('[devis-pro/upload] upload error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(data.path);

  return NextResponse.json({ url: publicUrl });
}
