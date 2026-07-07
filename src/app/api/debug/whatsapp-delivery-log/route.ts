import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await supabase
    .from('notification_log')
    .select('id, direction, from_phone, message_type, body, created_at')
    .eq('channel', 'whatsapp')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    // Table might not exist yet
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return NextResponse.json({ events: [], tableExists: false });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: data ?? [], tableExists: true });
}
