import { NextRequest, NextResponse } from 'next/server';
import { getSegmentCount, SEGMENTS, type SegmentKey } from '@/lib/segmentationService';

export async function GET(req: NextRequest) {
  const segment = req.nextUrl.searchParams.get('segment') as SegmentKey | null;
  if (!segment) return NextResponse.json({ error: 'segment requis' }, { status: 400 });

  const valid = SEGMENTS.map(s => s.key);
  if (!valid.includes(segment as SegmentKey)) return NextResponse.json({ error: 'Segment invalide' }, { status: 400 });

  try {
    const count = await getSegmentCount(segment as SegmentKey);
    return NextResponse.json({ count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
