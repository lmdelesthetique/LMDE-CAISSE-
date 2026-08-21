import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// GET — list all active locations
export async function GET() {
  const supabase = makeAdminClient();
  const { data, error } = await supabase
    .from('inventory_locations')
    .select('id, name, address, is_main, is_active, created_at')
    .eq('is_active', true)
    .order('is_main', { ascending: false })
    .order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST — create a new location
export async function POST(req: NextRequest) {
  let body: { name: string; address?: string; isMain?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.name?.trim()) return NextResponse.json({ error: 'Le nom est obligatoire' }, { status: 400 });

  const supabase = makeAdminClient();

  // If creating as main, unset existing main first
  if (body.isMain) {
    await supabase.from('inventory_locations').update({ is_main: false }).eq('is_main', true);
  }

  const { data, error } = await supabase
    .from('inventory_locations')
    .insert({ name: body.name.trim(), address: body.address?.trim() || null, is_main: body.isMain ?? false, is_active: true })
    .select('id, name, address, is_main, is_active')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

// PATCH — rename or toggle main
export async function PATCH(req: NextRequest) {
  let body: { id: string; name?: string; address?: string; isMain?: boolean; isActive?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const supabase = makeAdminClient();
  const u: Record<string, unknown> = {};
  if (body.name !== undefined) u.name = body.name.trim();
  if (body.address !== undefined) u.address = body.address?.trim() || null;
  if (body.isMain !== undefined) {
    if (body.isMain) await supabase.from('inventory_locations').update({ is_main: false }).eq('is_main', true);
    u.is_main = body.isMain;
  }
  if (body.isActive !== undefined) u.is_active = body.isActive;

  const { data, error } = await supabase
    .from('inventory_locations')
    .update(u)
    .eq('id', body.id)
    .select('id, name, address, is_main, is_active')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — soft delete (set is_active = false)
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const supabase = makeAdminClient();
  const { error } = await supabase.from('inventory_locations').update({ is_active: false }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
