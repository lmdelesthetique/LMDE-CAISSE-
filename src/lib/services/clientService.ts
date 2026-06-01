'use client';

import { createClient } from '@/lib/supabase/client';
import { fetchAll } from '@/lib/utils/fetchAll';

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  dateOfBirth: string | null;
  gender: 'female' | 'male' | 'other' | 'not_specified';
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  notes: string | null;
  loyaltyPoints: number;
  loyaltyTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  storeCredit: number;
  totalSpent: number;
  totalVisits: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // New fields
  clientType: 'particulier' | 'professionnel' | 'vip' | 'abonne' | 'non_abonne';
  loyaltyDiscountType: 'pro_5' | 'pro_10' | 'pro_15' | 'custom' | 'vip' | 'classic' | null;
  loyaltyDiscountValue: number;
  lastPurchaseAt: string | null;
  balanceDue: number;
}

export interface ClientSubscription {
  id: string;
  clientId: string;
  subscriptionType: string;
  discountPercent: number;
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  startDate: string;
  endDate: string | null;
  autoRenew: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInternalNote {
  id: string;
  clientId: string;
  content: string;
  author: string;
  createdAt: string;
}

export interface ClientPurchase {
  id: string;
  clientId: string;
  receiptNumber: string;
  items: PurchaseItem[];
  subtotalHt: number;
  totalTva: number;
  totalTtc: number;
  discountAmount: number;
  paymentMethod: string;
  status: 'completed' | 'refunded' | 'partial_refund' | 'cancelled';
  loyaltyPointsEarned: number;
  loyaltyPointsUsed: number;
  storeCreditUsed: number;
  cashierName: string | null;
  notes: string | null;
  purchasedAt: string;
}

export interface PurchaseItem {
  name: string;
  qty: number;
  price: number;
  total: number;
  sku?: string;
}

export interface LoyaltyTransaction {
  id: string;
  clientId: string;
  purchaseId: string | null;
  pointsChange: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

export interface CreateClientInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  dateOfBirth?: string;
  gender?: 'female' | 'male' | 'other' | 'not_specified';
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  notes?: string;
  clientType?: 'particulier' | 'professionnel' | 'vip' | 'abonne' | 'non_abonne';
  loyaltyDiscountType?: 'pro_5' | 'pro_10' | 'pro_15' | 'custom' | 'vip' | 'classic' | null;
  loyaltyDiscountValue?: number;
}

export interface RecordPurchaseInput {
  clientId: string;
  receiptNumber: string;
  items: PurchaseItem[];
  subtotalHt: number;
  totalTva: number;
  totalTtc: number;
  discountAmount?: number;
  paymentMethod: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsUsed?: number;
  storeCreditUsed?: number;
  cashierName?: string;
  notes?: string;
}

export interface CreateSubscriptionInput {
  clientId: string;
  subscriptionType: string;
  discountPercent: number;
  status: 'active' | 'inactive' | 'expired' | 'suspended';
  startDate: string;
  endDate?: string;
  autoRenew?: boolean;
  notes?: string;
}

function mapClient(row: any): Client {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: `${row.first_name} ${row.last_name}`,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    dateOfBirth: row.date_of_birth,
    gender: row.gender,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    country: row.country,
    notes: row.notes,
    loyaltyPoints: row.loyalty_points ?? 0,
    loyaltyTier: row.loyalty_tier ?? 'bronze',
    storeCredit: parseFloat(row.store_credit ?? 0),
    totalSpent: parseFloat(row.total_spent ?? 0),
    totalVisits: row.total_visits ?? 0,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    clientType: row.client_type ?? 'particulier',
    loyaltyDiscountType: row.loyalty_discount_type ?? null,
    loyaltyDiscountValue: parseFloat(row.loyalty_discount_value ?? 0),
    lastPurchaseAt: row.last_purchase_at ?? null,
    balanceDue: parseFloat(row.balance_due ?? 0),
  };
}

