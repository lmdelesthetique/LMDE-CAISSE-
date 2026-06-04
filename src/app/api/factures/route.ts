import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function generateNumero(supabase: ReturnType<typeof makeClient>, docType: string): Promise<string> {
  const prefix = docType === 'devis' ? 'DEV' : 'FAC';
  const year = new Date().getFullYear();

  // Find the highest sequence number for this prefix+year
  const { data } = await supabase
    .from('factures')
    .select('numero')
    .like('numero', `${prefix}-${year}-%`)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let nextSeq = 1;
  if (data?.numero) {
    const parts = String(data.numero).split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  return `${prefix}-${year}-${String(nextSeq).padStart(4, '0')}`;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    console.error('[api/factures] client init error:', e.message);
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const docType = String(body.doc_type ?? body.type ?? 'facture');
  const isDevis = docType === 'devis';

  // Generate server-side sequential numero (ignore client-provided one)
  let numero: string;
  try {
    numero = await generateNumero(supabase, docType);
  } catch {
    // Fallback to timestamp-based if sequence query fails
    const now = new Date();
    const prefix = isDevis ? 'DEV' : 'FAC';
    numero = `${prefix}-${now.getFullYear()}-${String(Date.now()).slice(-6)}`;
  }

  const row = {
    numero,
    doc_type: docType,
    client_name: body.client_name ?? body.clientName ?? null,
    client_email: body.client_email ?? body.clientEmail ?? null,
    items: body.items ?? [],
    total_ht: Number(body.total_ht ?? body.subtotalHT ?? 0),
    total_tva: Number(body.total_tva ?? body.tvaAmount ?? 0),
    total_ttc: Number(body.total_ttc ?? body.totalTTC ?? 0),
    tva_rate: Number(body.tva_rate ?? 8.5),
    payment_method: body.payment_method ?? body.paymentMethod ?? null,
    status: body.status ?? body.statut ?? (isDevis ? 'en_attente' : 'payee'),
    receipt_ref: body.receipt_ref ?? body.receiptId ?? null,
    // Devis are NEVER counted in CA
    is_counted_in_ca: isDevis ? false : (body.is_counted_in_ca ?? body.isCountedInCA ?? true),
  };

  const { data, error } = await supabase
    .from('factures')
    .insert(row)
    .select('id, numero')
    .single();

  if (error) {
    console.error('[api/factures POST]', error.code, error.message, row);
    return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, numero: data.numero }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const docType = searchParams.get('type') ?? 'all';

  let supabase: ReturnType<typeof makeClient>;
  try {
    supabase = makeClient();
  } catch (e: any) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  let query = supabase
    .from('factures')
    .select('id, numero, doc_type, client_name, total_ttc, status, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (docType !== 'all') query = query.eq('doc_type', docType);

  const { data, error } = await query;
  if (error) {
    console.error('[api/factures GET]', error.code, error.message);
    // Return empty array instead of 500 so the page still renders
    return NextResponse.json([]);
  }
  return NextResponse.json(data ?? []);
}
