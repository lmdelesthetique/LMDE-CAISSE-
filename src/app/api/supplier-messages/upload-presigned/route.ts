import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'supplier-invoices';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const { supplierId, filename, contentType } = body;
    if (!supplierId || !filename) {
      return NextResponse.json({ error: 'supplierId et filename requis' }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Ensure bucket allows 50 MB files
    await supabase.storage.updateBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_SIZE,
    }).catch(() => {});

    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `chat/${supplierId}/${Date.now()}-${safeName}`;

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Impossible de créer l\'URL d\'upload' }, { status: 500 });
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      path: data.path,
      publicUrl,
      name: filename,
      type: contentType || 'application/octet-stream',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
