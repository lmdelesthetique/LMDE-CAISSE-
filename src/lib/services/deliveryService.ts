'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'assigned' | 'en_route' | 'arrived' | 'delivered' | 'cancelled' | 'problem';

export interface DeliveryProduct {
  name: string;
  qty: number;
  imageUrl?: string;
  sku?: string;
  price?: number;
}

export interface Delivery {
  id: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  clientName: string;
  clientPhone: string | null;
  deliveryAddress: string;
  deliveryNotes: string | null;
  products: DeliveryProduct[] | null;
  totalAmount: number | null;
  status: DeliveryStatus;
  assignedTo: string | null;       // driver UUID (assigned_to_driver)
  assignedAt: string | null;
  enRouteAt: string | null;
  arrivedAt: string | null;
  deliveredAt: string | null;
  estimatedTime: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  driverNotes: string | null;
  createdAt: string;
  receiptId: string | null;
  // Driver invoice fields
  driverFee: number | null;
  driverInvoiceUrl: string | null;
  driverInvoicePaid: boolean;
  driverInvoicePaidAt: string | null;
  // Joined from drivers table
  driverName?: string | null;
  driverPhone?: string | null;
}

export interface CreateDeliveryInput {
  clientName: string;
  clientPhone?: string;
  deliveryAddress: string;
  deliveryNotes?: string;
  products?: DeliveryProduct[];
  totalAmount?: number;
  estimatedTime?: string;
  assignedTo?: string;             // driver UUID
  shopifyOrderId?: string;
  shopifyOrderNumber?: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function mapDelivery(row: any): Delivery {
  return {
    id: row.id,
    shopifyOrderId: row.shopify_order_id ?? null,
    shopifyOrderNumber: row.shopify_order_number ?? null,
    clientName: row.client_name,
    clientPhone: row.client_phone ?? null,
    deliveryAddress: row.delivery_address,
    deliveryNotes: row.delivery_notes ?? null,
    products: row.products ?? null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    status: row.status as DeliveryStatus,
    assignedTo: row.assigned_to_driver ?? null,
    assignedAt: row.assigned_at ?? null,
    enRouteAt: row.en_route_at ?? null,
    arrivedAt: row.arrived_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    estimatedTime: row.estimated_time ?? null,
    signatureUrl: row.signature_url ?? null,
    photoUrl: row.photo_url ?? null,
    driverNotes: row.driver_notes ?? null,
    createdAt: row.created_at,
    receiptId: row.receipt_id ?? null,
    driverFee: row.driver_fee != null ? Number(row.driver_fee) : null,
    driverInvoiceUrl: row.driver_invoice_url ?? null,
    driverInvoicePaid: Boolean(row.driver_invoice_paid),
    driverInvoicePaidAt: row.driver_invoice_paid_at ?? null,
    driverName: row.drivers
      ? `${row.drivers.first_name ?? ''} ${row.drivers.last_name ?? ''}`.trim()
      : null,
    driverPhone: row.drivers?.phone ?? null,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

// ─── Admin API helpers ───────────────────────────────────────────────────────

async function patchDelivery(id: string, patch: Record<string, any>): Promise<Delivery> {
  const res = await fetch(`/api/deliveries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`deliveries PATCH ${id}: HTTP ${res.status}`);
  const data = await res.json();
  return mapDelivery(data.delivery);
}

export const deliveryService = {
  async getAll(status?: DeliveryStatus | 'all'): Promise<Delivery[]> {
    const params = status && status !== 'all' ? `?status=${status}` : '';
    const res = await fetch(`/api/deliveries${params}`);
    if (!res.ok) throw new Error(`deliveries GET: HTTP ${res.status}`);
    const data = await res.json();
    return (data ?? []).map(mapDelivery);
  },

  async getForDriver(driverId: string): Promise<Delivery[]> {
    const res = await fetch(`/api/deliveries?driverId=${driverId}`);
    if (!res.ok) throw new Error(`deliveries getForDriver: HTTP ${res.status}`);
    const data = await res.json();
    return (data ?? []).map(mapDelivery);
  },

  async getById(id: string): Promise<Delivery | null> {
    const res = await fetch(`/api/deliveries/${id}`).catch(() => null);
    if (!res?.ok) return null;
    return mapDelivery(await res.json());
  },

  async create(input: CreateDeliveryInput): Promise<Delivery> {
    const res = await fetch('/api/deliveries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`deliveries POST: HTTP ${res.status}`);
    const data = await res.json();
    return mapDelivery(data.delivery);
  },

  async assign(id: string, driverId: string): Promise<Delivery> {
    return patchDelivery(id, {
      assigned_to_driver: driverId,
      assigned_at: new Date().toISOString(),
      status: 'assigned',
    });
  },

  async startRoute(id: string): Promise<Delivery> {
    return patchDelivery(id, { status: 'en_route', en_route_at: new Date().toISOString() });
  },

  async markArrived(id: string): Promise<Delivery> {
    return patchDelivery(id, { status: 'arrived', arrived_at: new Date().toISOString() });
  },

  async confirmDelivery(
    id: string,
    opts: { signatureUrl?: string; photoUrl?: string; driverNotes?: string }
  ): Promise<Delivery> {
    return patchDelivery(id, {
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      signature_url: opts.signatureUrl ?? null,
      photo_url: opts.photoUrl ?? null,
      driver_notes: opts.driverNotes ?? null,
    });
  },

  async cancel(id: string): Promise<void> {
    const res = await fetch(`/api/deliveries/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`deliveries DELETE ${id}: HTTP ${res.status}`);
  },

  // Storage uploads stay on anon client — public buckets, no RLS on storage
  async uploadSignature(deliveryId: string, base64: string): Promise<string> {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const blob = base64ToBlob(base64, 'image/png');
    const path = `${deliveryId}/signature.png`;
    const { error } = await supabase.storage.from('signatures').upload(path, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
    return supabase.storage.from('signatures').getPublicUrl(path).data.publicUrl;
  },

  async uploadDriverInvoice(deliveryId: string, file: File): Promise<string> {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `${deliveryId}/invoice_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('driver-invoices').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    return supabase.storage.from('driver-invoices').getPublicUrl(path).data.publicUrl;
  },

  async uploadPhoto(deliveryId: string, file: File): Promise<string> {
    const { createClient } = await import('@/lib/supabase/client');
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${deliveryId}/photo.${ext}`;
    const { error } = await supabase.storage.from('delivery-photos').upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    return supabase.storage.from('delivery-photos').getPublicUrl(path).data.publicUrl;
  },

  async driverLogin(phone: string, pin: string): Promise<{ id: string; name: string } | null> {
    const res = await fetch('/api/deliveries/driver-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, pin }),
    }).catch(() => null);
    if (!res?.ok) return null;
    return await res.json();
  },

  async setDriverStatus(driverId: string, status: 'on' | 'off'): Promise<void> {
    await fetch(`/api/deliveries/drivers/${driverId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver_status: status }),
    }).catch(() => {});
  },

  async getActiveDrivers(): Promise<{ id: string; name: string; phone: string | null; driverStatus: string }[]> {
    const res = await fetch('/api/deliveries/drivers').catch(() => null);
    if (!res?.ok) return [];
    return await res.json();
  },
};

// ─── Helper ───────────────────────────────────────────────────────────────────

function base64ToBlob(base64: string, type: string): Blob {
  const byteString = atob(base64.split(',')[1] ?? base64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type });
}

// ─── Status config ────────────────────────────────────────────────────────────

export const DELIVERY_STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending:   { label: 'En attente',  color: 'text-yellow-800', bg: 'bg-yellow-100 border-yellow-300', dot: 'bg-yellow-400' },
  assigned:  { label: 'Assigné',     color: 'text-blue-800',   bg: 'bg-blue-100 border-blue-300',     dot: 'bg-blue-400'   },
  en_route:  { label: 'En route',    color: 'text-orange-800',  bg: 'bg-orange-100 border-orange-300',  dot: 'bg-orange-400'  },
  arrived:   { label: 'Arrivé',      color: 'text-purple-800', bg: 'bg-purple-100 border-purple-300', dot: 'bg-purple-400'  },
  delivered: { label: 'Livré',       color: 'text-green-800',  bg: 'bg-green-100 border-green-300',   dot: 'bg-green-400'   },
  cancelled: { label: 'Annulé',      color: 'text-red-800',    bg: 'bg-red-100 border-red-300',       dot: 'bg-red-400'    },
  problem:   { label: 'Problème',    color: 'text-red-800',    bg: 'bg-red-50 border-red-200',        dot: 'bg-red-500'    },
};
