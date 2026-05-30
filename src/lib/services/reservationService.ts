'use client';

import { createClient } from '@/lib/supabase/client';
import { deductStockForSale } from './stockService';

export type ReservationStatus = 'pending' | 'deposit_paid' | 'ready' | 'completed' | 'cancelled';
export type ReservationPaymentMethod = 'cash' | 'card' | 'transfer' | 'cheque';

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

export interface ReservationItem {
  name: string;
  qty: number;
  price: number;
  sku?: string;
  productId?: string;
  imageUrl?: string;
  // Variant fields
  variant?: string;
  color?: string;
  size?: string;
  model?: string;
  power?: string;
  format?: string;
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
    balanceDue: parseFloat(row.balance_due ?? 0),
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getStockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= 0) return 'out_of_stock';
  if (stock <= minStock) return 'low_stock';
  return 'in_stock';
}

function generateReservationNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `RES-${year}-${rand}`;
}

export const reservationService = {
  async getAll(statusFilter?: ReservationStatus | 'all', typeFilter?: ReservationType | 'all', recoveryFilter?: RecoveryMode | 'all'): Promise<Reservation[]> {
    const supabase = createClient();
    try {
      let query = supabase
        .from('reservations')
        .select('*')
        .order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('reservation_status', statusFilter);
      }
      if (typeFilter && typeFilter !== 'all') {
        query = query.eq('reservation_type', typeFilter);
      }
      if (recoveryFilter && recoveryFilter !== 'all') {
        query = query.eq('recovery_mode', recoveryFilter);
      }
      const { data, error } = await query;
      if (error) { console.log('reservationService.getAll error:', error.message); return []; }
      return (data ?? []).map(mapReservation);
    } catch (e: any) { console.log('reservationService.getAll exception:', e.message); return []; }
  },

  async search(query: string): Promise<Reservation[]> {
    const supabase = createClient();
    try {
      const q = query.trim().toLowerCase();
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .or(`client_name.ilike.%${q}%,client_phone.ilike.%${q}%,reservation_number.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) { console.log('reservationService.search error:', error.message); return []; }
      return (data ?? []).map(mapReservation);
    } catch (e: any) { console.log('reservationService.search exception:', e.message); return []; }
  },

  async getById(id: string): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) { console.log('reservationService.getById error:', error.message); return null; }
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.getById exception:', e.message); return null; }
  },

  async searchProducts(query: string): Promise<ProductSearchResult[]> {
    const supabase = createClient();
    try {
      const q = query.trim();
      if (!q) return [];
      const { data, error } = await supabase
        .from('products')
        .select('id, name, ref, barcode, image_url, stock, min_stock, sell_price_ttc, category, status')
        .or(`name.ilike.%${q}%,ref.ilike.%${q}%,barcode.ilike.%${q}%,category.ilike.%${q}%`)
        .order('name')
        .limit(15);
      if (error) { console.log('reservationService.searchProducts error:', error.message); return []; }
      return (data ?? []).map((row: any): ProductSearchResult => ({
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
      }));
    } catch (e: any) { console.log('reservationService.searchProducts exception:', e.message); return []; }
  },

  async upsertClientByPhone(phone: string, name: string, email?: string): Promise<{ id: string; created: boolean; emailUpdated: boolean } | null> {
    const supabase = createClient();
    try {
      const { data: existing } = await supabase
        .from('clients')
        .select('id, email')
        .eq('phone', phone.trim())
        .maybeSingle();

      if (existing) {
        if (!existing.email && email) {
          await supabase.from('clients').update({ email }).eq('id', existing.id);
          return { id: existing.id, created: false, emailUpdated: true };
        }
        return { id: existing.id, created: false, emailUpdated: false };
      }

      const parts = name.trim().split(' ');
      const firstName = parts[0] || name;
      const lastName = parts.slice(1).join(' ') || '';
      const { data: newClient, error } = await supabase
        .from('clients')
        .insert({
          first_name: firstName,
          last_name: lastName,
          phone: phone.trim(),
          email: email || null,
          client_type: 'particulier',
          gender: 'not_specified',
          country: 'France',
          is_active: true,
        })
        .select('id')
        .single();
      if (error || !newClient) return null;
      return { id: newClient.id, created: true, emailUpdated: false };
    } catch (e: any) { console.log('upsertClientByPhone error:', e.message); return null; }
  },

  async create(input: CreateReservationInput): Promise<Reservation> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('reservations')
      .insert({
        reservation_number: generateReservationNumber(),
        client_id: input.clientId || null,
        client_name: input.clientName,
        client_phone: input.clientPhone || null,
        client_email: input.clientEmail || null,
        items: input.items,
        total_amount: input.totalAmount,
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
      })
      .select()
      .single();
    if (error) {
      console.log('reservationService.create error:', error.message);
      throw new Error(error.message);
    }

    for (const item of input.items) {
      if (item.productId) {
        await supabase.rpc('deduct_stock_on_reservation', {
          p_product_id: item.productId,
          p_qty: item.qty,
        });
      }
    }

    return mapReservation(data);
  },

  /** Called from POS when a deposit is collected — creates reservation with deposit_paid status */
  async createFromPOS(input: CreateFromPOSInput): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('reservations')
        .insert({
          reservation_number: generateReservationNumber(),
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
          deposit_paid_at: new Date().toISOString(),
          deposit_accounting_date: today,
          reservation_status: 'deposit_paid',
          reservation_type: input.reservationType || null,
          recovery_mode: input.recoveryMode || 'sur_place',
          notes: input.notes || null,
          cashier_name: input.cashierName || null,
          pos_sale_id: input.posSaleId || null,
        })
        .select()
        .single();
      if (error) { console.log('reservationService.createFromPOS error:', error.message); return null; }

      if (data) {
        for (const item of input.items) {
          if (item.productId) {
            try { await supabase.rpc('deduct_stock_on_reservation', { p_product_id: item.productId, p_qty: item.qty }); } catch {}
          }
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
    const supabase = createClient();
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('reservations')
        .update({
          deposit_paid: input.depositPaid,
          deposit_payment_method: input.depositPaymentMethod,
          deposit_paid_at: new Date().toISOString(),
          deposit_accounting_date: today,
          reservation_status: 'deposit_paid',
        })
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('reservationService.recordDeposit error:', error.message); return null; }
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.recordDeposit exception:', e.message); return null; }
  },

  /**
   * Record balance payment — only the balance amount is counted in revenue for today.
   * This is separate from the deposit to avoid double counting.
   * Sets balance_accounting_date to today.
   */
  async recordBalance(id: string, input: RecordBalanceInput): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const today = new Date().toISOString().split('T')[0];

      const { data: existing } = await supabase
        .from('reservations')
        .select('items, reservation_status')
        .eq('id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('reservations')
        .update({
          balance_paid: input.balancePaid,
          balance_payment_method: input.balancePaymentMethod,
          balance_paid_at: new Date().toISOString(),
          balance_accounting_date: today,
          reservation_status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('reservationService.recordBalance error:', error.message); return null; }

      // Deduct stock for sold items (only if not already completed)
      if (existing && existing.reservation_status !== 'completed' && Array.isArray(existing.items)) {
        const stockItems = (existing.items as any[])
          .filter((item) => item.productId || item.product_id)
          .map((item) => ({
            productId: item.productId || item.product_id,
            name: item.name || item.productName || '',
            qty: Number(item.qty || item.quantity) || 1,
          }));
        if (stockItems.length > 0) {
          await deductStockForSale(stockItems, `RES-${id.slice(0, 8).toUpperCase()}`, 'reservation', 'Réservation', 'completed', 'reservation');
        }
      }

      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.recordBalance exception:', e.message); return null; }
  },

  async markReady(id: string): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('reservations')
        .update({ reservation_status: 'ready', ready_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('reservationService.markReady error:', error.message); return null; }
      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.markReady exception:', e.message); return null; }
  },

  async markCompleted(id: string): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const { data: existing } = await supabase
        .from('reservations')
        .select('items, reservation_status')
        .eq('id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('reservations')
        .update({ reservation_status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('reservationService.markCompleted error:', error.message); return null; }

      // Deduct stock for sold items (only if not already completed)
      if (existing && existing.reservation_status !== 'completed' && Array.isArray(existing.items)) {
        const stockItems = (existing.items as any[])
          .filter((item) => item.productId || item.product_id)
          .map((item) => ({
            productId: item.productId || item.product_id,
            name: item.name || item.productName || '',
            qty: Number(item.qty || item.quantity) || 1,
          }));
        if (stockItems.length > 0) {
          await deductStockForSale(stockItems, `RES-${id.slice(0, 8).toUpperCase()}`, 'reservation', 'Réservation', 'completed', 'reservation');
        }
      }

      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.markCompleted exception:', e.message); return null; }
  },

  async cancel(id: string, reason?: string): Promise<Reservation | null> {
    const supabase = createClient();
    try {
      const { data: existing } = await supabase
        .from('reservations')
        .select('items, reservation_status')
        .eq('id', id)
        .maybeSingle();

      const { data, error } = await supabase
        .from('reservations')
        .update({
          reservation_status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || null,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) { console.log('reservationService.cancel error:', error.message); return null; }

      if (existing && existing.reservation_status !== 'cancelled') {
        const items: ReservationItem[] = Array.isArray(existing.items) ? existing.items : [];
        for (const item of items) {
          if (item.productId) {
            try { await supabase.rpc('reinject_stock_on_cancel', { p_product_id: item.productId, p_qty: item.qty }); } catch {}
          }
        }
      }

      return data ? mapReservation(data) : null;
    } catch (e: any) { console.log('reservationService.cancel exception:', e.message); return null; }
  },

  async update(id: string, input: Partial<CreateReservationInput> & { items?: ReservationItem[] }): Promise<Reservation> {
    const supabase = createClient();
    try {
      const { data: existing } = await supabase
        .from('reservations')
        .select('items, total_amount')
        .eq('id', id)
        .maybeSingle();

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
      if (input.depositAmount !== undefined) updatePayload.deposit_amount = input.depositAmount;
      if (input.depositPercent !== undefined) updatePayload.deposit_percent = input.depositPercent ?? null;
      if (input.reservationType !== undefined) updatePayload.reservation_type = input.reservationType || null;
      if (input.recoveryMode !== undefined) updatePayload.recovery_mode = input.recoveryMode;
      if (input.deliveryAddress !== undefined) updatePayload.delivery_address = input.deliveryAddress || null;
      if (input.deliveryPhone !== undefined) updatePayload.delivery_phone = input.deliveryPhone || null;
      if (input.deliveryContact !== undefined) updatePayload.delivery_contact = input.deliveryContact || null;
      if (input.deliveryNotes !== undefined) updatePayload.delivery_notes = input.deliveryNotes || null;
      if (input.items !== undefined) {
        updatePayload.items = input.items;
        updatePayload.total_amount = input.items.reduce((s, it) => s + it.qty * it.price, 0);
      }

      const { data, error } = await supabase
        .from('reservations')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();
      if (error) {
        console.log('reservationService.update error:', error.message);
        throw new Error(error.message);
      }

      if (existing && input.items) {
        const oldItems: ReservationItem[] = Array.isArray(existing.items) ? existing.items : [];
        for (const item of oldItems) {
          if (item.productId) {
            try { await supabase.rpc('reinject_stock_on_cancel', { p_product_id: item.productId, p_qty: item.qty }); } catch {}
          }
        }
        for (const item of input.items) {
          if (item.productId) {
            try { await supabase.rpc('deduct_stock_on_reservation', { p_product_id: item.productId, p_qty: item.qty }); } catch {}
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
    const supabase = createClient();
    const empty: ReservationStats = {
      total: 0, pending: 0, depositPaid: 0, ready: 0, completed: 0, cancelled: 0,
      totalDepositsCollected: 0, totalAmountPending: 0, totalBalancesCollected: 0,
      totalRealRevenue: 0, pendingBalanceCount: 0, byType: {}, byRecovery: {},
    };
    try {
      const { data, error } = await supabase
        .from('reservations')
        .select('reservation_status, deposit_paid, balance_paid, total_amount, balance_due, reservation_type, recovery_mode');
      if (error) { return empty; }
      const rows = data ?? [];
      const activeRows = rows.filter((r) => r.reservation_status !== 'cancelled' && r.reservation_status !== 'completed');

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

      const nonCancelledRows = rows.filter((r) => r.reservation_status !== 'cancelled');
      const totalDepositsCollected = nonCancelledRows.reduce((sum, r) => sum + parseFloat(r.deposit_paid ?? 0), 0);
      const totalBalancesCollected = nonCancelledRows.reduce((sum, r) => sum + parseFloat(r.balance_paid ?? 0), 0);
      // Real revenue = deposits + balances (no double counting — each is recorded separately on different days)
      const totalRealRevenue = totalDepositsCollected + totalBalancesCollected;
      const pendingBalanceCount = activeRows.filter((r) => parseFloat(r.balance_due ?? 0) > 0).length;

      return {
        total: rows.length,
        pending: rows.filter((r) => r.reservation_status === 'pending').length,
        depositPaid: rows.filter((r) => r.reservation_status === 'deposit_paid').length,
        ready: rows.filter((r) => r.reservation_status === 'ready').length,
        completed: rows.filter((r) => r.reservation_status === 'completed').length,
        cancelled: rows.filter((r) => r.reservation_status === 'cancelled').length,
        totalDepositsCollected,
        totalAmountPending: activeRows.reduce((sum, r) => sum + parseFloat(r.balance_due ?? 0), 0),
        totalBalancesCollected,
        totalRealRevenue,
        pendingBalanceCount,
        byType,
        byRecovery,
      };
    } catch (e: any) { return empty; }
  },
};
