'use client';

import { deductStockForSale } from './stockService';

export type ReservationStatus = 'pending' | 'deposit_paid' | 'ready' | 'completed' | 'cancelled';
export type ReservationPaymentMethod = 'cash' | 'card' | 'transfer' | 'cheque' | 'alma';

export type ReservationType =
  | 'commande_container' |'commande_avion' |'reservation_sur_place' |'precommande' |'livraison_fournisseur' |'arrivage_en_attente' |'produit_disponible' |'produit_en_transit';

export type RecoveryMode =
  | 'sur_place' |'a_livrer' |'livraison_en_cours' |'expedie' |'recupere';

export const RESERVATION_TYPE_CONFIG: Record<ReservationType, { label: string; color: string; icon: string }> = {
  commande_container:   { label: 'Container',          color: 'text-blue-700 bg-blue-50 border-blue-200',       icon: 'ArchiveBoxIcon' },
  commande_avion:       { label: 'Avion',               color: 'text-sky-700 bg-sky-50 border-sky-200',          icon: 'PaperAirplaneIcon' },
  reservation_sur_place:{ label: 'Sur place',           color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'BuildingStorefrontIcon' },
  precommande:          { label: 'Précommande',         color: 'text-violet-700 bg-violet-50 border-violet-200', icon: 'ClockIcon' },
  livraison_fournisseur:{ label: 'Livraison fournisseur',color: 'text-orange-700 bg-orange-50 border-orange-200',icon: 'TruckIcon' },
  arrivage_en_attente:  { label: 'Arrivage en attente', color: 'text-amber-700 bg-amber-50 border-amber-200',    icon: 'ExclamationCircleIcon' },
  produit_disponible:   { label: 'Disponible',          color: 'text-teal-700 bg-teal-50 border-teal-200',       icon: 'CheckCircleIcon' },
  produit_en_transit:   { label: 'En transit',          color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: 'ArrowPathIcon' },
};

export const RECOVERY_MODE_CONFIG: Record<RecoveryMode, { label: string; color: string; icon: string }> = {
  sur_place:         { label: 'À récupérer sur place', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'BuildingStorefrontIcon' },
  a_livrer:          { label: 'À livrer',              color: 'text-blue-700 bg-blue-50 border-blue-200',          icon: 'TruckIcon' },
  livraison_en_cours:{ label: 'Livraison en cours',    color: 'text-amber-700 bg-amber-50 border-amber-200',       icon: 'ArrowPathIcon' },
  expedie:           { label: 'Expédié',               color: 'text-violet-700 bg-violet-50 border-violet-200',    icon: 'PaperAirplaneIcon' },
  recupere:          { label: 'Récupéré',              color: 'text-slate-600 bg-slate-50 border-slate-200',       icon: 'CheckCircleIcon' },
};

export interface KitComponentInfo {
  componentId: string;
  name: string;
  ref: string;
  imageUrl: string | null;
  quantity: number;
}

export interface ReservationItem {
  name: string;
  qty: number;
  price: number;
  sku?: string;
  productId?: string;
  imageUrl?: string;
  isKit?: boolean;
  kitComponents?: KitComponentInfo[] | null;
  // Variant fields
  variant?: string;
  color?: string;
  size?: string;
  model?: string;
  power?: string;
  format?: string;
}

export interface DepositEntry {
  id: string;
  amount: number;
  method: string;
  paid_at: string;
  accounting_date: string;
  cashier_name: string | null;
  is_balance?: boolean;
}

