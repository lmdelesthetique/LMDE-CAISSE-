import { NextResponse } from 'next/server';
import { getAccessToken, testConnection, getShopifyStatsToday, getLastSyncAt } from '@/lib/services/shopifyService';
import { createClient as createSupabase } from '@supabase/supabase-js';

function getSupabase() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function GET() {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({
      connected: false,
      error: 'Token non configuré — visite /api/shopify/install',
      ordersToday: 0,
      revenueToday: 0,
      lastSyncAt: null,
      webhookRegistered: false,
      webhookId: null,
    });
  }

  const [connectionResult, statsToday, lastSyncAt, webhookConfig] = await Promise.all([
    testConnection(),
    getShopifyStatsToday(),
    getLastSyncAt(),
    getSupabase().from('app_config').select('value').eq('key', 'shopify_webhook_id').maybeSingle(),
  ]);

  return NextResponse.json({
    connected: connectionResult.ok,
    error: connectionResult.error ?? null,
    ordersToday: statsToday.ordersCount,
    revenueToday: statsToday.revenue,
    lastSyncAt,
    webhookRegistered: !!(webhookConfig.data?.value),
    webhookId: webhookConfig.data?.value ?? null,
  });
}
