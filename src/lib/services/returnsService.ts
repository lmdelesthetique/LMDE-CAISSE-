'use client';

import { createClient } from '@/lib/supabase/client';

export type ReturnReason = 'defective' | 'wrong_product' | 'not_satisfied' | 'size_issue' | 'damaged_delivery' | 'other';
export type ReturnRefundType = 'refund_cash' | 'refund_card' | 'store_credit' | 'exchange';
export type ReturnStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type ProductCondition = 'good' | 'damaged' | 'unknown';
export type AvoirStatus = 'available' | 'partial' | 'used' | 'expired';

export interface ReturnRecord {
  id: string;
  avoirNumber: string;
  clientId: string | null;
  clientName?: string;
  productId: string | null;
  productName: string;
  productRef: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  reason: ReturnReason;
  reasonNotes: string | null;
  refundType: ReturnRefundType;
  returnStatus: ReturnStatus;
  productCondition: ProductCondition;
  returnToStock: boolean;
  isInternalLoss: boolean;
  lossAmount: number;
  avoirStatus: AvoirStatus;
  avoirUsedAmount: number;
  avoirExpiryDate: string | null;
  exchangeProductId: string | null;
  exchangeProductName: string | null;
  exchangePriceDiff: number;
  decision: string | null;
  stockUpdated: boolean;
  creditApplied: boolean;
  originalReceipt: string | null;
  processedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReturnInput {
  clientId?: string;
  productId?: string;
  productName: string;
  productRef?: string;
  quantity: number;
  unitPrice: number;
  reason: ReturnReason;
  reasonNotes?: string;
  refundType: ReturnRefundType;
  productCondition: ProductCondition;
  returnToStock: boolean;
  isInternalLoss?: boolean;
  exchangeProductId?: string;
  exchangeProductName?: string;
  exchangePriceDiff?: number;
  decision?: string;
  originalReceipt?: string;
  processedBy?: string;
}

export const RETURN_REASON_LABELS: Record<ReturnReason, string> = {
  defective: 'Produit défectueux',
  wrong_product: 'Mauvais produit',
  not_satisfied: 'Client non satisfait',
  size_issue: 'Problème de taille',
  damaged_delivery: 'Endommagé à la livraison',
  other: 'Autre raison',
};

export const RETURN_REFUND_TYPE_LABELS: Record<ReturnRefundType, string> = {
  refund_cash: 'Remboursement espèces',
  refund_card: 'Remboursement carte',
  store_credit: 'Avoir / Crédit client',
  exchange: 'Échange produit',
};

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
  completed: 'Terminé',
};

export const PRODUCT_CONDITION_LABELS: Record<ProductCondition, string> = {
  good: 'Bon état',
  damaged: 'Abîmé / Perte',
  unknown: 'État inconnu',
};

export const AVOIR_STATUS_LABELS: Record<AvoirStatus, string> = {
  available: 'Disponible',
  partial: 'Utilisé partiellement',
  used: 'Utilisé totalement',
  expired: 'Expiré',
};

