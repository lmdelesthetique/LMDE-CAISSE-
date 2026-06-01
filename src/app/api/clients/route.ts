import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('clients')
      .insert(body)
      .select()
      .single();
    if (error) {
      console.error('[api/clients POST]', error.code, error.message);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
