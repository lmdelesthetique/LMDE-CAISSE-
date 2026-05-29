'use client';

import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeliveryStatus = 'pending' | 'assigned' | 'en_route' | 'delivered' | 'cancelled';

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
  assignedTo: string | null;
  assignedAt: string | null;
  enRouteAt: string | null;
  deliveredAt: string | null;
  estimatedTime: string | null;
  signatureUrl: string | null;
  photoUrl: string | null;
  driverNotes: string | null;
  createdAt: string;
  // Joined
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
  assignedTo?: string;
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
    assignedTo: row.assigned_to ?? null,
    assignedAt: row.assigned_at ?? null,
    enRouteAt: row.en_route_at ?? null,
    deliveredAt: row.delivered_at ?? null,
    estimatedTime: row.estimated_time ?? null,
    signatureUrl: row.signature_url ?? null,
    photoUrl: row.photo_url ?? null,
    driverNotes: row.driver_notes ?? null,
    createdAt: row.created_at,
    driverName: row.employees
      ? `${row.employees.first_name ?? ''} ${row.employees.last_name ?? ''}`.trim()
      : null,
    driverPhone: row.employees?.portal_phone ?? null,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const deliveryService = {
  // Admin: get all deliveries with driver info
  async getAll(status?: DeliveryStatus | 'all'): Promise<Delivery[]> {
    const supabase = createClient();
    let q = supabase
      .from('deliveries')
      .select('*, employees(first_name, last_name, portal_phone, driver_status)')
      .order('created_at', { ascending: false });
    if (status && status !== 'all') q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapDelivery);
  },

  // Driver: get deliveries assigned to a driver
  async getForDriver(employeeId: string): Promise<Delivery[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .eq('assigned_to', employeeId)
      .not('status', 'eq', 'cancelled')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDelivery);
  },

  async getById(id: string): Promise<Delivery | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deliveries')
      .select('*, employees(first_name, last_name, portal_phone)')
      .eq('id', id)
      .single();
    if (error) return null;
    return mapDelivery(data);
  },

  async create(input: CreateDeliveryInput): Promise<Delivery> {
    const supabase = createClient();
    const insertData: any = {
      client_name: input.clientName,
      client_phone: input.clientPhone ?? null,
      delivery_address: input.deliveryAddress,
      delivery_notes: input.deliveryNotes ?? null,
      products: input.products ?? null,
      total_amount: input.totalAmount ?? null,
      estimated_time: input.estimatedTime ?? null,
      shopify_order_id: input.shopifyOrderId ?? null,
      shopify_order_number: input.shopifyOrderNumber ?? null,
      status: input.assignedTo ? 'assigned' : 'pending',
    };
    if (input.assignedTo) {
      insertData.assigned_to = input.assignedTo;
      insertData.assigned_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('deliveries')
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    return mapDelivery(data);
  },

  async assign(id: string, employeeId: string): Promise<Delivery> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deliveries')
      .update({
        assigned_to: employeeId,
        assigned_at: new Date().toISOString(),
        status: 'assigned',
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapDelivery(data);
  },

  async startRoute(id: string): Promise<Delivery> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deliveries')
      .update({ status: 'en_route', en_route_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapDelivery(data);
  },

  async confirmDelivery(
    id: string,
    opts: { signatureUrl?: string; photoUrl?: string; driverNotes?: string }
  ): Promise<Delivery> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('deliveries')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        signature_url: opts.signatureUrl ?? null,
        photo_url: opts.photoUrl ?? null,
        driver_notes: opts.driverNotes ?? null,
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapDelivery(data);
  },

  async cancel(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('deliveries')
      .update({ status: 'cancelled' })
      .eq('id', id);
    if (error) throw error;
  },

  // Upload signature base64 to storage
  async uploadSignature(deliveryId: string, base64: string): Promise<string> {
    const supabase = createClient();
    const blob = base64ToBlob(base64, 'image/png');
    const path = `${deliveryId}/signature.png`;
    const { error } = await supabase.storage
      .from('signatures')
      .upload(path, blob, { upsert: true, contentType: 'image/png' });
    if (error) throw error;
    const { data } = supabase.storage.from('signatures').getPublicUrl(path);
    return data.publicUrl;
  },

  // Upload delivery photo to storage
  async uploadPhoto(deliveryId: string, file: File): Promise<string> {
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${deliveryId}/photo.${ext}`;
    const { error } = await supabase.storage
      .from('delivery-photos')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from('delivery-photos').getPublicUrl(path);
    return data.publicUrl;
  },

  // Driver auth: check phone + PIN
  async driverLogin(phone: string, pin: string): Promise<{ id: string; name: string } | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name')
      .eq('portal_phone', phone)
      .eq('portal_pin', pin)
      .eq('is_delivery_driver', true)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: data.id,
      name: `${data.first_name ?? ''} ${data.last_name ?? ''}`.trim(),
    };
  },

  // Update driver online/offline status
  async setDriverStatus(employeeId: string, status: 'on' | 'off'): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase
      .from('employees')
      .update({ driver_status: status })
      .eq('id', employeeId);
    if (error) throw error;
  },

  // Admin: get all active drivers
  async getActiveDrivers(): Promise<{ id: string; name: string; phone: string | null; driverStatus: string }[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('id, first_name, last_name, portal_phone, driver_status')
      .eq('is_delivery_driver', true);
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id,
      name: `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim(),
      phone: r.portal_phone ?? null,
      driverStatus: r.driver_status ?? 'off',
    }));
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
  en_route:  { label: 'En route',    color: 'text-orange-800', bg: 'bg-orange-100 border-orange-300', dot: 'bg-orange-400' },
  delivered: { label: 'Livré',       color: 'text-green-800',  bg: 'bg-green-100 border-green-300',   dot: 'bg-green-400'  },
  cancelled: { label: 'Annulé',      color: 'text-red-800',    bg: 'bg-red-100 border-red-300',       dot: 'bg-red-400'    },
};