function mapPurchase(row: any): ClientPurchase {
  return {
    id: row.id,
    clientId: row.client_id,
    receiptNumber: row.receipt_number,
    items: Array.isArray(row.items) ? row.items : [],
    subtotalHt: parseFloat(row.subtotal_ht ?? 0),
    totalTva: parseFloat(row.total_tva ?? 0),
    totalTtc: parseFloat(row.total_ttc ?? 0),
    discountAmount: parseFloat(row.discount_amount ?? 0),
    paymentMethod: row.payment_method,
    status: row.status,
    loyaltyPointsEarned: row.loyalty_points_earned ?? 0,
    loyaltyPointsUsed: row.loyalty_points_used ?? 0,
    storeCreditUsed: parseFloat(row.store_credit_used ?? 0),
    cashierName: row.cashier_name,
    notes: row.notes,
    purchasedAt: row.purchased_at,
  };
}

function mapReceiptToPurchase(row: any): ClientPurchase {
  return {
    id: row.id,
    clientId: row.client_id ?? '',
    receiptNumber: row.ticket_number ?? '',
    items: Array.isArray(row.items) ? row.items.map((i: any) => ({
      name: i.name ?? '',
      qty: i.qty ?? i.quantity ?? 1,
      price: i.price ?? 0,
      total: i.total ?? 0,
      sku: i.sku ?? undefined,
    })) : [],
    subtotalHt: parseFloat(row.subtotal_ht ?? 0),
    totalTva: parseFloat(row.total_tva ?? 0),
    totalTtc: parseFloat(row.total_amount ?? 0),
    discountAmount: parseFloat(row.discount_amount ?? 0),
    paymentMethod: row.payment_method ?? '',
    status: row.status ?? 'completed',
    loyaltyPointsEarned: row.loyalty_points_earned ?? 0,
    loyaltyPointsUsed: 0,
    storeCreditUsed: 0,
    cashierName: row.cashier_name ?? null,
    notes: row.notes ?? null,
    purchasedAt: row.created_at ?? '',
  };
}

function mapLoyaltyTransaction(row: any): LoyaltyTransaction {
  return {
    id: row.id,
    clientId: row.client_id,
    purchaseId: row.purchase_id,
    pointsChange: row.points_change,
    reason: row.reason,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
  };
}

