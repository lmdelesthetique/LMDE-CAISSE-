import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const supplierId = formData.get('supplierId') as string | null;

  if (!file || !supplierId) {
    return NextResponse.json({ error: 'file et supplierId requis' }, { status: 400 });
  }

  const maxSizeMB = 20;
  if (file.size > maxSizeMB * 1024 * 1024) {
    return NextResponse.json({ error: `Fichier trop volumineux (max ${maxSizeMB} Mo)` }, { status: 400 });
  }

  const supabase = createAdminClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `chat/${supplierId}/${Date.now()}-${safeName}`;

  // Fallback MIME type when browser doesn't set it (common for Excel on some devices)
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pdf: 'application/pdf',
    jpg: 'image/jpeg', jpeg: 'image/jpeg',
    png: 'image/png', webp: 'image/webp',
  };
  const contentType = file.type || mimeMap[ext] || 'application/octet-stream';

  const bytes = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from('supplier-invoices')
    .upload(path, bytes, { contentType, upsert: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage.from('supplier-invoices').getPublicUrl(path);

  return NextResponse.json({ url: publicUrl, name: file.name, type: contentType });
}
