import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ noteId: string }> };

// DELETE /api/clients/notes/[noteId]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { noteId } = await params;
  if (!noteId) return NextResponse.json({ error: 'noteId requis' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('client_internal_notes').delete().eq('id', noteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
