import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/devis-pro?statut=valide&client_id=uuid&limit=50&offset=0
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const statut = searchParams.get('statut');
  const clientId = searchParams.get('client_id');
  const limit = parseInt(searchParams.get('limit') ?? '100');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const supabase = createAdminClient();

  let query = supabase
    .from('devis_pro')
    .select(`
      *,
      client:clients(id, firstName:first_name, lastName:last_name, phone, clientType:client_type, whatsapp)
    `)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (statut && statut !== 'tous') query = query.eq('statut', statut);
  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ devis: data ?? [] });
}

// POST /api/devis-pro
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  if (!body.client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 });

  const supabase = createAdminClient();

  // Numero: YYMM-RAND4 avoids race conditions from count-based approach
  const _now = new Date();
  const _yy = _now.getFullYear().toString().slice(-2);
  const _mm = String(_now.getMonth() + 1).padStart(2, '0');
  const _rand = Math.floor(Math.random() * 9000) + 1000;
  const numero = `DEV-${_yy}${_mm}-${_rand}`;

  const payload = {
    client_id: body.client_id,
    numero,
    items: body.items ?? [],
    discount_pct: body.discount_pct ?? 0,
    credit: body.credit ?? 0,
    total_ttc: body.total_ttc ?? 0,
    client_pays: body.client_pays ?? 0,
    free_shipping: body.free_shipping ?? false,
    statut: body.statut ?? 'brouillon',
    type_expedition: body.type_expedition ?? 'retrait',
    adresse_livraison: body.adresse_livraison ?? null,
    notes: body.notes ?? null,
    notes_preparation: body.notes_preparation ?? null,
    pdf_url: body.pdf_url ?? null,
    paiements: body.paiements ?? [],
    paye_total: body.paye_total ?? 0,
    sent_at: body.sent_at ?? null,
    validated_at: body.validated_at ?? null,
    created_at: body.created_at ?? new Date().toISOString(),
  };

  const { data, error } = await supabase.from('devis_pro').insert(payload).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ devis: data }, { status: 201 });
}
