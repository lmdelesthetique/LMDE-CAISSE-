import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SEGMENTS, type SegmentKey } from '@/lib/segmentationService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Encode segment + channel + optional custom client IDs into the segment text field.
// Format: "key" | "key|channel" | "custom|id1,id2" | "custom|channel|id1,id2"
function encodeSegment(
  segment: string,
  channel: 'sms+email' | 'sms' | 'email',
  clientIds?: string[]
): string {
  if (clientIds?.length) {
    if (channel === 'sms+email') return `custom|${clientIds.join(',')}`;
    return `custom|${channel}|${clientIds.join(',')}`;
  }
  if (channel === 'sms+email') return segment;
  return `${segment}|${channel}`;
}

export async function GET() {
  try {
    const supabase = makeAdminClient();
    const { data, error } = await supabase
      .from('campagnes_marketing')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON invalide' }, { status: 400 }); }

  const { nom, segment, message, channel = 'sms+email', client_ids } = body as {
    nom?: string;
    segment?: string;
    message?: string;
    channel?: 'sms+email' | 'sms' | 'email';
    client_ids?: string[];
  };

  if (!nom?.trim()) return NextResponse.json({ error: 'Nom de campagne requis' }, { status: 400 });
  if (!message?.trim()) return NextResponse.json({ error: 'Message requis' }, { status: 400 });

  const validKeys = SEGMENTS.map(s => s.key) as string[];
  const hasCustomIds = Array.isArray(client_ids) && client_ids.length > 0;

  if (!hasCustomIds && (!segment || !validKeys.includes(segment))) {
    return NextResponse.json({ error: 'Segment invalide' }, { status: 400 });
  }

  const segmentValue = encodeSegment(segment ?? 'tous', channel, hasCustomIds ? client_ids : undefined);

  try {
    const supabase = makeAdminClient();
    const { data, error } = await supabase
      .from('campagnes_marketing')
      .insert({ nom: nom.trim(), segment: segmentValue, message: message.trim(), statut: 'brouillon' })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
