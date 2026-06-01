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
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) { console.error('returnsService.create API error:', data.error); return null; }
      return mapReturn(data);
    } catch (e: any) { console.error('returnsService.create exception', e.message); return null; }
  },

  async approve(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_status: 'approved' }),
      });
      return res.ok;
    } catch { return false; }
  },

  async reject(id: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/returns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_status: 'rejected' }),
      });
      return res.ok;
    } catch { return false; }
  },

  async updateStockAndComplete(
    returnId: string,
    _productId: string,
    _productName: string,
    _currentStock: number,
    _qty: number,
    _clientId: string | null,
    _refundType: ReturnRefundType,
    _totalAmount: number,
    _returnToStock: boolean = true,
    _isInternalLoss: boolean = false,
    _productCondition: ProductCondition = 'good'
  ): Promise<{ success: boolean; error?: string }> {
    // Stock + credit updates are now handled atomically in POST /api/returns at creation time.
    // This method just marks the return as completed via the API.
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_status: 'completed' }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        return { success: false, error: d.error ?? 'Erreur API' };
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async useAvoir(returnId: string, amountUsed: number, totalAmount: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/returns/${returnId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avoir_used_amount_delta: amountUsed, total_amount_ref: totalAmount }),
      });
      return res.ok;
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
    try {
      const res = await fetch(`/api/returns/${id}`, { method: 'DELETE' });
      if (!res.ok) { console.error('returnsService.delete', await res.text()); return false; }
      return true;
    } catch (e: any) { console.error('returnsService.delete exception', e.message); return false; }
  },
};