export interface Reservation {
  id: string;
  reservationNumber: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  items: ReservationItem[];
  totalAmount: number;
  depositAmount: number;
  depositPaid: number;
  deposits: DepositEntry[];
  balanceDue: number;
  /** Amount paid when client returns to pay the remaining balance */
  balancePaid: number;
  balancePaidAt: string | null;
  balancePaymentMethod: string | null;
  /** Date the deposit was counted in revenue (day 1) */
  depositAccountingDate: string | null;
  /** Date the balance was counted in revenue (day 2+) */
  balanceAccountingDate: string | null;
  depositPercent: number | null;
  reservationStatus: ReservationStatus;
  reservationType: ReservationType | null;
  recoveryMode: RecoveryMode;
  depositPaymentMethod: ReservationPaymentMethod | null;
  depositPaidAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  sellerComment: string | null;
  clientComment: string | null;
  pickupDate: string | null;
  estimatedArrivalDate: string | null;
  deliveryAddress: string | null;
  deliveryPhone: string | null;
  deliveryContact: string | null;
  deliveryNotes: string | null;
  cashierName: string | null;
  posSaleId: string | null;
  remiseType: 'percentage' | 'fixed' | null;
  remiseValeur: number | null;
  remiseMontant: number | null;
  remiseMotif: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReservationInput {
  clientId?: string;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  items: ReservationItem[];
  totalAmount: number;
  totalFinal?: number;
  depositAmount: number;
  depositPercent?: number;
  reservationType?: ReservationType;
  recoveryMode?: RecoveryMode;
  notes?: string;
  sellerComment?: string;
  clientComment?: string;
  pickupDate?: string;
  estimatedArrivalDate?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryContact?: string;
  deliveryNotes?: string;
  cashierName?: string;
  remiseType?: 'percentage' | 'fixed' | null;
  remiseValeur?: number | null;
  remiseMontant?: number | null;
  remiseMotif?: string | null;
}

export interface CreateFromPOSInput {
  clientName: string;
  clientPhone?: string;
  items: ReservationItem[];
  totalAmount: number;
  depositPaid: number;
  depositPercent?: number;
  depositPaymentMethod: ReservationPaymentMethod;
  reservationType?: ReservationType;
  recoveryMode?: RecoveryMode;
  notes?: string;
  cashierName?: string;
  posSaleId?: string;
}

export interface UpdateDepositInput {
  depositPaid: number;
  depositPaymentMethod: ReservationPaymentMethod;
}

/** Input for recording the balance payment (solde) */
export interface RecordBalanceInput {
  balancePaid: number;
  balancePaymentMethod: ReservationPaymentMethod;
  cashierName?: string;
  receiptId?: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface ProductSearchResult {
  id: string;
  name: string;
  ref: string;
  sku?: string;
  imageUrl: string | null;
  stock: number;
  minStock: number;
  sellPriceTtc: number;
  category: string | null;
  status: string | null;
  stockStatus: StockStatus;
  isKit?: boolean;
}

export interface ReservationStats {
  total: number;
  pending: number;
  depositPaid: number;
  ready: number;
  completed: number;
  cancelled: number;
  /** Sum of deposit_paid across all non-cancelled reservations */
  totalDepositsCollected: number;
  /** Sum of balance_due across active (non-cancelled, non-completed) reservations */
  totalAmountPending: number;
  /** Sum of balance_paid across all reservations */
  totalBalancesCollected: number;
  /** Real revenue = deposits collected + balances collected (no double counting) */
  totalRealRevenue: number;
  /** Count of reservations with balance_due > 0 and status not cancelled/completed */
  pendingBalanceCount: number;
  byType: Partial<Record<ReservationType, number>>;
  byRecovery: Partial<Record<RecoveryMode, number>>;
}

function mapReservation(row: any): Reservation {
  return {
    id: row.id,
    reservationNumber: row.reservation_number,
    clientId: row.client_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    items: Array.isArray(row.items) ? row.items : [],
    totalAmount: parseFloat(row.total_amount ?? 0),
    depositAmount: parseFloat(row.deposit_amount ?? 0),
    depositPaid: parseFloat(row.deposit_paid ?? 0),
    deposits: Array.isArray(row.deposits) ? row.deposits : [],
    // Compute in code: DB generated column formula is total_amount - deposit_paid (misses balance_paid)
    balanceDue: Math.max(
      parseFloat(row.total_amount ?? 0) - parseFloat(row.deposit_paid ?? 0) - parseFloat(row.balance_paid ?? 0),
      0
    ),
    balancePaid: parseFloat(row.balance_paid ?? 0),
    balancePaidAt: row.balance_paid_at ?? null,
    balancePaymentMethod: row.balance_payment_method ?? null,
    depositAccountingDate: row.deposit_accounting_date ?? null,
    balanceAccountingDate: row.balance_accounting_date ?? null,
    depositPercent: row.deposit_percent ?? null,
    reservationStatus: row.reservation_status,
    reservationType: row.reservation_type ?? null,
    recoveryMode: row.recovery_mode ?? 'sur_place',
    depositPaymentMethod: row.deposit_payment_method,
    depositPaidAt: row.deposit_paid_at,
    readyAt: row.ready_at,
    completedAt: row.completed_at,
    cancelledAt: row.cancelled_at,
    cancellationReason: row.cancellation_reason,
    notes: row.notes,
    sellerComment: row.seller_comment ?? null,
    clientComment: row.client_comment ?? null,
    pickupDate: row.pickup_date,
    estimatedArrivalDate: row.estimated_arrival_date ?? null,
    deliveryAddress: row.delivery_address ?? null,
    deliveryPhone: row.delivery_phone ?? null,
    deliveryContact: row.delivery_contact ?? null,
    deliveryNotes: row.delivery_notes ?? null,
    cashierName: row.cashier_name,
    posSaleId: row.pos_sale_id ?? null,
    remiseType: row.remise_type ?? null,
    remiseValeur: row.remise_valeur != null ? parseFloat(row.remise_valeur) : null,
    remiseMontant: row.remise_montant != null ? parseFloat(row.remise_montant) : null,
    remiseMotif: row.remise_motif ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getStockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minStock) return 'low_stock';
  return 'in_stock';
}

export const reservationService = {
  async getAll(statusFilter?: ReservationStatus | 'all', typeFilter?: ReservationType | 'all', recoveryFilter?: RecoveryMode | 'all'): Promise<Reservation[]> {
    try {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter && typeFilter !== 'all') params.set('type', typeFilter);
      if (recoveryFilter && recoveryFilter !== 'all') params.set('recovery', recoveryFilter);
      const res = await fetch(`/api/reservations?${params}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map(mapReservation);
    } catch (e: any) { console.log('reservationService.getAll exception:', e.message); return []; }
  },

  async search(query: string): Promise<Reservation[]> {
    try {
      const res = await fetch(`/api/reservations?search=${encodeURIComponent(query.trim())}`).catch(() => null);
      if (!res?.ok) return [];
      const data = await res.json();
      return (Array.isArray(data) ? data : []).map(mapReservation);
    } catch (e: any) { console.log('reservationService.search exception:', e.message); return []; }
  },

  async getById(id: string): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}`).catch(() => null);
      if (!res?.ok) return null;
      const data = await res.json();
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.getById exception:', e.message); return null; }
  },

  async searchProducts(query: string): Promise<ProductSearchResult[]> {
    try {
      const q = query.trim();
      if (!q) return [];
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=15`).catch(() => null);
      if (!res?.ok) return [];
      const json = await res.json();
      return (json.products ?? []).map((row: any): ProductSearchResult => ({
        id: row.id,
        name: row.name,
        ref: row.ref,
        sku: row.ref,
        imageUrl: row.image_url,
        stock: row.stock ?? 0,
        minStock: row.min_stock ?? 5,
        sellPriceTtc: parseFloat(row.sell_price_ttc ?? 0),
        category: row.category,
        status: row.status,
        stockStatus: getStockStatus(row.stock ?? 0, row.min_stock ?? 5),
        isKit: Boolean(row.is_kit),
      }));
    } catch (e: any) { console.log('reservationService.searchProducts exception:', e.message); return []; }
  },

  async fetchKitComponents(productId: string): Promise<KitComponentInfo[]> {
    try {
      const res = await fetch(`/api/products/kit-components?productId=${encodeURIComponent(productId)}`);
      if (!res.ok) { console.log('fetchKitComponents HTTP error:', res.status); return []; }
      const json = await res.json();
      return json.components ?? [];
    } catch (e: any) { console.log('fetchKitComponents exception:', e.message); return []; }
  },

  async upsertClientByPhone(phone: string, name: string, email?: string): Promise<{ id: string; created: boolean; emailUpdated: boolean } | null> {
    try {
      // Search existing client by phone via admin API
      const searchRes = await fetch(`/api/clients?phone=${encodeURIComponent(phone.trim())}`).catch(() => null);
      const searchData = searchRes?.ok ? await searchRes.json() : null;
      const existing = Array.isArray(searchData) ? searchData.find((c: any) => c.phone === phone.trim()) : null;

      if (existing) {
        if (!existing.email && email) {
          await fetch(`/api/clients/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          }).catch(() => {});
          return { id: existing.id, created: false, emailUpdated: true };
        }
        return { id: existing.id, created: false, emailUpdated: false };
      }