function mapReturn(row: any): ReturnRecord {
  return {
    id: row.id,
    avoirNumber: row.avoir_number,
    clientId: row.client_id,
    clientName: row.clients ? `${row.clients.first_name} ${row.clients.last_name}` : undefined,
    productId: row.product_id,
    productName: row.product_name,
    productRef: row.product_ref,
    quantity: Number(row.quantity) || 1,
    unitPrice: parseFloat(row.unit_price) || 0,
    totalAmount: parseFloat(row.total_amount) || 0,
    reason: row.reason as ReturnReason,
    reasonNotes: row.reason_notes,
    refundType: row.refund_type as ReturnRefundType,
    returnStatus: row.return_status as ReturnStatus,
    productCondition: (row.product_condition || 'good') as ProductCondition,
    returnToStock: row.return_to_stock !== false,
    isInternalLoss: Boolean(row.is_internal_loss),
    lossAmount: parseFloat(row.loss_amount) || 0,
    avoirStatus: (row.avoir_status || 'available') as AvoirStatus,
    avoirUsedAmount: parseFloat(row.avoir_used_amount) || 0,
    avoirExpiryDate: row.avoir_expiry_date || null,
    exchangeProductId: row.exchange_product_id || null,
    exchangeProductName: row.exchange_product_name || null,
    exchangePriceDiff: parseFloat(row.exchange_price_diff) || 0,
    decision: row.decision || null,
    stockUpdated: Boolean(row.stock_updated),
    creditApplied: Boolean(row.credit_applied),
    originalReceipt: row.original_receipt,
    processedBy: row.processed_by || 'Admin',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const returnsService = {
  async getAll(): Promise<ReturnRecord[]> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('returns')
        .select('*, clients(first_name, last_name)')
        .order('created_at', { ascending: false });
      if (error) { console.error('returnsService.getAll', error.message); return []; }
      return (data ?? []).map(mapReturn);
    } catch (e: any) { console.error('returnsService.getAll exception', e.message); return []; }
  },

  async getById(id: string): Promise<ReturnRecord | null> {
    const supabase = createClient();
    try {
      const { data, error } = await supabase
        .from('returns')
        .select('*, clients(first_name, last_name)')
        .eq('id', id)
        .maybeSingle();
      if (error) { console.error('returnsService.getById', error.message); return null; }
      return data ? mapReturn(data) : null;
    } catch (e: any) { console.error('returnsService.getById exception', e.message); return null; }
  },

  async create(input: CreateReturnInput): Promise<ReturnRecord | null> {
    const supabase = createClient();
    try {
      const { data: avoirData, error: avoirError } = await supabase.rpc('generate_avoir_number');
      if (avoirError) { console.error('generate_avoir_number', avoirError.message); return null; }

      const totalAmount = input.quantity * input.unitPrice;
      const isLoss = input.productCondition === 'damaged' && !input.returnToStock;

      const { data, error } = await supabase
        .from('returns')
        .insert({
          avoir_number: avoirData as string,
          client_id: input.clientId || null,
          product_id: input.productId || null,
          product_name: input.productName,
          product_ref: input.productRef || null,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          total_amount: totalAmount,
          reason: input.reason,
          reason_notes: input.reasonNotes || null,
          refund_type: input.refundType,
          return_status: 'pending',
          product_condition: input.productCondition,
          return_to_stock: input.returnToStock,
          is_internal_loss: isLoss || Boolean(input.isInternalLoss),
          loss_amount: isLoss ? totalAmount : 0,
          avoir_status: input.refundType === 'store_credit' ? 'available' : 'available',
          exchange_product_id: input.exchangeProductId || null,
          exchange_product_name: input.exchangeProductName || null,
          exchange_price_diff: input.exchangePriceDiff || 0,
          decision: input.decision || null,
          stock_updated: false,
          credit_applied: false,
          original_receipt: input.originalReceipt || null,
          processed_by: input.processedBy || 'Admin',
        })
        .select('*, clients(first_name, last_name)')
        .single();

      if (error) { console.error('returnsService.create', error.message); return null; }
      return data ? mapReturn(data) : null;
    } catch (e: any) { console.error('returnsService.create exception', e.message); return null; }
  },

  async approve(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('returns')
        .update({ return_status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { console.error('returnsService.approve', error.message); return false; }
      return true;
    } catch (e: any) { console.error('returnsService.approve exception', e.message); return false; }
  },

  async reject(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from('returns')
        .update({ return_status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { console.error('returnsService.reject', error.message); return false; }
      return true;
    } catch (e: any) { console.error('returnsService.reject exception', e.message); return false; }
  },

  async updateStockAndComplete(
    returnId: string,
    productId: string,
    productName: string,
    currentStock: number,
    qty: number,
    clientId: string | null,
    refundType: ReturnRefundType,
    totalAmount: number,
    returnToStock: boolean = true,
    isInternalLoss: boolean = false,
    productCondition: ProductCondition = 'good'
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = createClient();
    try {
      let stockUpdated = false;

      // 1. Update stock only if product is in good condition and should return to stock
      if (returnToStock && productCondition !== 'damaged' && productId) {
        const newStock = currentStock + qty;
        const { error: stockError } = await supabase
          .from('products')
          .update({ stock: newStock, updated_at: new Date().toISOString() })
          .eq('id', productId);
        if (stockError) return { success: false, error: stockError.message };

        await supabase.from('stock_movements_log').insert({
          product_id: productId,
          product_name: productName,
          movement_type: 'entry',
          quantity_before: currentStock,
          quantity_after: newStock,
          quantity_change: qty,
          reason: 'Retour client — bon état',
          performed_by: 'Admin',
        });
        stockUpdated = true;
      } else if (isInternalLoss || productCondition === 'damaged') {
        // Log as internal loss — no stock increase
        await supabase.from('return_losses').insert({
          return_id: returnId,
          product_id: productId || null,
          product_name: productName,
          quantity: qty,
          total_loss: totalAmount,
          loss_reason: 'damaged_return',
          is_boutique_fault: isInternalLoss,
          recorded_by: 'Admin',
        }).select();
        stockUpdated = false;
      }

      // 2. Apply store credit if applicable
      let creditApplied = false;
      if (clientId && refundType === 'store_credit') {
        const { data: clientData } = await supabase
          .from('clients')
          .select('store_credit')
          .eq('id', clientId)
          .maybeSingle();

        if (clientData) {
          const newCredit = parseFloat(clientData.store_credit || 0) + totalAmount;
          await supabase
            .from('clients')
            .update({ store_credit: newCredit, updated_at: new Date().toISOString() })
            .eq('id', clientId);
          creditApplied = true;
        }
      }

      // 3. Mark return as completed
      const { error: returnError } = await supabase
        .from('returns')
        .update({
          return_status: 'completed',
          stock_updated: stockUpdated,
          credit_applied: creditApplied,
          avoir_status: refundType === 'store_credit' && creditApplied ? 'available' : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', returnId);

      if (returnError) return { success: false, error: returnError.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async useAvoir(returnId: string, amountUsed: number, totalAmount: number): Promise<boolean> {
    const supabase = createClient();
    try {
      const { data: ret } = await supabase.from('returns').select('avoir_used_amount').eq('id', returnId).maybeSingle();
      if (!ret) return false;
      const newUsed = (parseFloat(ret.avoir_used_amount) || 0) + amountUsed;
      const newStatus: AvoirStatus = newUsed >= totalAmount ? 'used' : 'partial';
      const { error } = await supabase.from('returns').update({
        avoir_used_amount: newUsed,
        avoir_status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', returnId);
      return !error;
    } catch { return false; }
  },

  async getLosses(): Promise<any[]> {
    const supabase = createClient();
    try {
      const { data } = await supabase.from('return_losses').select('*').order('created_at', { ascending: false });
      return data || [];
    } catch { return []; }
  },

  async getDashboardStats(): Promise<{
    totalReturns: number;
    goodCondition: number;
    damaged: number;
    internalLosses: number;
    totalAvoirAmount: number;
    reintegratedStock: number;
    lostProducts: number;
    totalLossAmount: number;
  }> {
    const supabase = createClient();
    try {
      const { data } = await supabase.from('returns').select('*');
      const all = data || [];
      return {
        totalReturns: all.length,
        goodCondition: all.filter(r => r.product_condition === 'good').length,
        damaged: all.filter(r => r.product_condition === 'damaged').length,
        internalLosses: all.filter(r => r.is_internal_loss).length,
        totalAvoirAmount: all.filter(r => r.refund_type === 'store_credit').reduce((s: number, r: any) => s + parseFloat(r.total_amount || 0), 0),
        reintegratedStock: all.filter(r => r.stock_updated).reduce((s: number, r: any) => s + (r.quantity || 0), 0),
        lostProducts: all.filter(r => r.is_internal_loss || r.product_condition === 'damaged').reduce((s: number, r: any) => s + (r.quantity || 0), 0),
        totalLossAmount: all.filter(r => r.is_internal_loss).reduce((s: number, r: any) => s + parseFloat(r.loss_amount || 0), 0),
      };
    } catch { return { totalReturns: 0, goodCondition: 0, damaged: 0, internalLosses: 0, totalAvoirAmount: 0, reintegratedStock: 0, lostProducts: 0, totalLossAmount: 0 }; }
  },

  async delete(id: string): Promise<boolean> {
    const supabase = createClient();
    try {
      const { error } = await supabase.from('returns').delete().eq('id', id);
      if (error) { console.error('returnsService.delete', error.message); return false; }
      return true;
    } catch (e: any) { console.error('returnsService.delete exception', e.message); return false; }
  },
};
