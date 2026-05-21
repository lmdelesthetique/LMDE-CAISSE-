'use client';

import { createClient } from '@/lib/supabase/client';

function isSchemaError(error: any): boolean {
  if (!error) return false;
  if (error.code && typeof error.code === 'string') {
    const cls = error.code.substring(0, 2);
    if (cls === '42' || cls === '08') return true;
    if (cls === '23') return false;
  }
  if (error.message) {
    const patterns = [/relation.*does not exist/i, /column.*does not exist/i, /function.*does not exist/i, /syntax error/i];
    return patterns.some((p) => p.test(error.message));
  }
  return false;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type SupplierReliability = 'excellent' | 'good' | 'average' | 'poor' | 'unknown';

export type OrderStatus =
  | 'draft' | 'sent' | 'awaiting_validation' | 'modification_requested'
  | 'validated'| 'awaiting_payment' | 'payment_sent' | 'payment_confirmed' |'in_production'| 'ready_to_ship' | 'shipped' | 'partially_received' |'received' | 'issue_reported' | 'refund_requested' | 'refund_received' | 'cancelled';

export type PaymentStatus = 'pending' | 'sent' | 'confirmed' | 'partial' | 'overdue';
export type PaymentMethod = 'wire_transfer' | 'wise' | 'alibaba' | 'paypal' | 'other';
export type ClaimStatus = 'draft' | 'sent' | 'awaiting_response' | 'accepted' | 'refused' | 'refund_pending' | 'refund_received' | 'closed';
export type ClaimType = 'defective' | 'wrong_color' | 'wrong_reference' | 'bad_quality' | 'broken' | 'wrong_packaging' | 'missing_quantity' | 'other';
export type ClaimAction = 'refund' | 'credit' | 'replacement' | 'future_modification';
export type MessageSender = 'store' | 'supplier';

export interface Supplier {
  id: string;
  companyName: string;
  contactName?: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  wechat?: string;
  address?: string;
  country: string;
  language: string;
  website?: string;
  alibabaLink?: string;
  categories?: string[];
  bankDetails?: string;
  paymentConditions?: string;
  productionDelayDays: number;
  shippingDelayDays: number;
  minimumOrder?: string;
  notes?: string;
  reliability: SupplierReliability;
  lastContactAt?: string;
  lastOrderAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  portalLogin?: string;
  portalPasswordPlain?: string;
  portalUserId?: string;
}

export interface OrderItem {
  name: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface SupplierOrder {
  id: string;
  supplierId: string;
  orderNumber: string;
  orderStatus: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  shippingCost: number;
  customsCost: number;
  otherCosts: number;
  totalAmount: number;
  currency: string;
  exchangeRate: number;
  notes?: string;
  trackingNumber?: string;
  expectedDeliveryAt?: string;
  shippedAt?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  orderId?: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  proofUrl?: string;
  paidAt?: string;
  confirmedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface SupplierClaim {
  id: string;
  supplierId: string;
  orderId?: string;
  claimType: ClaimType;
  claimStatus: ClaimStatus;
  requestedAction: ClaimAction;
  productName?: string;
  description: string;
  affectedQuantity: number;
  estimatedLoss: number;
  photoUrls: string[];
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierMessage {
  id: string;
  supplierId: string;
  orderId?: string;
  claimId?: string;
  sender: MessageSender;
  content?: string;
  attachmentUrl?: string;
  attachmentType?: string;
  isRead: boolean;
  createdAt: string;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapSupplier(row: any): Supplier {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    logoUrl: row.logo_url,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    wechat: row.wechat,
    address: row.address,
    country: row.country,
    language: row.language,
    website: row.website,
    alibabaLink: row.alibaba_link,
    categories: row.categories || [],
    bankDetails: row.bank_details,
    paymentConditions: row.payment_conditions,
    productionDelayDays: row.production_delay_days,
    shippingDelayDays: row.shipping_delay_days,
    minimumOrder: row.minimum_order,
    notes: row.notes,
    reliability: row.reliability,
    lastContactAt: row.last_contact_at,
    lastOrderAt: row.last_order_at,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    portalLogin: row.portal_login,
    portalPasswordPlain: row.portal_password_plain,
    portalUserId: row.portal_user_id,
  };
}

function mapOrder(row: any): SupplierOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    orderNumber: row.order_number,
    orderStatus: row.order_status,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []),
    subtotal: Number(row.subtotal),
    shippingCost: Number(row.shipping_cost),
    customsCost: Number(row.customs_cost),
    otherCosts: Number(row.other_costs),
    totalAmount: Number(row.total_amount),
    currency: row.currency,
    exchangeRate: Number(row.exchange_rate),
    notes: row.notes,
    trackingNumber: row.tracking_number,
    expectedDeliveryAt: row.expected_delivery_at,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapPayment(row: any): SupplierPayment {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    orderId: row.order_id,
    amount: Number(row.amount),
    currency: row.currency,
    exchangeRate: Number(row.exchange_rate),
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    proofUrl: row.proof_url,
    paidAt: row.paid_at,
    confirmedAt: row.confirmed_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapClaim(row: any): SupplierClaim {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    orderId: row.order_id,
    claimType: row.claim_type,
    claimStatus: row.claim_status,
    requestedAction: row.requested_action,
    productName: row.product_name,
    description: row.description,
    affectedQuantity: row.affected_quantity,
    estimatedLoss: Number(row.estimated_loss),
    photoUrls: row.photo_urls || [],
    resolutionNotes: row.resolution_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMessage(row: any): SupplierMessage {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    orderId: row.order_id,
    claimId: row.claim_id,
    sender: row.sender,
    content: row.content,
    attachmentUrl: row.attachment_url,
    attachmentType: row.attachment_type,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

// ─── Supplier CRUD ────────────────────────────────────────────────────────────

export const supplierService = {
  async getAll(): Promise<Supplier[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('company_name', { ascending: true });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map(mapSupplier);
    } catch (e: any) { throw e; }
  },

  async getById(id: string): Promise<Supplier | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('suppliers').select('*').eq('id', id).maybeSingle();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapSupplier(data) : null;
    } catch (e: any) { throw e; }
  },

  async create(payload: Partial<Supplier>): Promise<Supplier | null> {
    const supabase = createClient();
    try {
      const pin = String(Math.floor(100000 + Math.random() * 900000));

      const { data, error } = await supabase
        .from('suppliers')
        .insert({
          company_name: payload.companyName,
          contact_name: payload.contactName,
          email: payload.email,
          phone: payload.phone,
          whatsapp: payload.whatsapp,
          wechat: payload.wechat,
          address: payload.address,
          country: payload.country || 'Chine',
          language: payload.language || 'Chinois',
          website: payload.website,
          alibaba_link: payload.alibabaLink,
          categories: payload.categories || [],
          bank_details: payload.bankDetails,
          payment_conditions: payload.paymentConditions,
          production_delay_days: payload.productionDelayDays || 14,
          shipping_delay_days: payload.shippingDelayDays || 21,
          minimum_order: payload.minimumOrder,
          notes: payload.notes,
          reliability: payload.reliability || 'unknown',
          portal_login: pin,
          portal_password_plain: null,
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }

      const supplier = data ? mapSupplier(data) : null;

      if (supplier) {
        const { error: upsertError } = await supabase
          .from('supplier_portal_users')
          .upsert({ supplier_id: supplier.id, pin_code: pin, is_active: true }, { onConflict: 'supplier_id' });
        if (upsertError) {
          console.error('[supplierService.create] portal upsert error:', upsertError.message);
        }
      }

      return supplier;
    } catch (e: any) { throw e; }
  },

  async update(id: string, payload: Partial<Supplier>): Promise<Supplier | null> {
    const supabase = createClient();
    try {
      const updateData: any = {};
      if (payload.companyName !== undefined) updateData.company_name = payload.companyName;
      if (payload.contactName !== undefined) updateData.contact_name = payload.contactName;
      if (payload.email !== undefined) updateData.email = payload.email;
      if (payload.phone !== undefined) updateData.phone = payload.phone;
      if (payload.whatsapp !== undefined) updateData.whatsapp = payload.whatsapp;
      if (payload.wechat !== undefined) updateData.wechat = payload.wechat;
      if (payload.address !== undefined) updateData.address = payload.address;
      if (payload.country !== undefined) updateData.country = payload.country;
      if (payload.language !== undefined) updateData.language = payload.language;
      if (payload.website !== undefined) updateData.website = payload.website;
      if (payload.alibabaLink !== undefined) updateData.alibaba_link = payload.alibabaLink;
      if (payload.categories !== undefined) updateData.categories = payload.categories;
      if (payload.bankDetails !== undefined) updateData.bank_details = payload.bankDetails;
      if (payload.paymentConditions !== undefined) updateData.payment_conditions = payload.paymentConditions;
      if (payload.productionDelayDays !== undefined) updateData.production_delay_days = payload.productionDelayDays;
      if (payload.shippingDelayDays !== undefined) updateData.shipping_delay_days = payload.shippingDelayDays;
      if (payload.minimumOrder !== undefined) updateData.minimum_order = payload.minimumOrder;
      if (payload.notes !== undefined) updateData.notes = payload.notes;
      if (payload.reliability !== undefined) updateData.reliability = payload.reliability;
      if (payload.isActive !== undefined) updateData.is_active = payload.isActive;

      const { data, error } = await supabase.from('suppliers').update(updateData).eq('id', id).select().single();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapSupplier(data) : null;
    } catch (e: any) { throw e; }
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id);
      if (error) { if (isSchemaError(error)) throw error; return false; }
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Orders ────────────────────────────────────────────────────────────────

  async getOrders(supplierId: string): Promise<SupplierOrder[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_orders')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map(mapOrder);
    } catch (e: any) { throw e; }
  },

  async getAllOrders(): Promise<(SupplierOrder & { supplierName: string })[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_orders')
        .select('*, suppliers(company_name)')
        .order('created_at', { ascending: false });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map((row) => ({ ...mapOrder(row), supplierName: row.suppliers?.company_name || '' }));
    } catch (e: any) { throw e; }
  },

  async createOrder(payload: Partial<SupplierOrder>): Promise<SupplierOrder | null> {
    const supabase = createClient();
    try {
      const orderNum = `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const { data, error } = await supabase
        .from('supplier_orders')
        .insert({
          supplier_id: payload.supplierId,
          order_number: payload.orderNumber || orderNum,
          order_status: payload.orderStatus || 'draft',
          items: payload.items || [],
          subtotal: payload.subtotal || 0,
          shipping_cost: payload.shippingCost || 0,
          customs_cost: payload.customsCost || 0,
          other_costs: payload.otherCosts || 0,
          total_amount: payload.totalAmount || 0,
          currency: payload.currency || 'EUR',
          exchange_rate: payload.exchangeRate || 1,
          notes: payload.notes,
          expected_delivery_at: payload.expectedDeliveryAt,
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapOrder(data) : null;
    } catch (e: any) { throw e; }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, extra?: Partial<SupplierOrder>): Promise<boolean> {
    const supabase = createClient();
    try {
      const updateData: any = { order_status: status };
      if (extra?.trackingNumber !== undefined) updateData.tracking_number = extra.trackingNumber;
      if (extra?.shippedAt !== undefined) updateData.shipped_at = extra.shippedAt;
      if (extra?.receivedAt !== undefined) updateData.received_at = extra.receivedAt;
      const { error } = await supabase.from('supplier_orders').update(updateData).eq('id', orderId);
      if (error) { if (isSchemaError(error)) throw error; return false; }
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Payments ──────────────────────────────────────────────────────────────

  async getPayments(supplierId: string): Promise<SupplierPayment[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_payments')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map(mapPayment);
    } catch (e: any) { throw e; }
  },

  async createPayment(payload: Partial<SupplierPayment>): Promise<SupplierPayment | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_payments')
        .insert({
          supplier_id: payload.supplierId,
          order_id: payload.orderId,
          amount: payload.amount,
          currency: payload.currency || 'EUR',
          exchange_rate: payload.exchangeRate || 1,
          payment_method: payload.paymentMethod || 'wire_transfer',
          payment_status: payload.paymentStatus || 'pending',
          proof_url: payload.proofUrl,
          paid_at: payload.paidAt,
          notes: payload.notes,
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapPayment(data) : null;
    } catch (e: any) { throw e; }
  },

  async updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<boolean> {
    const supabase = createClient();
    try {
      const updateData: any = { payment_status: status };
      if (status === 'confirmed') updateData.confirmed_at = new Date().toISOString();
      const { error } = await supabase.from('supplier_payments').update(updateData).eq('id', paymentId);
      if (error) { if (isSchemaError(error)) throw error; return false; }
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Claims ────────────────────────────────────────────────────────────────

  async getClaims(supplierId: string): Promise<SupplierClaim[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_claims')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: false });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map(mapClaim);
    } catch (e: any) { throw e; }
  },

  async createClaim(payload: Partial<SupplierClaim>): Promise<SupplierClaim | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_claims')
        .insert({
          supplier_id: payload.supplierId,
          order_id: payload.orderId,
          claim_type: payload.claimType || 'other',
          claim_status: payload.claimStatus || 'draft',
          requested_action: payload.requestedAction || 'refund',
          product_name: payload.productName,
          description: payload.description,
          affected_quantity: payload.affectedQuantity || 1,
          estimated_loss: payload.estimatedLoss || 0,
          photo_urls: payload.photoUrls || [],
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapClaim(data) : null;
    } catch (e: any) { throw e; }
  },

  async updateClaimStatus(claimId: string, status: ClaimStatus, notes?: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const updateData: any = { claim_status: status };
      if (notes) updateData.resolution_notes = notes;
      const { error } = await supabase.from('supplier_claims').update(updateData).eq('id', claimId);
      if (error) { if (isSchemaError(error)) throw error; return false; }
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Messages ──────────────────────────────────────────────────────────────

  async getMessages(supplierId: string): Promise<SupplierMessage[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_messages')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at', { ascending: true });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map(mapMessage);
    } catch (e: any) { throw e; }
  },

  async sendMessage(payload: Partial<SupplierMessage>): Promise<SupplierMessage | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('supplier_messages')
        .insert({
          supplier_id: payload.supplierId,
          order_id: payload.orderId,
          claim_id: payload.claimId,
          sender: payload.sender || 'store',
          content: payload.content,
          attachment_url: payload.attachmentUrl,
          attachment_type: payload.attachmentType,
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }
      return data ? mapMessage(data) : null;
    } catch (e: any) { throw e; }
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────

  async getSupplierStats(supplierId: string) {
    const supabase = createClient();
    try {
      const [ordersRes, paymentsRes, claimsRes] = await Promise.all([
        supabase.from('supplier_orders').select('total_amount, order_status').eq('supplier_id', supplierId),
        supabase.from('supplier_payments').select('amount, payment_status').eq('supplier_id', supplierId),
        supabase.from('supplier_claims').select('estimated_loss, claim_status').eq('supplier_id', supplierId),
      ]);

      const orders = ordersRes.data || [];
      const payments = paymentsRes.data || [];
      const claims = claimsRes.data || [];

      const totalOrders = orders.length;
      const totalSpent = payments.filter((p) => p.payment_status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0);
      const totalClaims = claims.length;
      const totalRefunded = claims.filter((c) => c.claim_status === 'refund_received').reduce((s, c) => s + Number(c.estimated_loss), 0);
      const activeOrders = orders.filter((o) => !['received', 'cancelled'].includes(o.order_status)).length;

      return { totalOrders, totalSpent, totalClaims, totalRefunded, activeOrders };
    } catch (e: any) {
      return { totalOrders: 0, totalSpent: 0, totalClaims: 0, totalRefunded: 0, activeOrders: 0 };
    }
  },
};
