import { createClient as createSupabase } from '@supabase/supabase-js';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const API_VERSION = '2024-10';

// Location ID: prefer env var, otherwise auto-discover and cache
let _locationIdCache: string | null = null;

async function getLocationId(): Promise<string> {
  if (process.env.SHOPIFY_LOCATION_ID) return process.env.SHOPIFY_LOCATION_ID;
  if (_locationIdCache) return _locationIdCache;

  // Try app_config first
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('value')
      .eq('key', 'shopify_location_id')
      .maybeSingle();
    if (data?.value) { _locationIdCache = data.value; return data.value; }
  } catch { /* fall through */ }

  // Auto-discover from Shopify Locations API
  try {
    const res = await shopifyFetch('/locations.json?limit=1');
    if (res.ok) {
      const json = await res.json();
      const loc = json.locations?.[0];
      if (loc?.id) {
        const id = String(loc.id);
        _locationIdCache = id;
        // Persist so subsequent calls skip the API round-trip
        await getSupabase().from('app_config').upsert({ key: 'shopify_location_id', value: id, updated_at: new Date().toISOString() }).catch(() => {});
        console.log('[shopify] auto-discovered location_id:', id);
        return id;
      }
    }
  } catch (e) {
    console.error('[shopify] location auto-discovery failed:', e);
  }

  return '';
}

function getSupabase() {
  // Use service role key when available (bypasses RLS for server-side writes)
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

export async function getAccessToken(): Promise<string | null> {
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;
  try {
    const { data } = await getSupabase()
      .from('app_config')
      .select('value')
      .eq('key', 'shopify_access_token')
      .maybeSingle();
    return data?.value ?? null;
  } catch { return null; }
}

export async function saveAccessToken(token: string): Promise<void> {
  const { error } = await getSupabase().from('app_config').upsert({
    key: 'shopify_access_token',
    value: token,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`saveAccessToken failed: ${error.message} (code: ${error.code})`);
}

async function shopifyFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new Error('Shopify access token not configured. Visit /api/shopify/install to connect.');
  return fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
      ...(options.headers ?? {}),
    },
  });
}

/**
 * Adjust inventory level by a delta (positive = add, negative = deduct).
 */
export async function adjustInventoryLevel(inventoryItemId: string, delta: number): Promise<boolean> {
  if (!inventoryItemId || delta === 0) return true;
  const locationId = await getLocationId();
  if (!locationId) { console.error('[shopify] adjustInventory: no location_id'); return false; }
  try {
    const res = await shopifyFetch('/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: Number(inventoryItemId),
        location_id: Number(locationId),
        available_adjustment: delta,
      }),
    });
    if (!res.ok) {
      console.error('Shopify adjustInventory failed:', await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('Shopify adjustInventory error:', e);
    return false;
  }
}

/**
 * Set inventory to an absolute quantity.
 * Uses GraphQL inventorySetQuantities (2024+ recommended) with REST fallback.
 */
export async function setInventoryLevel(inventoryItemId: string, qty: number): Promise<boolean> {
  if (!inventoryItemId) return false;
  const locationId = await getLocationId();
  if (!locationId) { console.error('[shopify] setInventory: no location_id'); return false; }

  // ── Primary: GraphQL inventorySetQuantities ──────────────────────────────
  // More reliable than REST set.json — works even when item not yet connected
  try {
    const token = await getAccessToken();
    if (!token) throw new Error('no token');
    const gqlRes = await fetch(`https://${STORE_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: `mutation inventorySetQty($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) {
            inventoryAdjustmentGroup { id }
            userErrors { field message }
          }
        }`,
        variables: {
          input: {
            name: 'available',
            reason: 'correction',
            quantities: [{
              inventoryItemId: `gid://shopify/InventoryItem/${inventoryItemId}`,
              locationId: `gid://shopify/Location/${locationId}`,
              quantity: Math.max(0, Math.round(qty)),
            }],
          },
        },
      }),
    });
    if (gqlRes.ok) {
      const json = await gqlRes.json();
      const errors = json?.data?.inventorySetQuantities?.userErrors ?? [];
      if (errors.length === 0) return true;
      console.warn('[shopify] GraphQL inventorySetQuantities userErrors:', errors);
      // Fall through to REST if GraphQL returns user errors
    }
  } catch (e) {
    console.warn('[shopify] GraphQL setInventory failed, trying REST:', e);
  }

  // ── Fallback: REST inventory_levels/set.json ─────────────────────────────
  try {
    // First ensure item is connected to location
    await shopifyFetch('/inventory_levels/connect.json', {
      method: 'POST',
      body: JSON.stringify({
        location_id: Number(locationId),
        inventory_item_id: Number(inventoryItemId),
        relocate_if_necessary: false,
      }),
    }).catch(() => {});

    const res = await shopifyFetch('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: Number(inventoryItemId),
        location_id: Number(locationId),
        available: Math.max(0, Math.round(qty)),
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[shopify] REST setInventory failed:', errText);
      return false;
    }
    return true;
  } catch (e) {
    console.error('[shopify] REST setInventory error:', e);
    return false;
  }
}

/**
 * Get total paid revenue from Shopify orders for a date range.
 */