function mapSubscription(row: any): ClientSubscription {
  return {
    id: row.id,
    clientId: row.client_id,
    subscriptionType: row.subscription_type,
    discountPercent: parseFloat(row.discount_percent ?? 0),
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date ?? null,
    autoRenew: row.auto_renew ?? false,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapNote(row: any): ClientInternalNote {
  return {
    id: row.id,
    clientId: row.client_id,
    content: row.content,
    author: row.author ?? 'Vendeur',
    createdAt: row.created_at,
  };
}

/** Returns the effective discount % for a client (subscription takes priority) */
export function getClientDiscount(client: Client, subscription: ClientSubscription | null): number {
  if (subscription && subscription.status === 'active') {
    return subscription.discountPercent;
  }
  if (client.loyaltyDiscountType) {
    switch (client.loyaltyDiscountType) {
      case 'pro_5': return 5;
      case 'pro_10': return 10;
      case 'pro_15': return 15;
      case 'custom': return client.loyaltyDiscountValue;
      case 'vip': return client.loyaltyDiscountValue || 10;
      case 'classic': return client.loyaltyDiscountValue || 5;
    }
  }
  return 0;
}

export const clientService = {
  async getAll(): Promise<Client[]> {
    const supabase = createClient();
    try {
      const data = await fetchAll<any>((from, to) =>
        supabase.from('clients').select('*').neq('is_active', false).order('last_name', { ascending: true }).range(from, to)
      );
      return data.map(mapClient);
    } catch (e: any) { console.log('clientService.getAll exception:', e.message); return []; }
  },

  async search(query: string): Promise<Client[]> {
    const supabase = createClient();
    try {
      const q = query.trim().toLowerCase();
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('is_active', true)
        .or(`phone.ilike.%${q}%,email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .order('last_name', { ascending: true })
        .limit(10);
      if (error) { console.log('clientService.search error:', error.message); return []; }
      return (data ?? []).map(mapClient);
    } catch (e: any) { console.log('clientService.search exception:', e.message); return []; }
  },

  async getById(id: string): Promise<Client | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) { console.log('clientService.getById error:', error.message); return null; }
      return data ? mapClient(data) : null;
    } catch (e: any) { console.log('clientService.getById exception:', e.message); return null; }
  },

  async create(input: CreateClientInput): Promise<{ client: Client | null; error?: string }> {
    try {
      const body = {
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email || null,
        phone: input.phone || null,
        whatsapp: input.whatsapp || null,
        date_of_birth: input.dateOfBirth || null,
        gender: input.gender || 'not_specified',
        address: input.address || null,
        city: input.city || null,
        postal_code: input.postalCode || null,
        country: input.country || 'France',
        notes: input.notes || null,
        client_type: input.clientType || 'particulier',
        loyalty_discount_type: input.loyaltyDiscountType || null,
        loyalty_discount_value: input.loyaltyDiscountValue || 0,
      };
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('clientService.create error:', data.error);
        return { client: null, error: data.error ?? 'Erreur lors de la création' };
      }
      return { client: mapClient(data) };
    } catch (e: any) {
      console.error('clientService.create exception:', e.message);
      return { client: null, error: e.message };
    }
  },

  async update(id: string, input: Partial<CreateClientInput>): Promise<Client | null> {
    try {
      const updateData: any = {};
      if (input.firstName !== undefined) updateData.first_name = input.firstName;
      if (input.lastName !== undefined) updateData.last_name = input.lastName;
      if (input.email !== undefined) updateData.email = input.email || null;
      if (input.phone !== undefined) updateData.phone = input.phone || null;
      if (input.whatsapp !== undefined) updateData.whatsapp = input.whatsapp || null;
      if (input.dateOfBirth !== undefined) updateData.date_of_birth = input.dateOfBirth || null;
      if (input.gender !== undefined) updateData.gender = input.gender;
      if (input.address !== undefined) updateData.address = input.address || null;
      if (input.city !== undefined) updateData.city = input.city || null;
      if (input.postalCode !== undefined) updateData.postal_code = input.postalCode || null;
      if (input.country !== undefined) updateData.country = input.country;
      if (input.notes !== undefined) updateData.notes = input.notes || null;
      if (input.clientType !== undefined) updateData.client_type = input.clientType;
      if (input.loyaltyDiscountType !== undefined) updateData.loyalty_discount_type = input.loyaltyDiscountType;
      if (input.loyaltyDiscountValue !== undefined) updateData.loyalty_discount_value = input.loyaltyDiscountValue;

      const res = await fetch(`/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error ?? `Erreur HTTP ${res.status}`;
        console.error('clientService.update error:', msg);
        throw new Error(msg);
      }
      return mapClient(data);
    } catch (e: any) { console.error('clientService.update exception:', e.message); throw e; }
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('clients')
        .update({ is_active: false })
        .eq('id', id);
      if (error) { console.log('clientService.delete error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('clientService.delete exception:', e.message); return false; }
  },

  async getPurchases(clientId: string): Promise<ClientPurchase[]> {
    const supabase = createClient();
    try {
      const { data: cp } = await supabase
        .from('client_purchases')
        .select('*')
        .eq('client_id', clientId)
        .order('purchased_at', { ascending: false });
      if (cp && cp.length > 0) return cp.map(mapPurchase);

      // client_purchases is empty (recordPurchase was never wired up) —
      // fall back to the receipts table which is always populated via API.
      const { data: receipts } = await supabase
        .from('receipts')
        .select('*')
        .eq('client_id', clientId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(50);
      return (receipts ?? []).map(mapReceiptToPurchase);
    } catch (e: any) { console.log('clientService.getPurchases exception:', e.message); return []; }
  },

  async recordPurchase(input: RecordPurchaseInput): Promise<ClientPurchase | null> {
    const supabase = createClient();
    try {
      const pointsEarned = input.loyaltyPointsEarned ?? Math.floor(input.totalTtc);
      const { data, error } = await supabase
        .from('client_purchases')
        .insert({
          client_id: input.clientId,
          receipt_number: input.receiptNumber,
          items: input.items,
          subtotal_ht: input.subtotalHt,
          total_tva: input.totalTva,
          total_ttc: input.totalTtc,
          discount_amount: input.discountAmount ?? 0,
          payment_method: input.paymentMethod,
          loyalty_points_earned: pointsEarned,
          loyalty_points_used: input.loyaltyPointsUsed ?? 0,
          store_credit_used: input.storeCreditUsed ?? 0,
          cashier_name: input.cashierName ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) { console.log('clientService.recordPurchase error:', error.message); return null; }
      // Update last_purchase_at
      await supabase.from('clients').update({ last_purchase_at: new Date().toISOString() }).eq('id', input.clientId);
      return data ? mapPurchase(data) : null;
    } catch (e: any) { console.log('clientService.recordPurchase exception:', e.message); return null; }
  },

  async getLoyaltyTransactions(clientId: string): Promise<LoyaltyTransaction[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) { console.log('clientService.getLoyaltyTransactions error:', error.message); return []; }
      return (data ?? []).map(mapLoyaltyTransaction);
    } catch (e: any) { console.log('clientService.getLoyaltyTransactions exception:', e.message); return []; }
  },

  async adjustLoyaltyPoints(clientId: string, pointsChange: number, reason: string): Promise<boolean> {
    try {
      const res = await fetch('/api/loyalty/adjust-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, pointsChange, reason }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('adjustLoyaltyPoints API error:', d.error);
        return false;
      }
      return true;
    } catch (e: any) { console.error('adjustLoyaltyPoints exception:', e.message); return false; }
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────

  async getSubscription(clientId: string): Promise<ClientSubscription | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_subscriptions')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) { console.log('getSubscription error:', error.message); return null; }
      return data ? mapSubscription(data) : null;
    } catch (e: any) { console.log('getSubscription exception:', e.message); return null; }
  },

  async createSubscription(input: CreateSubscriptionInput): Promise<ClientSubscription | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_subscriptions')
        .insert({
          client_id: input.clientId,
          subscription_type: input.subscriptionType,
          discount_percent: input.discountPercent,
          status: input.status,
          start_date: input.startDate,
          end_date: input.endDate || null,
          auto_renew: input.autoRenew ?? false,
          notes: input.notes || null,
        })
        .select()
        .single();
      if (error) { console.log('createSubscription error:', error.message); return null; }
      // Update client_type to 'abonne'
      await supabase.from('clients').update({ client_type: 'abonne' }).eq('id', input.clientId);
      return data ? mapSubscription(data) : null;
    } catch (e: any) { console.log('createSubscription exception:', e.message); return null; }
  },

  async updateSubscription(id: string, updates: Partial<CreateSubscriptionInput>): Promise<ClientSubscription | null> {
    const supabase = createClient();
    try {
      const updateData: any = {};
      if (updates.subscriptionType !== undefined) updateData.subscription_type = updates.subscriptionType;
      if (updates.discountPercent !== undefined) updateData.discount_percent = updates.discountPercent;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.startDate !== undefined) updateData.start_date = updates.startDate;
      if (updates.endDate !== undefined) updateData.end_date = updates.endDate;
      if (updates.autoRenew !== undefined) updateData.auto_renew = updates.autoRenew;
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      updateData.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from('client_subscriptions')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('updateSubscription error:', error.message); return null; }
      return data ? mapSubscription(data) : null;
    } catch (e: any) { console.log('updateSubscription exception:', e.message); return null; }
  },

  // ── Internal Notes ─────────────────────────────────────────────────────────

  async getNotes(clientId: string): Promise<ClientInternalNote[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_internal_notes')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) { console.log('getNotes error:', error.message); return []; }
      return (data ?? []).map(mapNote);
    } catch (e: any) { console.log('getNotes exception:', e.message); return []; }
  },

  async addNote(clientId: string, content: string, author?: string): Promise<ClientInternalNote | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('client_internal_notes')
        .insert({ client_id: clientId, content, author: author || 'Vendeur' })
        .select()
        .single();
      if (error) { console.log('addNote error:', error.message); return null; }
      return data ? mapNote(data) : null;
    } catch (e: any) { console.log('addNote exception:', e.message); return null; }
  },

  async deleteNote(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase.from('client_internal_notes').delete().eq('id', id);
      if (error) { console.log('deleteNote error:', error.message); return false; }
      return true;
    } catch (e: any) { console.log('deleteNote exception:', e.message); return false; }
  },
};
