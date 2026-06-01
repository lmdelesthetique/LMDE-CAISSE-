import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('clients')
      .update(body)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      console.error('[api/clients PATCH]', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
