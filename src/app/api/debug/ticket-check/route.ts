import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const envCheck = {
    hasUrl: !!url,
    hasServiceKey: !!serviceKey,
    hasAnonKey: !!anonKey,
    keyUsed: serviceKey ? 'service_role' : anonKey ? 'anon' : 'NONE',
  };

  if (!url || (!serviceKey && !anonKey)) {
    return NextResponse.json({ envCheck, error: 'Missing env vars' }, { status: 500 });
  }

  const supabase = createClient(url, serviceKey || anonKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Test 1: Can we read receipts table?
  const { data: allReceipts, error: e1 } = await supabase
    .from('receipts')
    .select('id, ticket_number, items, total_amount, created_at, status')
    .order('created_at', { ascending: false })
    .limit(5);

  // Test 2: Does items column exist and have data?
  const itemsCheck = allReceipts?.map(r => ({
    ticket: r.ticket_number,
    status: r.status,
    total: r.total_amount,
    hasItems: !!r.items,
    itemsType: typeof r.items,
    itemsLength: Array.isArray(r.items) ? r.items.length : 'not array',
    itemsValue: r.items,
  }));

  // Test 3: Fetch a specific receipt by ID to simulate the modal call
  let singleTest = null;
  if (allReceipts && allReceipts.length > 0) {
    const firstId = allReceipts[0].id;
    const { data: single, error: e2 } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', firstId)
      .maybeSingle();
    singleTest = { id: firstId, error: e2?.message, found: !!single, columns: single ? Object.keys(single) : [] };
  }

  return NextResponse.json({
    envCheck,
    queryError: e1?.message ?? null,
    totalFound: allReceipts?.length ?? 0,
    itemsCheck,
    singleTest,
  });
}