      const parts = name.trim().split(' ');
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(' ') || '';
      const createRes = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          phone: phone.trim(),
          email: email || null,
          client_type: 'particulier',
          gender: 'not_specified',
          country: 'France',
          is_active: true,
        }),
      }).catch(() => null);
      if (!createRes?.ok) return null;
      const created = await createRes.json();
      if (!created?.id) return null;
      return { id: created.id, created: true, emailUpdated: false };
    } catch (e: any) { console.log('upsertClientByPhone error:', e.message); return null; }
  },

  async create(input: CreateReservationInput): Promise<Reservation> {
    const res = await fetch('/api/reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: input.clientId || null,
        client_name: input.clientName,
        client_phone: input.clientPhone || null,
        client_email: input.clientEmail || null,
        items: input.items,
        total_amount: input.totalFinal ?? input.totalAmount,
        deposit_amount: input.depositAmount,
        deposit_paid: 0,
        balance_paid: 0,
        deposit_percent: input.depositPercent ?? null,
        reservation_status: 'pending',
        reservation_type: input.reservationType || null,
        recovery_mode: input.recoveryMode || 'sur_place',
        notes: input.notes || null,
        seller_comment: input.sellerComment || null,
        client_comment: input.clientComment || null,
        pickup_date: input.pickupDate || null,
        estimated_arrival_date: input.estimatedArrivalDate || null,
        delivery_address: input.deliveryAddress || null,
        delivery_phone: input.deliveryPhone || null,
        delivery_contact: input.deliveryContact || null,
        delivery_notes: input.deliveryNotes || null,
        cashier_name: input.cashierName || null,
        remise_type: input.remiseType ?? null,
        remise_valeur: input.remiseValeur ?? null,
        remise_montant: input.remiseMontant ?? null,
        remise_motif: input.remiseMotif ?? null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();

    for (const item of input.items) {
      if (item.productId) {
        fetch('/api/reservations/stock-rpc', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deduct', productId: item.productId, qty: item.qty }),
        }).catch(() => {});
      }
    }

    return mapReservation(data);
  },

  /** Called from POS when a deposit is collected — creates reservation with deposit_paid status */
  async createFromPOS(input: CreateFromPOSInput): Promise<Reservation | null> {
    try {
      const now = new Date().toISOString();
      const today = now.split('T')[0];
      const posDepositEntry = input.depositPaid > 0 ? [{
        id: crypto.randomUUID(),
        amount: input.depositPaid,
        method: input.depositPaymentMethod,
        paid_at: now,
        accounting_date: today,
        cashier_name: input.cashierName || null,
      }] : [];
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: null,
          client_name: input.clientName,
          client_phone: input.clientPhone || null,
          client_email: null,
          items: input.items,
          total_amount: input.totalAmount,
          deposit_amount: input.depositPaid,
          deposit_paid: input.depositPaid,
          balance_paid: 0,
          deposit_percent: input.depositPercent ?? null,
          deposit_payment_method: input.depositPaymentMethod,
          deposit_paid_at: now,
          deposit_accounting_date: today,
          reservation_status: 'deposit_paid',
          reservation_type: input.reservationType || null,
          recovery_mode: input.recoveryMode || 'sur_place',
          notes: input.notes || null,
          cashier_name: input.cashierName || null,
          pos_sale_id: input.posSaleId || null,
          deposits: posDepositEntry,
        }),
      }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.createFromPOS error: HTTP', res?.status); return null; }
      const data = await res.json();

      for (const item of input.items) {
        if (item.productId) {
          fetch('/api/reservations/stock-rpc', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deduct', productId: item.productId, qty: item.qty }),
          }).catch(() => {});
        }
      }

      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.createFromPOS exception:', e.message); return null; }
  },

  /**
   * Record deposit payment — only the deposit amount is counted in revenue for today.
   * Sets deposit_accounting_date to today so it appears in daily revenue correctly.
   */
  async recordDeposit(id: string, input: UpdateDepositInput): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}/add-deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: input.depositPaid, method: input.depositPaymentMethod }),
      }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.recordDeposit error: HTTP', res?.status); return null; }
      const data = await res.json();
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.recordDeposit exception:', e.message); return null; }
  },

  /**
   * Record balance payment — only the balance amount is counted in revenue for today.
   * This is separate from the deposit to avoid double counting.
   * Sets balance_accounting_date to today.
   */
  async recordBalance(id: string, input: RecordBalanceInput): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}/record-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: input.balancePaid, method: input.balancePaymentMethod, cashierName: input.cashierName }),
      }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.recordBalance error: HTTP', res?.status); return null; }
      const data = await res.json();
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.recordBalance exception:', e.message); return null; }
  },

  async markReady(id: string): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}/mark-ready`, { method: 'POST' }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.markReady error: HTTP', res?.status); return null; }
      const data = await res.json();
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.markReady exception:', e.message); return null; }
  },

  async markCompleted(id: string): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}/mark-completed`, { method: 'POST' }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.markCompleted error: HTTP', res?.status); return null; }
      const data = await res.json();

      // Deduct stock for sold items (only if not already completed)
      if (data.previousStatus !== 'completed' && Array.isArray(data.items)) {
        const stockItems = (data.items as any[])
          .filter((item: any) => item.productId || item.product_id)
          .map((item: any) => ({
            productId: item.productId || item.product_id,
            name: item.name || item.productName || '',
            qty: Number(item.qty || item.quantity) || 1,
          }));
        if (stockItems.length > 0) {
          deductStockForSale(stockItems, `RES-${id.slice(0, 8).toUpperCase()}`, 'reservation', 'Réservation', 'completed', 'reservation').catch(() => {});
        }
      }

      return mapReservation(data);
    } catch (e: any) { console.log('reservationService.markCompleted exception:', e.message); return null; }
  },

  async cancel(id: string, reason?: string): Promise<Reservation | null> {
    try {
      const res = await fetch(`/api/reservations/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || null }),
      }).catch(() => null);
      if (!res?.ok) { console.log('reservationService.cancel error: HTTP', res?.status); return null; }
      const data = await res.json();

      if (data.previousStatus !== 'cancelled' && Array.isArray(data.items)) {
        const items: ReservationItem[] = data.items;
        for (const item of items) {
          if (item.productId) {
            fetch('/api/reservations/stock-rpc', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reinject', productId: item.productId, qty: item.qty }),
            }).catch(() => {});
          }
        }
      }

      return mapReservation(data);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) { console.log('reservationService.cancel exception:', e.message); return null; }
  },

  async update(id: string, input: Partial<CreateReservationInput> & { items?: ReservationItem[] }): Promise<Reservation> {
    try {
      // Get current items for stock comparison
      const existingRes = await fetch(`/api/reservations/${id}`).catch(() => null);
      const existing = existingRes?.ok ? await existingRes.json() : null;

      const updatePayload: Record<string, any> = {};
      if (input.clientId !== undefined) updatePayload.client_id = input.clientId || null;
      if (input.clientName !== undefined) updatePayload.client_name = input.clientName;
      if (input.clientPhone !== undefined) updatePayload.client_phone = input.clientPhone || null;
      if (input.clientEmail !== undefined) updatePayload.client_email = input.clientEmail || null;
      if (input.notes !== undefined) updatePayload.notes = input.notes || null;
      if (input.sellerComment !== undefined) updatePayload.seller_comment = input.sellerComment || null;
      if (input.clientComment !== undefined) updatePayload.client_comment = input.clientComment || null;
      if (input.pickupDate !== undefined) updatePayload.pickup_date = input.pickupDate || null;
      if (input.estimatedArrivalDate !== undefined) updatePayload.estimated_arrival_date = input.estimatedArrivalDate || null;
      if (input.depositAmount !== undefined) {
        updatePayload.deposit_amount = input.depositAmount;
        // Always sync deposit_percent when deposit_amount is updated.
        // If depositPercent is undefined (user chose custom amount), we clear it in DB to prevent stale % recalculating deposit on next edit.
        updatePayload.deposit_percent = input.depositPercent !== undefined ? (input.depositPercent ?? null) : null;
      } else if (input.depositPercent !== undefined) {
        updatePayload.deposit_percent = input.depositPercent ?? null;
      }
      if (input.reservationType !== undefined) updatePayload.reservation_type = input.reservationType || null;
      if (input.recoveryMode !== undefined) updatePayload.recovery_mode = input.recoveryMode;
      if (input.deliveryAddress !== undefined) updatePayload.delivery_address = input.deliveryAddress || null;
      if (input.deliveryPhone !== undefined) updatePayload.delivery_phone = input.deliveryPhone || null;
      if (input.deliveryContact !== undefined) updatePayload.delivery_contact = input.deliveryContact || null;
      if (input.deliveryNotes !== undefined) updatePayload.delivery_notes = input.deliveryNotes || null;
      if (input.items !== undefined) {
        updatePayload.items = input.items;
        const itemsSum = input.items.reduce((s, it) => s + it.qty * it.price, 0);
        updatePayload.total_amount = input.totalFinal ?? itemsSum;
      } else if (input.totalFinal !== undefined) {
        updatePayload.total_amount = input.totalFinal;
      }
      if (input.remiseType !== undefined) updatePayload.remise_type = input.remiseType ?? null;
      if (input.remiseValeur !== undefined) updatePayload.remise_valeur = input.remiseValeur ?? null;
      if (input.remiseMontant !== undefined) updatePayload.remise_montant = input.remiseMontant ?? null;
      if (input.remiseMotif !== undefined) updatePayload.remise_motif = input.remiseMotif ?? null;

      const patchRes = await fetch(`/api/reservations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${patchRes.status}`);
      }
      const data = await patchRes.json();

      if (existing && input.items) {
        const oldItems: ReservationItem[] = Array.isArray(existing.items) ? existing.items : [];
        const newItems = input.items;
        // Only touch stock if items actually changed (avoids double-movement when re-saving unchanged reservation)
        const itemsKey = (items: ReservationItem[]) =>
          items.filter(it => it.productId).map(it => `${it.productId}:${it.qty}`).sort().join('|');
        if (itemsKey(oldItems) !== itemsKey(newItems)) {
          for (const item of oldItems) {
            if (item.productId) {
              fetch('/api/reservations/stock-rpc', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'reinject', productId: item.productId, qty: item.qty }),
            }).catch(() => {});
            }
          }
          for (const item of newItems) {
            if (item.productId) {
              fetch('/api/reservations/stock-rpc', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deduct', productId: item.productId, qty: item.qty }),
              }).catch(() => {});
            }
          }
        }
      }

      return mapReservation(data);
    } catch (e: any) {
      console.log('reservationService.update exception:', e.message);
      throw e;
    }
  },

  async getStats(): Promise<ReservationStats> {
    const empty: ReservationStats = {
      total: 0, pending: 0, depositPaid: 0, ready: 0, completed: 0, cancelled: 0,
      totalDepositsCollected: 0, totalAmountPending: 0, totalBalancesCollected: 0,
      totalRealRevenue: 0, pendingBalanceCount: 0, byType: {}, byRecovery: {},
    };
    try {
      const res = await fetch('/api/reservations/stats').catch(() => null);
      if (!res?.ok) return empty;
      const rows: any[] = (await res.json()) ?? [];
      const activeRows = rows.filter((r: any) => r.reservation_status !== 'cancelled' && r.reservation_status !== 'completed');

      const byType: Partial<Record<ReservationType, number>> = {};
      const byRecovery: Partial<Record<RecoveryMode, number>> = {};
      for (const r of rows) {
        if (r.reservation_type) {
          byType[r.reservation_type as ReservationType] = (byType[r.reservation_type as ReservationType] ?? 0) + 1;
        }
        if (r.recovery_mode) {
          byRecovery[r.recovery_mode as RecoveryMode] = (byRecovery[r.recovery_mode as RecoveryMode] ?? 0) + 1;
        }
      }

      // Compute balance_due in JS — DB generated column only does total_amount − deposit_paid and misses balance_paid
      const rowBalanceDue = (r: any) => Math.max(
        parseFloat(r.total_amount ?? 0) - parseFloat(r.deposit_paid ?? 0) - parseFloat(r.balance_paid ?? 0),
        0
      );

      const nonCancelledRows = rows.filter((r: any) => r.reservation_status !== 'cancelled');
      const totalDepositsCollected = nonCancelledRows.reduce((sum: number, r: any) => sum + parseFloat(r.deposit_paid ?? 0), 0);
      const totalBalancesCollected = nonCancelledRows.reduce((sum: number, r: any) => sum + parseFloat(r.balance_paid ?? 0), 0);
      // Real revenue = deposits + balances (no double counting — each is recorded separately on different days)
      const totalRealRevenue = totalDepositsCollected + totalBalancesCollected;
      const pendingBalanceCount = activeRows.filter((r: any) => rowBalanceDue(r) > 0).length;

      return {
        total: rows.length,
        pending: rows.filter((r: any) => r.reservation_status === 'pending').length,
        depositPaid: rows.filter((r: any) => r.reservation_status === 'deposit_paid').length,
        ready: rows.filter((r: any) => r.reservation_status === 'ready').length,
        completed: rows.filter((r: any) => r.reservation_status === 'completed').length,
        cancelled: rows.filter((r: any) => r.reservation_status === 'cancelled').length,
        totalDepositsCollected,
        totalAmountPending: activeRows.reduce((sum: number, r: any) => sum + rowBalanceDue(r), 0),
        totalBalancesCollected,
        totalRealRevenue,
        pendingBalanceCount,
        byType,
        byRecovery,
      };
    } catch (e: any) { return empty; }
  },
};
