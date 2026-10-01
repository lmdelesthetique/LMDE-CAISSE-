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
    try {
      const res = await fetch('/api/suppliers').catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map(mapSupplier);
    } catch (e: any) { throw e; }
  },

  async getById(id: string): Promise<Supplier | null> {
    try {
      const res = await fetch(`/api/suppliers/${id}`).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data ? mapSupplier(data) : null;
    } catch (e: any) { throw e; }
  },

  async create(payload: Partial<Supplier>): Promise<Supplier | null> {
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: payload.companyName, contactName: payload.contactName,
          email: payload.email, phone: payload.phone, whatsapp: payload.whatsapp,
          wechat: payload.wechat, address: payload.address, country: payload.country,
          language: payload.language, website: payload.website, alibabaLink: payload.alibabaLink,
          categories: payload.categories, bankDetails: payload.bankDetails,
          paymentConditions: payload.paymentConditions, productionDelayDays: payload.productionDelayDays,
          shippingDelayDays: payload.shippingDelayDays, minimumOrder: payload.minimumOrder,
          notes: payload.notes, reliability: payload.reliability,
        }),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data.supplier ? mapSupplier(data.supplier) : null;
    } catch (e: any) { throw e; }
  },

  async update(id: string, payload: Partial<Supplier>): Promise<Supplier | null> {
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data.supplier ? mapSupplier(data.supplier) : null;
    } catch (e: any) { throw e; }
  },

  async delete(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' }).catch(() => null);
      if (!res?.ok) return false;
      return true;
    } catch (e: any) { throw e; }
  },

  async getDeleteInfo(id: string): Promise<{ activeOrders: number; linkedProducts: number }> {
    try {
      const res = await fetch(`/api/suppliers/${id}/stats`).catch(() => null);
      if (!res?.ok) return { activeOrders: 0, linkedProducts: 0 };
      const data = await res.json();
      return { activeOrders: data.activeOrders ?? 0, linkedProducts: 0 };
    } catch { return { activeOrders: 0, linkedProducts: 0 }; }
  },

  async permanentDelete(id: string): Promise<boolean> {
    try {
      // Use PATCH to delink products, then DELETE supplier
      await fetch(`/api/products/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delink-supplier', supplierId: id }),
      }).catch(() => {});
      const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' }).catch(() => null);
      return !!res?.ok;
    } catch (e: any) { throw e; }
  },

  // ─── Orders ────────────────────────────────────────────────────────────────

  async getOrders(supplierId: string): Promise<SupplierOrder[]> {
    try {
      const res = await fetch(`/api/fo-orders?supplierId=${supplierId}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map(mapOrder);
    } catch (e: any) { throw e; }
  },

  async getAllOrders(): Promise<(SupplierOrder & { supplierName: string })[]> {
    try {
      const res = await fetch('/api/fo-orders').catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map((row: any) => ({ ...mapOrder(row), supplierName: row.suppliers?.company_name || '' }));
    } catch (e: any) { throw e; }
  },

  async createOrder(payload: Partial<SupplierOrder>): Promise<SupplierOrder | null> {
    try {
      const res = await fetch('/api/fo-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: payload.supplierId,
          order_number: payload.orderNumber,
          order_status: payload.orderStatus,
          notes: payload.notes,
          subtotal: payload.subtotal,
          transport_cost: payload.shippingCost,
          customs_cost: payload.customsCost,
          total_real_cost: payload.totalAmount,
          items: (payload.items || []).map(item => ({
            product_id: item.productId || null,
            product_name: item.name,
            qty_ordered: Number(item.qty),
            unit_price: Number(item.unit_price),
            line_total: Number(item.total),
          })),
        }),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data.order ? mapOrder(data.order) : null;
    } catch (e: any) { throw e; }
  },

  async updateOrderStatus(orderId: string, status: OrderStatus, _extra?: Partial<SupplierOrder>): Promise<boolean> {
    try {
      const res = await fetch(`/api/fo-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: status }),
      }).catch(() => null);
      if (!res?.ok) return false;
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Payments ──────────────────────────────────────────────────────────────

  async getPayments(supplierId: string): Promise<SupplierPayment[]> {
    try {
      const res = await fetch(`/api/supplier-payments?supplierId=${supplierId}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map(mapPayment);
    } catch (e: any) { throw e; }
  },

  async createPayment(payload: Partial<SupplierPayment>): Promise<SupplierPayment | null> {
    try {
      const res = await fetch('/api/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data.payment ? mapPayment(data.payment) : null;
    } catch (e: any) { throw e; }
  },

  async updatePaymentStatus(paymentId: string, status: PaymentStatus): Promise<boolean> {
    try {
      const res = await fetch(`/api/supplier-payments?id=${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_status: status }),
      }).catch(() => null);
      if (!res?.ok) return false;
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Claims ────────────────────────────────────────────────────────────────

  async getClaims(supplierId: string): Promise<SupplierClaim[]> {
    try {
      const res = await fetch(`/api/supplier-claims?supplierId=${supplierId}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map(mapClaim);
    } catch (e: any) { throw e; }
  },

  async createClaim(payload: Partial<SupplierClaim>): Promise<SupplierClaim | null> {
    try {
      const res = await fetch('/api/supplier-claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data.claim ? mapClaim(data.claim) : null;
    } catch (e: any) { throw e; }
  },

  async updateClaimStatus(claimId: string, status: ClaimStatus, notes?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/supplier-claims?id=${claimId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ claim_status: status, notes }),
      }).catch(() => null);
      if (!res?.ok) return false;
      return true;
    } catch (e: any) { throw e; }
  },

  // ─── Messages ──────────────────────────────────────────────────────────────

  async getMessages(supplierId: string): Promise<SupplierMessage[]> {
    try {
      const res = await fetch(`/api/supplier-messages?supplierId=${supplierId}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (data || []).map(mapMessage);
    } catch (e: any) { throw e; }
  },

  async sendMessage(payload: Partial<SupplierMessage>): Promise<SupplierMessage | null> {
    try {
      const res = await fetch('/api/supplier-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: payload.supplierId,
          order_id: payload.orderId,
          claim_id: payload.claimId,
          sender: payload.sender || 'store',
          content: payload.content,
          attachment_url: payload.attachmentUrl,
          attachment_type: payload.attachmentType,
        }),
      }).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data ? mapMessage(data) : null;
    } catch (e: any) { throw e; }
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────

  async getSupplierStats(supplierId: string) {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/stats`).catch(() => null);
      if (!res?.ok) return { totalOrders: 0, totalSpent: 0, totalClaims: 0, totalRefunded: 0, activeOrders: 0 };
      return await res.json();
    } catch {
      return { totalOrders: 0, totalSpent: 0, totalClaims: 0, totalRefunded: 0, activeOrders: 0 };
    }
  },
};
