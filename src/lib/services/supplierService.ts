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
  | 'validated' | 'awaiting_payment' | 'payment_sent' | 'payment_confirmed'
  | 'payment_pending' | 'payment_in_progress' | 'paid' | 'payment_received_by_supplier'
  | 'in_preparation' | 'in_production' | 'ready_to_ship' | 'shipped'
  | 'partially_received' | 'fully_received' | 'costs_recorded' | 'stock_integrated'
  | 'received' | 'issue_reported' | 'refund_requested' | 'refund_received'
  | 'closed' | 'suspended' | 'cancelled';

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
  productId?: string;
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
  supplierResponse?: 'pending' | 'accepted' | 'refused';
  supplierComment?: string;
  paymentStatus?: string;
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
  const lines: any[] = row.fo_order_lines || [];
  return {
    id: row.id,
    supplierId: row.supplier_id,
    orderNumber: row.order_number,
    orderStatus: row.order_status,
    items: lines.map((l) => ({
      productId: l.product_id || undefined,
      name: l.product_name,
      qty: Number(l.qty_ordered),
      unit_price: Number(l.unit_price),
      total: Number(l.line_total),
    })),
    subtotal: Number(row.subtotal),
    shippingCost: Number(row.transport_cost),
    customsCost: Number(row.customs_cost),
    otherCosts: 0,
    totalAmount: Number(row.total_real_cost),
    currency: 'EUR',
    exchangeRate: 1,
    notes: row.notes,
    trackingNumber: undefined,
    expectedDeliveryAt: undefined,
    shippedAt: undefined,
    receivedAt: undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supplierResponse: row.supplier_response ?? 'pending',
    supplierComment: row.supplier_comment,
    paymentStatus: row.payment_status,
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
        // SECURITY DEFINER RPC bypasses RLS on supplier_portal_users
        const { error: rpcError } = await supabase.rpc('upsert_supplier_portal_pin', {
          p_supplier_id: supplier.id,
          p_pin: pin,
        });
        if (rpcError) {
          console.error('[supplierService.create] portal pin rpc error:', rpcError.message);
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
        .from('fo_orders')
        .select('*, fo_order_lines(*)')
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
        .from('fo_orders')
        .select('*, fo_order_lines(*), suppliers(company_name)')
        .order('created_at', { ascending: false });
      if (error) { if (isSchemaError(error)) throw error; return []; }
      return (data || []).map((row) => ({ ...mapOrder(row), supplierName: row.suppliers?.company_name || '' }));
    } catch (e: any) { throw e; }
  },

  async createOrder(payload: Partial<SupplierOrder>): Promise<SupplierOrder | null> {
    const supabase = createClient();
    try {
      const orderNum = payload.orderNumber || `CMD-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
      const subtotal = Number(payload.subtotal) || 0;
      const transportCost = Number(payload.shippingCost) || 0;
      const customsCost = Number(payload.customsCost) || 0;
      const totalRealCost = Number(payload.totalAmount) || subtotal + transportCost + customsCost;

      const { data, error } = await supabase
        .from('fo_orders')
        .insert({
          supplier_id: payload.supplierId,
          order_number: orderNum,
          order_status: payload.orderStatus || 'draft',
          notes: payload.notes || null,
          subtotal,
          transport_cost: transportCost,
          customs_cost: customsCost,
          total_real_cost: totalRealCost,
        })
        .select()
        .single();
      if (error) { if (isSchemaError(error)) throw error; return null; }

      const items = payload.items || [];
      if (items.length > 0) {
        await supabase.from('fo_order_lines').insert(
          items.map((item) => ({
            order_id: data.id,
            product_id: item.productId || null,
            product_name: item.name,
            qty_ordered: Number(item.qty),
            unit_price: Number(item.unit_price),
            line_total: Number(item.total),
          }))
        );
      }

      const { data: full } = await supabase
        .from('fo_orders')
        .select('*, fo_order_lines(*)')
        .eq('id', data.id)
        .single();
      return full ? mapOrder(full) : null;
    } catch (e: any) { throw e; }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, _extra?: Partial<SupplierOrder>): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('fo_orders')
        .update({ order_status: status, updated_at: new Date().toISOString() })
        .eq('id', orderId);
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
        supabase.from('fo_orders').select('total_real_cost, order_status').eq('supplier_id', supplierId),
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
      const activeOrders = orders.filter((o) => !['fully_received', 'closed', 'cancelled'].includes(o.order_status)).length;

      return { totalOrders, totalSpent, totalClaims, totalRefunded, activeOrders };
    } catch (e: any) {
      return { totalOrders: 0, totalSpent: 0, totalClaims: 0, totalRefunded: 0, activeOrders: 0 };
    }
  },
};
