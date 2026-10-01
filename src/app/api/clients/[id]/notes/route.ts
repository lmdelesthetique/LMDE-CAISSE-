import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET    /api/clients/[id]/notes          — list notes for a client
// POST   /api/clients/[id]/notes          — add note
// DELETE /api/clients/[id]/notes?noteId=  — delete note

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_internal_notes')
    .select('*')
    .eq('client_id', id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_internal_notes')
    .insert({ client_id: id, content: body.content, author: body.author ?? 'Vendeur' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, note: data });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { id: _clientId } = await params;
  const noteId = req.nextUrl.searchParams.get('noteId');
  if (!noteId) return NextResponse.json({ error: 'noteId requis' }, { status: 400 });
  const supabase = createAdminClient();
  const { error } = await supabase.from('client_internal_notes').delete().eq('id', noteId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
