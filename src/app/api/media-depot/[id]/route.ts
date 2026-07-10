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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = makeAdmin();
  const body = await req.json();

  const { error } = await supabase
    .from('media_depot')
    .update({ admin_note: body.admin_note ?? null })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = makeAdmin();

  const { data: row, error: fetchErr } = await supabase
    .from('media_depot')
    .select('file_path')
    .eq('id', id)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });

  await supabase.storage.from(BUCKET).remove([row.file_path]);

  const { error: dbErr } = await supabase.from('media_depot').delete().eq('id', id);
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
