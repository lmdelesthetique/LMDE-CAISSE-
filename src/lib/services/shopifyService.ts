import { createClient as createSupabase } from '@supabase/supabase-js';

const STORE_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? '';
const LOCATION_ID = process.env.SHOPIFY_LOCATION_ID ?? '';
const API_VERSION = '2024-10';

function getSupabase() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
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
  await getSupabase().from('app_config').upsert({
    key: 'shopify_access_token',
    value: token,
    updated_at: new Date().toISOString(),
  });
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
  if (!inventoryItemId || delta === 0 || !LOCATION_ID) return true;
  try {
    const res = await shopifyFetch('/inventory_levels/adjust.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: Number(inventoryItemId),
        location_id: Number(LOCATION_ID),
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
 */
export async function setInventoryLevel(inventoryItemId: string, qty: number): Promise<boolean> {
  if (!inventoryItemId || !LOCATION_ID) return false;
  try {
    const res = await shopifyFetch('/inventory_levels/set.json', {
      method: 'POST',
      body: JSON.stringify({
        inventory_item_id: Number(inventoryItemId),
        location_id: Number(LOCATION_ID),
        available: qty,
      }),
    });
    if (!res.ok) {
      console.error('Shopify setInventory failed:', await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('Shopify setInventory error:', e);
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
