import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSegmentCount, SEGMENTS, type SegmentKey } from '@/lib/segmentationService';

function makeAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// Returns 5 sample clients for segments that are simple direct-DB queries.
// Complex segments (vip, inactifs, ambassadrice…) return empty preview — count is enough.
async function getPreviewClients(segment: SegmentKey): Promise<{ id: string; name: string; phone: string }[]> {
  const supabase = makeAdminClient();
  const now = new Date();

  let data: any[] | null = null;

  switch (segment) {
    case 'tous': {
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'nouvelle_cliente': {
      const d = new Date(now); d.setDate(now.getDate() - 14);
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .gte('created_at', d.toISOString()).not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'nouvelles': {
      const d = new Date(now); d.setDate(now.getDate() - 30);
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .gte('created_at', d.toISOString()).not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'pro': {
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .eq('client_type', 'professionnel').not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'fidelite_300pts': {
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .gte('loyalty_points', 300).not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'points_eleves': {
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .gte('loyalty_points', 200).not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    case 'anniversaire_mois': {
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const res = await supabase.from('clients').select('id, first_name, last_name, phone')
        .like('birth_date', `%-${month}-%`).not('phone', 'is', null).neq('phone', '').limit(5);
      data = res.data;
      break;
    }
    default:
      return []; // Complex segments — count only
  }

  return (data ?? []).map(c => ({
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || c.phone || '',
    phone: c.phone ?? '',
  }));
}

export async function GET(req: NextRequest) {
  const segment = req.nextUrl.searchParams.get('segment') as SegmentKey | null;
  if (!segment) return NextResponse.json({ error: 'segment requis' }, { status: 400 });

  const valid = SEGMENTS.map(s => s.key);
  if (!valid.includes(segment as SegmentKey)) return NextResponse.json({ error: 'Segment invalide' }, { status: 400 });

  try {
    const [count, preview] = await Promise.all([
      getSegmentCount(segment as SegmentKey),
      getPreviewClients(segment as SegmentKey),
    ]);
    return NextResponse.json({ count, preview });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
