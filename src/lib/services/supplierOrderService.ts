'use client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FoOrderStatus =
  | 'draft' | 'sent' | 'awaiting_validation' | 'validated' | 'modification_requested'
  | 'payment_pending'| 'payment_in_progress' | 'paid' | 'payment_received_by_supplier' |'in_preparation'| 'in_production' | 'ready_to_ship' | 'shipped' |'partially_received'| 'fully_received' | 'costs_recorded' | 'stock_integrated' |'closed' | 'suspended' | 'cancelled';

export type FoPaymentStatus =
  | 'pending' | 'in_progress' | 'paid' | 'received_by_supplier' |'partial' | 'balance_due' | 'partially_refunded' | 'fully_refunded';

export type FoCostMethod = 'by_value' | 'by_quantity' | 'by_weight' | 'by_volume' | 'custom';
export type FoRestockStatus = 'suggested' | 'ordered' | 'ignored' | 'suspended';
export type FoSuspensionReason =
  | 'bad_customer_feedback' | 'not_profitable' | 'slow_seller' |'unreliable_supplier'| 'range_change' | 'replaced_by_other' |'permanent_stop' | 'other';

export interface FoOrderLine {
  id: string;
  orderId: string;
  productId?: string;
  productName: string;
  productRef?: string;
  productImageUrl?: string;
  variant?: string;
  color?: string;
  size?: string;
  model?: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitPrice: number;
  lineTotal: number;
  unitTransport: number;
  unitCustoms: number;
  unitVatImport: number;
  unitFreight: number;
  unitOther: number;
  unitRealCost: number;
  salePrice: number;
  grossMargin: number;
  marginRate: number;
  previousCost: number;
  qtyMissing: number;
  qtyDamaged: number;
  receptionNote?: string;
  weightKg: number;
  volumeM3: number;
  customCostShare: number;
  note?: string;
  confirmedUnitPrice?: number;
}