export async function getShopifyRevenue(startISO: string, endISO: string): Promise<number> {
  const token = await getAccessToken();
  if (!token || !STORE_DOMAIN) return 0;
  try {
    const params = new URLSearchParams({
      status: 'any',
      financial_status: 'paid',
      created_at_min: startISO,
      created_at_max: endISO,
      limit: '250',
      fields: 'total_price',
    });
    const res = await shopifyFetch(`/orders.json?${params}`);
    if (!res.ok) return 0;
    const json = await res.json();
    const orders: Array<{ total_price: string }> = json.orders ?? [];
    return orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0);
  } catch { return 0; }
}

/**
 * Given a POS product UUID, look up its shopify_inventory_item_id from the products table.
 * Returns null if not linked.
 */
export async function getInventoryItemId(productId: string): Promise<string | null> {
  try {
    const { data } = await getSupabase()
      .from('products')
      .select('shopify_inventory_item_id, shopify')
      .eq('id', productId)
      .maybeSingle();
    if (!data?.shopify || !data.shopify_inventory_item_id) return null;
    return data.shopify_inventory_item_id;
  } catch { return null; }
}

/**
 * Test the connection by fetching one product. Returns ok=true if the token works.
 */
export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await shopifyFetch('/products.json?limit=1&fields=id,title');
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/**
 * Fetch today's paid orders count and total revenue.
 */
export async function getShopifyStatsToday(): Promise<{ ordersCount: number; revenue: number }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  try {
    const params = new URLSearchParams({
      status: 'any',
      financial_status: 'paid',
      created_at_min: todayStart.toISOString(),
      created_at_max: todayEnd.toISOString(),
      limit: '250',
      fields: 'total_price',
    });
    const res = await shopifyFetch(`/orders.json?${params}`);
    if (!res.ok) return { ordersCount: 0, revenue: 0 };
    const json = await res.json();
    const orders: Array<{ total_price: string }> = json.orders ?? [];
    return {
      ordersCount: orders.length,
      revenue: orders.reduce((sum, o) => sum + parseFloat(o.total_price || '0'), 0),
    };
  } catch { return { ordersCount: 0, revenue: 0 }; }
}

/**
 * Register the orders/paid webhook pointing at our endpoint.
 * Skips if already registered with the same address.
 */
export async function registerWebhook(address: string): Promise<{ ok: boolean; webhookId?: string; alreadyExists?: boolean }> {
  try {
    // Check for an existing webhook with this address
    const listRes = await shopifyFetch('/webhooks.json?topic=orders%2Fpaid&limit=50');
    if (listRes.ok) {
      const listJson = await listRes.json();
      const existing = (listJson.webhooks ?? []).find((w: { address: string; id: number }) => w.address === address);
      if (existing) {
        await getSupabase().from('app_config').upsert({ key: 'shopify_webhook_id', value: String(existing.id), updated_at: new Date().toISOString() });
        return { ok: true, webhookId: String(existing.id), alreadyExists: true };
      }
    }
  } catch { /* proceed to register */ }

  const res = await shopifyFetch('/webhooks.json', {
    method: 'POST',
    body: JSON.stringify({ webhook: { topic: 'orders/paid', address, format: 'json' } }),
  });

  if (!res.ok) {
    console.error('Webhook registration failed:', await res.text());
    return { ok: false };
  }

  const json = await res.json();
  const webhookId = String(json.webhook?.id ?? '');
  await getSupabase().from('app_config').upsert({ key: 'shopify_webhook_id', value: webhookId, updated_at: new Date().toISOString() });
  return { ok: true, webhookId };
}

// ─── Recent orders ────────────────────────────────────────────────────────────

export interface ShopifyOrderLineItem {
  id: number;
  title: string;
  name: string;
  quantity: number;
  price: string;
  sku: string | null;
}

export interface ShopifyOrderSummary {
  id: number;
  name: string; // "#1234"
  order_number: number;
  created_at: string;
  financial_status: string;
  fulfillment_status: string | null;
  total_price: string;
  subtotal_price: string;
  phone: string | null;
  customer: { first_name: string; last_name: string; email: string; phone: string | null } | null;
  shipping_address: { name: string; address1: string; address2?: string | null; city: string; zip: string; country: string; phone?: string | null } | null;
  billing_address: { phone?: string | null } | null;
  shipping_lines: Array<{ title: string; price: string }>;
  line_items: ShopifyOrderLineItem[];
  note: string | null;
}

export async function getRecentOrders(limit = 10): Promise<ShopifyOrderSummary[]> {
  try {
    const res = await shopifyFetch(`/orders.json?status=any&limit=${limit}&order=created_at+desc`);
    if (!res.ok) return [];
    const json = await res.json();
    return json.orders ?? [];
  } catch { return []; }
}

export async function getLastSyncAt(): Promise<string | null> {
  try {
    const { data } = await getSupabase().from('app_config').select('value').eq('key', 'shopify_last_sync_at').maybeSingle();
    return data?.value ?? null;
  } catch { return null; }
}

export async function updateLastSyncAt(): Promise<void> {
  await getSupabase().from('app_config').upsert({ key: 'shopify_last_sync_at', value: new Date().toISOString(), updated_at: new Date().toISOString() });
}
