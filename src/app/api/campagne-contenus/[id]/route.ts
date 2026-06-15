import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = makeClient();
    const allowed = ['statut', 'drive_deposited', 'drive_url', 'notes'];
    const update: any = { updated_at: new Date().toISOString() };
    for (const k of allowed) {
      if (k in body) update[k] = body[k];
    }

    const { data, error } = await supabase
      .from('campagne_contenus')
      .update(update)
      .eq('id', id)
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // POST to /api/campagne-contenus/[assignmentId] — create new contenu
  const { id: assignmentId } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = makeClient();
    const { data, error } = await supabase
      .from('campagne_contenus')
      .insert({
        assignment_id: assignmentId,
        product_id: body.product_id ?? null,
        product_name: body.product_name ?? null,
        type_contenu: body.type_contenu ?? 'reel',
        statut: body.statut ?? 'a_faire',
        drive_deposited: body.drive_deposited ?? false,
        notes: body.notes ?? null,
      })
      .select('*')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
