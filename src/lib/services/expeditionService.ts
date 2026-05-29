'use client';

import { createClient } from '@/lib/supabase/client';

export type ExpeditionStatus = 'pending' | 'label_generated' | 'shipped' | 'delivered' | 'returned';

export interface Expedition {
  id: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  clientName: string;
  clientPhone: string | null;
  shippingAddress: string;
  carrier: string;
  trackingNumber: string | null;
  labelPrinted: boolean;
  status: ExpeditionStatus;
  products: Array<{ name: string; qty: number; sku?: string; price?: number }> | null;
  totalAmount: number | null;
  notes: string | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PickupNotification {
  id: string;
  shopifyOrderId: string | null;
  shopifyOrderNumber: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  products: Array<{ name: string; qty: number; sku?: string; price?: number }> | null;
  totalAmount: number | null;
  notes: string | null;
  status: 'pending' | 'notified' | 'collected' | 'cancelled';
  collectedAt: string | null;
  createdAt: string;
}

export const EXPEDITION_STATUS_CONFIG: Record<ExpeditionStatus, { label: string; color: string; bg: string; dot: string }> = {
  pending:         { label: 'En attente',       color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-400' },
  label_generated: { label: 'Étiquette prête',  color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-400' },
  shipped:         { label: 'Expédié',           color: 'text-indigo-700', bg: 'bg-indigo-50 border-indigo-200',dot: 'bg-indigo-400' },
  delivered:       { label: 'Livré',             color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  dot: 'bg-green-400' },
  returned:        { label: 'Retourné',          color: 'text-red-700',    bg: 'bg-red-50 border-red-200',      dot: 'bg-red-400' },
};

function mapExpedition(row: any): Expedition {
  return {
    id: row.id,
    shopifyOrderId: row.shopify_order_id ?? null,
    shopifyOrderNumber: row.shopify_order_number ?? null,
    clientName: row.client_name,
    clientPhone: row.client_phone ?? null,
    shippingAddress: row.shipping_address,
    carrier: row.carrier ?? 'Colissimo',
    trackingNumber: row.tracking_number ?? null,
    labelPrinted: row.label_printed ?? false,
    status: row.status,
    products: row.products ?? null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    notes: row.notes ?? null,
    shippedAt: row.shipped_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPickup(row: any): PickupNotification {
  return {
    id: row.id,
    shopifyOrderId: row.shopify_order_id ?? null,
    shopifyOrderNumber: row.shopify_order_number ?? null,
    clientName: row.client_name,
    clientPhone: row.client_phone ?? null,
    clientEmail: row.client_email ?? null,
    products: row.products ?? null,
    totalAmount: row.total_amount != null ? Number(row.total_amount) : null,
    notes: row.notes ?? null,
    status: row.status,
    collectedAt: row.collected_at ?? null,
    createdAt: row.created_at,
  };
}

export const expeditionService = {
  async getAll(): Promise<Expedition[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from('expeditions')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapExpedition);
  },

  async markLabelPrinted(id: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('expeditions')
      .update({ label_printed: true, status: 'label_generated', updated_at: new Date().toISOString() })
      .eq('id', id);
  },

  async markShipped(id: string, trackingNumber: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('expeditions')
      .update({
        status: 'shipped',
        tracking_number: trackingNumber || null,
        shipped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  },

  async cancel(id: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('expeditions')
      .update({ status: 'returned', updated_at: new Date().toISOString() })
      .eq('id', id);
  },
};

export const pickupService = {
  async getAll(): Promise<PickupNotification[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from('pickup_notifications')
      .select('*')
      .order('created_at', { ascending: false });
    return (data ?? []).map(mapPickup);
  },

  async markCollected(id: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('pickup_notifications')
      .update({ status: 'collected', collected_at: new Date().toISOString() })
      .eq('id', id);
  },

  async markNotified(id: string): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('pickup_notifications')
      .update({ status: 'notified' })
      .eq('id', id);
  },
};
