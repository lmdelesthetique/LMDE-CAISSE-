import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

function generateCode(firstName: string, lastName: string): string {
  const base = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${base}${suffix}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Missing client id' }, { status: 400 });

  const supabase = createAdminClient();

  // Check if code already exists
  const { data: client, error: fetchErr } = await supabase
    .from('clients')
    .select('id, first_name, last_name, referral_code')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'Client introuvable' }, { status: 404 });
  if (client.referral_code) return NextResponse.json({ referralCode: client.referral_code });

  // Generate unique code (retry on collision)
  let code = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    code = generateCode(client.first_name ?? 'X', client.last_name ?? 'X');
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();
    if (!existing) break;
  }

  const { error: updateErr } = await supabase
    .from('clients')
    .update({ referral_code: code })
    .eq('id', id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ referralCode: code });
}
