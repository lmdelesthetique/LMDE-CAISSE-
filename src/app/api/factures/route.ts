import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const supabase = makeClient();
  const { data, error } = await supabase
    .from('factures')
    .insert(body)
    .select('id, numero')
    .single();

  if (error) {
    console.error('[api/factures POST]', error.code, error.message);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, numero: data.numero }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get('type') ?? 'all';
  const supabase = makeClient();

  let query = supabase
    .from('factures')
    .select('id, numero, doc_type, client_name, total_ttc, status, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (docType !== 'all') query = query.eq('doc_type', docType);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
