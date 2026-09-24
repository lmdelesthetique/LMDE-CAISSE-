import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { randomBytes } from 'crypto';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/devis-pro/[id]/generate-token
// Idempotent: returns existing token if already generated
export async function POST(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from('devis_pro')
    .select('client_token')
    .eq('id', id)
    .maybeSingle();

  const existingToken = (existing as any)?.client_token;
  if (existingToken) return NextResponse.json({ token: existingToken });

  const token = randomBytes(20).toString('hex');

  const { error } = await supabase
    .from('devis_pro')
    .update({ client_token: token, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
