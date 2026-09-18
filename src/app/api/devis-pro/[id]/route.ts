import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

type Ctx = { params: Promise<{ id: string }> };

function generateTicketNumber(): string {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TKT-${yy}${mm}${dd}-${rand}`;
}

// Creates a receipt + decrements stock when a devis is delivered
async function createReceiptFromDevis(supabase: ReturnType<typeof createAdminClient>, devisId: string) {
  const { data: devis, error: fetchErr } = await supabase
    .from('devis_pro')
    .select(`*, client:clients(id, first_name, last_name, store_credit, total_spent)`)
    .eq('id', devisId)
    .single();

  if (fetchErr || !devis) {
    console.error('[devis-pro receipt] fetch error:', fetchErr?.message);
    return;
  }

  const items: any[] = Array.isArray(devis.items) ? devis.items : [];
  const paiements: any[] = Array.isArray(devis.paiements) ? devis.paiements : [];

  const clientPays = Number(devis.client_pays) || Number(devis.total_ttc) || 0;
  // Use what was actually paid, capped at what's owed — never inflate CA with unpaid amounts
  const payeTotal = Number(devis.paye_total) || 0;
  const totalAmount = payeTotal > 0 ? Math.min(payeTotal, clientPays) : clientPays;
  if (totalAmount <= 0) return;

  // Avoir (store credit) used — must be deducted from client balance
  const avoirUsed = paiements
    .filter((p: any) => p.method === 'avoir')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

  // Build payment_method in POS-compatible format for correct cash counting
  // POS cash format: 'especes' or 'Mixte|<autres_total>|<especes_total>'
  const especesTotal = paiements
    .filter((p: any) => p.method === 'especes')
    .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
  const nonEspecesTotal = Math.max(0, totalAmount - especesTotal);

  let paymentMethod: string;
  if (especesTotal > 0 && nonEspecesTotal > 0) {
    paymentMethod = `Mixte|${nonEspecesTotal.toFixed(2)}|${especesTotal.toFixed(2)}`;
  } else if (especesTotal > 0) {
    paymentMethod = 'especes';
  } else {
    const uniqueMethods = [...new Set(paiements.map((p: any) => p.method).filter(Boolean))];
    const m = uniqueMethods[0] || 'virement';
    paymentMethod = m === 'carte' ? 'CB' : m === 'sumup' ? 'SumUp' : m === 'avoir' ? 'store_credit' : m === 'virement' ? 'transfer' : m;
  }

  const clientName = devis.client
    ? `${devis.client.first_name || ''} ${devis.client.last_name || ''}`.trim()
    : null;

  const receiptItems = items.map((item: any) => {
    const isCustom = String(item.id || '').startsWith('custom-');
    return {
      product_id: isCustom ? null : (item.productId ?? item.id),
      name: item.name || item.label || 'Article',
      sku: item.sku || '',
      price: Number(item.price) || 0,
      qty: Number(item.qty) || 1,
      quantity: Number(item.qty) || 1,
      discount: Number(item.discount) || 0,
      discount_type: item.discountType || item.discount_type || 'percent',
      tva: Number(item.tva) || 0.085,
      is_free_price: false,
      image_url: item.imageUrl || item.image_url || null,
      total: Math.max(0, (Number(item.price) || 0) * (Number(item.qty) || 1)),
    };
  });

  const totalTTC = totalAmount;
  const totalHT = Math.round((totalTTC / 1.085) * 100) / 100;
  const totalTVA = Math.round((totalTTC - totalHT) * 100) / 100;
  const discountPct = Number(devis.discount_pct) || 0;
  const discountAmount = discountPct > 0
    ? Math.round((Number(devis.total_ttc) * discountPct / 100) * 100) / 100
    : 0;

  const ticketNumber = generateTicketNumber();

  const receiptInsert: any = {
    ticket_number: ticketNumber,
    items: receiptItems,
    items_count: receiptItems.length,
    subtotal_ht: totalHT,
    total_tva: totalTVA,
    total_amount: totalAmount,
    discount_amount: discountAmount,
    payment_method: paymentMethod,
    payment_type: 'sale',
    client_id: devis.client_id || null,
    client_name: clientName,
    cashier_name: 'Devis Pro',
    notes: `Devis ${devis.numero || devisId}`,
    status: 'completed',
  };
  if (avoirUsed > 0) receiptInsert.store_credit_used = avoirUsed;

  const { data: receipt, error: receiptErr } = await supabase
    .from('receipts')
    .insert(receiptInsert)
    .select('id, ticket_number')
    .single();

  if (receiptErr) {
    console.error('[devis-pro receipt] insert error:', receiptErr.message);
    return;
  }

  console.log('[devis-pro receipt] created', receipt.ticket_number, 'for devis', devis.numero);

  await supabase.from('devis_pro').update({ receipt_id: receipt.id }).eq('id', devisId).then(() => {});

  // Decrement stock for all real products (including bonus items — they're physically given)
  for (const item of items) {
    const isCustom = String(item.id || '').startsWith('custom-');
    if (isCustom) continue;

    const productId = item.productId ?? item.id;
    if (!productId) continue;

    const qty = Number(item.qty) || 1;

    const { data: product } = await supabase
      .from('products')
      .select('id, name, stock')
      .eq('id', productId)
      .maybeSingle();

    if (!product) continue;

    const stockBefore = Number(product.stock) || 0;
    const stockAfter = Math.max(0, stockBefore - qty);

    await supabase.from('products').update({ stock: stockAfter }).eq('id', productId);

    await supabase.from('stock_movements_log').insert({
      product_id: productId,
      product_name: product.name,
      movement_type: 'sale',
      quantity_before: stockBefore,
      quantity_after: stockAfter,
      quantity_change: -qty,
      reason: `Vente devis ${devis.numero || devisId}`,
      performed_by: 'Devis Pro',
      source: 'devis_pro',
    });
  }

  // Update client stats: last_purchase_at, total_spent, store_credit (if avoir used)
  if (devis.client_id) {
    const currentCredit = parseFloat(String(devis.client?.store_credit ?? 0));
    const currentSpent = parseFloat(String(devis.client?.total_spent ?? 0));
    const clientUpdates: any = {
      last_purchase_at: new Date().toISOString(),
      total_spent: Math.round((currentSpent + totalAmount) * 100) / 100,
    };
    if (avoirUsed > 0) {
      clientUpdates.store_credit = Math.max(0, Math.round((currentCredit - avoirUsed) * 100) / 100);
    }
    await supabase.from('clients').update(clientUpdates).eq('id', devis.client_id);
  }
}

// GET /api/devis-pro/[id]
export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('devis_pro')
    .select(`*, client:clients(id, firstName:first_name, lastName:last_name, phone, whatsapp, clientType:client_type, address, city, country)`)
    .eq('id', id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ devis: data });
}

// PATCH /api/devis-pro/[id]
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const supabase = createAdminClient();

  // Read current statut before update — used to detect the 'livre' transition
  const { data: current } = await supabase
    .from('devis_pro')
    .select('statut')
    .eq('id', id)
    .single();

  const allowed = [
    'items', 'discount_pct', 'credit', 'total_ttc', 'client_pays', 'free_shipping',
    'statut', 'type_expedition', 'adresse_livraison', 'notes', 'notes_preparation',
    'pdf_url', 'paiements', 'paye_total',
    'sent_at', 'validated_at', 'ready_at', 'delivered_at',
  ];

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  const { data, error } = await supabase.from('devis_pro').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Trigger receipt + stock decrement when transitioning to 'livre'
  const wasAlreadyLivre = current?.statut === 'livre';
  const becomesLivre = body.statut === 'livre';
  if (!wasAlreadyLivre && becomesLivre) {
    // Run async — don't block the PATCH response
    createReceiptFromDevis(supabase, id).catch((e) =>
      console.error('[devis-pro receipt] unexpected error:', e)
    );
  }

  return NextResponse.json({ devis: data });
}

// DELETE /api/devis-pro/[id]
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from('devis_pro').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
