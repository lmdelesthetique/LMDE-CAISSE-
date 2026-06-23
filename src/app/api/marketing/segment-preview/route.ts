import { NextRequest, NextResponse } from 'next/server';
import { getSegmentClients, SEGMENTS, type SegmentKey } from '@/lib/segmentationService';

export async function GET(req: NextRequest) {
  const segment = req.nextUrl.searchParams.get('segment') as SegmentKey | null;
  if (!segment) return NextResponse.json({ error: 'segment requis' }, { status: 400 });

  const valid = SEGMENTS.map(s => s.key);
  if (!valid.includes(segment)) return NextResponse.json({ error: 'Segment invalide' }, { status: 400 });

  try {
    const clients = await getSegmentClients(segment);
    const preview = clients.slice(0, 5).map(c => ({
      id: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      phone: c.phone,
    }));
    return NextResponse.json({ count: clients.length, preview });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
