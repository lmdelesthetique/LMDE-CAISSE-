import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — create a new client subscription
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { client_id, plan_id, portal_phone, pin_code, status, launch_offer, next_billing_date } = body;
  if (!client_id || !plan_id) {
    return NextResponse.json({ error: 'client_id and plan_id are required' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Check if client already has an active subscription
  const { data: existing } = await supabase
    .from('client_subscriptions')
    .select('id')
    .eq('client_id', client_id)
    .in('status', ['active', 'suspended'])
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: 'Ce client a déjà un abonnement actif ou suspendu.' }, { status: 409 });
  }

  const { data, error } = await supabase
    .from('client_subscriptions')
    .insert({
      client_id,
      plan_id,
      portal_phone: portal_phone || null,
      pin_code: pin_code || null,
      status: status || 'active',
      launch_offer: launch_offer ?? false,
      next_billing_date: next_billing_date || null,
    })
    .select()
    .single();

  if (error) {
    console.error('[POST /api/subscriptions]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
