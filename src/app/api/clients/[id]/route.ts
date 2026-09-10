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

// Fields that can be updated via the client form — sensitive financial fields
// (loyalty_points, store_credit, total_spent) are modified only through
// their own dedicated routes (loyalty/redemptions, returns, receipts).
const CLIENT_ALLOWED_FIELDS = new Set([
  'first_name', 'last_name', 'phone', 'email', 'address', 'city', 'zip',
  'country', 'birth_date', 'notes', 'acquisition_source', 'client_type',
  'is_pro', 'is_vip', 'pro_profile', 'tags', 'updated_at',
]);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Strip any fields not in the whitelist to prevent direct manipulation of
  // loyalty_points, store_credit, total_spent, etc.
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (CLIENT_ALLOWED_FIELDS.has(key)) updates[key] = value;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Aucun champ valide à mettre à jour' }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('clients')
      .update(updates)
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
