import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/suppliers/[id]/stats
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [ordersRes, paymentsRes, claimsRes] = await Promise.all([
    supabase.from('fo_orders').select('total_real_cost, order_status').eq('supplier_id', id),
    supabase.from('supplier_payments').select('amount, payment_status').eq('supplier_id', id),
    supabase.from('supplier_claims').select('estimated_loss, claim_status').eq('supplier_id', id),
  ]);

  const orders = ordersRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const claims = claimsRes.data ?? [];

  const ACTIVE_STATUSES = ['sent','awaiting_validation','validated','awaiting_payment','payment_sent',
    'payment_confirmed','in_production','ready_to_ship','shipped','partially_received'];

  return NextResponse.json({
    totalOrders: orders.length,
    totalSpent: payments.filter(p => p.payment_status === 'confirmed').reduce((s, p) => s + Number(p.amount), 0),
    totalClaims: claims.length,
    totalRefunded: claims.filter(c => c.claim_status === 'refund_received').reduce((s, c) => s + Number(c.estimated_loss), 0),
    activeOrders: orders.filter(o => ACTIVE_STATUSES.includes(o.order_status)).length,
  });
}