export interface FoOrder {
  id: string;
  supplierId?: string;
  supplierName?: string;
  supplierPortalToken?: string;
  supplierPhone?: string;
  orderNumber: string;
  orderStatus: FoOrderStatus;
  currency: string;
  exchangeRate: number;
  notes?: string;
  internalNotes?: string;
  trackingNumber?: string;
  expectedDeliveryAt?: string;
  shippedAt?: string;
  receivedAt?: string;
  subtotal: number;
  transportCost: number;
  customsCost: number;
  vatImport: number;
  freightForwarderCost: number;
  bankFees: number;
  exchangeFees: number;
  localDelivery: number;
  otherCosts: number;
  totalRealCost: number;
  costMethod: FoCostMethod;
  costsValidated: boolean;
  stockIntegrated: boolean;
  stockUpdated: boolean;
  stockUpdatedAt?: string;
  paymentStatus: FoPaymentStatus;
  paymentMethod?: string;
  paymentAmount?: number;
  paymentDate?: string;
  paymentProofUrl?: string;
  balanceDue: number;
  supplierValidated: boolean;
  supplierComment?: string;
  supplierFinalAmount?: number;
  orderGroup?: string;
  transportMethod?: string;
  lines?: FoOrderLine[];
  invoiceUploadToken?: string;
  supplierInvoicePath?: string;
  supplierInvoiceUrl?: string;
  invoiceReceivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FoStatusHistory {
  id: string;
  orderId: string;
  oldStatus?: FoOrderStatus;
  newStatus: FoOrderStatus;
  changedAt: string;
  changedBy: string;
  comment?: string;
}

export interface FoRestockSuggestion {
  id: string;
  productId?: string;
  productName: string;
  productRef?: string;
  productImageUrl?: string;
  supplierId?: string;
  supplierName?: string;
  currentStock: number;
  minStock: number;
  suggestedQty: number;
  lastPurchasePrice: number;
  lastRealCost: number;
  recentSales: number;
  restockStatus: FoRestockStatus;
  suspensionReason?: FoSuspensionReason;
  suspensionNote?: string;
  suspendedAt?: string;
  lastUpdated: string;
}

export interface FoProductCostHistory {
  id: string;
  productId?: string;
  productName: string;
  productRef?: string;
  supplierId?: string;
  orderId?: string;
  oldPurchasePrice: number;
  newPurchasePrice: number;
  oldRealCost: number;
  newRealCost: number;
  associatedFees: number;
  reason: string;
  validatedBy: string;
  changedAt: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapOrder(row: any): FoOrder {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.company_name,
    supplierPortalToken: row.suppliers?.portal_login,
    supplierPhone: row.suppliers?.whatsapp || row.suppliers?.phone,
    orderNumber: row.order_number,
    orderStatus: row.order_status,
    currency: row.currency,
    exchangeRate: Number(row.exchange_rate),
    notes: row.notes,
    internalNotes: row.internal_notes,
    trackingNumber: row.tracking_number,
    expectedDeliveryAt: row.expected_delivery_at,
    shippedAt: row.shipped_at,
    receivedAt: row.received_at,
    subtotal: Number(row.subtotal),
    transportCost: Number(row.transport_cost),
    customsCost: Number(row.customs_cost),
    vatImport: Number(row.vat_import),
    freightForwarderCost: Number(row.freight_forwarder_cost),
    bankFees: Number(row.bank_fees),
    exchangeFees: Number(row.exchange_fees),
    localDelivery: Number(row.local_delivery),
    otherCosts: Number(row.other_costs),
    totalRealCost: Number(row.total_real_cost),
    costMethod: row.cost_method,
    costsValidated: row.costs_validated,
    stockIntegrated: row.stock_integrated,
    stockUpdated: Boolean(row.stock_updated),
    stockUpdatedAt: (row.stock_updated_at as string) || undefined,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentAmount: row.payment_amount ? Number(row.payment_amount) : undefined,
    paymentDate: row.payment_date,
    paymentProofUrl: row.payment_proof_url,
    balanceDue: Number(row.balance_due),
    supplierValidated: row.supplier_validated,
    supplierComment: row.supplier_comment,
    supplierFinalAmount: row.supplier_final_amount ? Number(row.supplier_final_amount) : undefined,
    orderGroup: row.order_group || undefined,
    transportMethod: row.transport_method || undefined,
    invoiceUploadToken: row.invoice_upload_token || undefined,
    supplierInvoicePath: row.supplier_invoice_path || undefined,
    supplierInvoiceUrl: row.supplier_invoice_url || undefined,
    invoiceReceivedAt: row.invoice_received_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLine(row: any): FoOrderLine {
  return {
    id: row.id,
    orderId: row.order_id,
    productId: row.product_id,
    productName: row.product_name,
    productRef: row.product_ref,
    productImageUrl: row.product_image_url,
    variant: row.variant,
    color: row.color,
    size: row.size,
    model: row.model,
    qtyOrdered: row.qty_ordered,
    qtyReceived: row.qty_received,
    unitPrice: Number(row.unit_price),
    lineTotal: Number(row.line_total),
    unitTransport: Number(row.unit_transport),
    unitCustoms: Number(row.unit_customs),
    unitVatImport: Number(row.unit_vat_import),
    unitFreight: Number(row.unit_freight),
    unitOther: Number(row.unit_other),
    unitRealCost: Number(row.unit_real_cost),
    salePrice: Number(row.sale_price),
    grossMargin: Number(row.gross_margin),
    marginRate: Number(row.margin_rate),
    previousCost: Number(row.previous_cost),
    qtyMissing: row.qty_missing,
    qtyDamaged: row.qty_damaged,
    receptionNote: row.reception_note,
    weightKg: Number(row.weight_kg),
    volumeM3: Number(row.volume_m3),
    customCostShare: Number(row.custom_cost_share),
    note: row.note,
    confirmedUnitPrice: row.confirmed_unit_price != null ? Number(row.confirmed_unit_price) : undefined,
  };
}

function mapRestock(row: any): FoRestockSuggestion {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productRef: row.product_ref,
    productImageUrl: row.product_image_url,
    supplierId: row.supplier_id,
    supplierName: row.suppliers?.company_name,
    currentStock: row.current_stock,
    minStock: row.min_stock,
    suggestedQty: row.suggested_qty,
    lastPurchasePrice: Number(row.last_purchase_price),
    lastRealCost: Number(row.last_real_cost),
    recentSales: row.recent_sales,
    restockStatus: row.restock_status,
    suspensionReason: row.suspension_reason,
    suspensionNote: row.suspension_note,
    suspendedAt: row.suspended_at,
    lastUpdated: row.last_updated,
  };
}

function mapCostHistory(row: any): FoProductCostHistory {
  return {
    id: row.id,
    productId: row.product_id,
    productName: row.product_name,
    productRef: row.product_ref,
    supplierId: row.supplier_id,
    orderId: row.order_id,
    oldPurchasePrice: Number(row.old_purchase_price),
    newPurchasePrice: Number(row.new_purchase_price),
    oldRealCost: Number(row.old_real_cost),
    newRealCost: Number(row.new_real_cost),
    associatedFees: Number(row.associated_fees),
    reason: row.reason,
    validatedBy: row.validated_by,
    changedAt: row.changed_at,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const supplierOrderService = {

  // Orders
  async getAll(filters?: { status?: FoOrderStatus; supplierId?: string }): Promise<FoOrder[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.supplierId) params.set('supplierId', filters.supplierId);
      const res = await fetch(`/api/fo-orders?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map(mapOrder);
    } catch { return []; }
  },

  async getById(id: string): Promise<FoOrder | null> {
    try {
      const res = await fetch(`/api/fo-orders/${id}`);
      if (!res.ok) return null;
      const data = await res.json();
      const order = mapOrder(data);
      order.lines = (data.fo_order_lines || []).map(mapLine);
      return order;
    } catch { return null; }
  },

  async create(payload: Partial<FoOrder>): Promise<FoOrder | null> {
    try {
      const orderNum = `FO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
      const res = await fetch('/api/fo-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: payload.supplierId,
          order_number: payload.orderNumber || orderNum,
          order_status: payload.orderStatus || 'draft',
          currency: payload.currency || 'EUR',
          exchange_rate: payload.exchangeRate || 1,
          notes: payload.notes,
          internal_notes: payload.internalNotes,
          expected_delivery_at: payload.expectedDeliveryAt,
          subtotal: payload.subtotal || 0,
          transport_cost: payload.transportCost || 0,
          customs_cost: payload.customsCost || 0,
          vat_import: payload.vatImport || 0,
          freight_forwarder_cost: payload.freightForwarderCost || 0,
          bank_fees: payload.bankFees || 0,
          exchange_fees: payload.exchangeFees || 0,
          local_delivery: payload.localDelivery || 0,
          other_costs: payload.otherCosts || 0,
          total_real_cost: payload.totalRealCost || 0,
          cost_method: payload.costMethod || 'by_value',
          payment_status: payload.paymentStatus || 'pending',
          order_group: payload.orderGroup || null,
          transport_method: payload.transportMethod || null,
        }),
      });
      if (!res.ok) return null;
      const { order } = await res.json();
      return order ? mapOrder(order) : null;
    } catch { return null; }
  },

  async update(id: string, payload: Partial<FoOrder>): Promise<FoOrder | null> {
    try {
      const res = await fetch(`/api/fo-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error('[supplierOrderService.update]', err);
        return null;
      }
      return await supplierOrderService.getById(id);
    } catch (e) {
      console.error('[supplierOrderService.update]', e);
      return null;
    }
  },

  async changeStatus(orderId: string, newStatus: FoOrderStatus, changedBy: string, comment?: string): Promise<boolean> {
    try {
      // Get current status for history
      let oldStatus: string | undefined;
      try {
        const current = await supplierOrderService.getById(orderId);
        oldStatus = current?.orderStatus;
      } catch { /* non-critical */ }

      const res = await fetch(`/api/fo-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderStatus: newStatus }),
      });
      if (!res.ok) return false;

      // Insert history entry
      fetch(`/api/fo-orders/${orderId}/status-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldStatus, newStatus, changedBy, comment }),
      }).catch(() => {});

      return true;
    } catch { return false; }
  },

  // Lines
  async getLines(orderId: string): Promise<FoOrderLine[]> {
    try {
      const res = await fetch(`/api/fo-orders/${orderId}/lines`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map(mapLine);
    } catch { return []; }
  },

  async addLine(line: Partial<FoOrderLine>): Promise<FoOrderLine | null> {
    try {
      const res = await fetch(`/api/fo-orders/${line.orderId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line: {
            productId: line.productId,
            productName: line.productName,
            productRef: line.productRef,
            productImageUrl: line.productImageUrl,
            variant: line.variant,
            color: line.color,
            size: line.size,
            model: line.model,
            qtyOrdered: line.qtyOrdered || 1,
            unitPrice: line.unitPrice || 0,
            salePrice: line.salePrice || 0,
            weightKg: line.weightKg || 0,
            volumeM3: line.volumeM3 || 0,
            note: line.note,
          },
        }),
      });
      if (!res.ok) return null;
      const { id } = await res.json();
      if (!id) return null;
      // Return a minimal object so callers can use the id
      return { ...line, id, orderId: line.orderId! } as FoOrderLine;
    } catch { return null; }
  },

  async updateLine(lineId: string, payload: Partial<FoOrderLine>): Promise<boolean> {
    try {
      const body: any = {};
      if (payload.qtyOrdered !== undefined) body.qty_ordered = payload.qtyOrdered;
      if (payload.qtyReceived !== undefined) body.qty_received = payload.qtyReceived;
      if (payload.unitPrice !== undefined) body.unit_price = payload.unitPrice;
      if (payload.lineTotal !== undefined) body.line_total = payload.lineTotal;
      if (payload.unitRealCost !== undefined) body.unit_real_cost = payload.unitRealCost;
      if (payload.unitTransport !== undefined) body.unit_transport = payload.unitTransport;
      if (payload.unitCustoms !== undefined) body.unit_customs = payload.unitCustoms;
      if (payload.unitVatImport !== undefined) body.unit_vat_import = payload.unitVatImport;
      if (payload.unitFreight !== undefined) body.unit_freight = payload.unitFreight;
      if (payload.unitOther !== undefined) body.unit_other = payload.unitOther;
      if (payload.salePrice !== undefined) body.sale_price = payload.salePrice;
      if (payload.grossMargin !== undefined) body.gross_margin = payload.grossMargin;
      if (payload.marginRate !== undefined) body.margin_rate = payload.marginRate;
      if (payload.qtyMissing !== undefined) body.qty_missing = payload.qtyMissing;
      if (payload.qtyDamaged !== undefined) body.qty_damaged = payload.qtyDamaged;
      if (payload.receptionNote !== undefined) body.reception_note = payload.receptionNote;
      if (payload.note !== undefined) body.note = payload.note;
      if (payload.customCostShare !== undefined) body.custom_cost_share = payload.customCostShare;
      if (payload.confirmedUnitPrice !== undefined) body.confirmed_unit_price = payload.confirmedUnitPrice;
      const res = await fetch(`/api/fo-order-lines/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch { return false; }
  },

  async deleteLine(lineId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/fo-order-lines/${lineId}`, { method: 'DELETE' });
      return res.ok;
    } catch { return false; }
  },

  // Status history
  async getStatusHistory(orderId: string): Promise<FoStatusHistory[]> {
    try {
      const res = await fetch(`/api/fo-orders/${orderId}/status-history`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((r: any) => ({
        id: r.id,
        orderId: r.order_id,
        oldStatus: r.old_status,
        newStatus: r.new_status,
        changedAt: r.changed_at,
        changedBy: r.changed_by,
        comment: r.comment,
      }));
    } catch { return []; }
  },

  // Restock
  async getRestockSuggestions(statusFilter?: FoRestockStatus): Promise<FoRestockSuggestion[]> {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/fo-restock-suggestions${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map(mapRestock);
    } catch { return []; }
  },

  async updateRestockStatus(id: string, status: FoRestockStatus, reason?: FoSuspensionReason, note?: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/fo-restock-suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reason, note }),
      });
      return res.ok;
    } catch { return false; }
  },

  // Cost history
  async getCostHistory(productId?: string): Promise<FoProductCostHistory[]> {
    try {
      const params = productId ? `?productId=${productId}` : '';
      const res = await fetch(`/api/fo-cost-history${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map(mapCostHistory);
    } catch { return []; }
  },

  // Analytics
  async getSupplierExpenses(supplierId?: string, period?: { from: string; to: string }) {
    try {
      const params = new URLSearchParams();
      if (supplierId) params.set('supplierId', supplierId);
      if (period?.from) params.set('from', period.from);
      if (period?.to) params.set('to', period.to);
      const res = await fetch(`/api/fo-orders?${params}`);
      if (!res.ok) return null;
      const orders = await res.json();
      return {
        totalSpent: orders.reduce((s: number, o: any) => s + Number(o.total_real_cost || 0), 0),
        totalProducts: orders.reduce((s: number, o: any) => s + Number(o.subtotal || 0), 0),
        totalTransport: orders.reduce((s: number, o: any) => s + Number(o.transport_cost || 0), 0),
        totalCustoms: orders.reduce((s: number, o: any) => s + Number(o.customs_cost || 0), 0),
        totalVat: orders.reduce((s: number, o: any) => s + Number(o.vat_import || 0), 0),
        totalOther: orders.reduce((s: number, o: any) => s + Number(o.other_costs || 0), 0),
        orderCount: orders.length,
        avgOrder: orders.length > 0 ? orders.reduce((s: number, o: any) => s + Number(o.total_real_cost || 0), 0) / orders.length : 0,
        orders,
      };
    } catch { return null; }
  },

  async getDashboardStats() {
    try {
      const res = await fetch('/api/fo-orders');
      if (!res.ok) return null;
      const orders = await res.json();
      return {
        draft: orders.filter((o: any) => o.order_status === 'draft').length,
        awaitingValidation: orders.filter((o: any) => o.order_status === 'awaiting_validation').length,
        toPay: orders.filter((o: any) => o.payment_status === 'pending' && !['draft', 'cancelled', 'closed'].includes(o.order_status)).length,
        paid: orders.filter((o: any) => ['paid', 'payment_received_by_supplier'].includes(o.payment_status)).length,
        inPreparation: orders.filter((o: any) => ['in_preparation', 'in_production', 'ready_to_ship'].includes(o.order_status)).length,
        shipped: orders.filter((o: any) => o.order_status === 'shipped').length,
        received: orders.filter((o: any) => ['fully_received', 'partially_received'].includes(o.order_status)).length,
        costsNotRecorded: orders.filter((o: any) => ['fully_received', 'partially_received'].includes(o.order_status) && !o.costs_validated).length,
        toIntegrate: orders.filter((o: any) => o.costs_validated && !o.stock_integrated).length,
        suspended: orders.filter((o: any) => o.order_status === 'suspended').length,
      };
    } catch { return null; }
  },
};
