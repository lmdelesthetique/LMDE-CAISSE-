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
  const payeTotal = Number(devis.paye_total) || 0;
  const totalAmount = payeTotal > 0 ? Math.min(payeTotal, clientPays) : clientPays;
  const hasAmount = totalAmount > 0;

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

  // Only create receipt when there's money involved
  let receipt: { id: string; ticket_number: string } | null = null;
  if (hasAmount) {
    const { data: receiptData, error: receiptErr } = await supabase
      .from('receipts')
      .insert(receiptInsert)
      .select('id, ticket_number')
      .single();

    if (receiptErr) {
      console.error('[devis-pro receipt] insert error:', receiptErr.message);
    } else {
      receipt = receiptData;
      console.log('[devis-pro receipt] created', receipt.ticket_number, 'for devis', devis.numero);
      await supabase.from('devis_pro').update({ receipt_id: receipt.id }).eq('id', devisId).then(() => {});
    }
  }

  // Decrement stock for all real products — always, even for 0€ devis (items are physically given)
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

  if (devis.client_id) {
    const currentCredit = parseFloat(String(devis.client?.store_credit ?? 0));
    const currentSpent = parseFloat(String(devis.client?.total_spent ?? 0));
    const clientUpdates: any = { last_purchase_at: new Date().toISOString() };
    if (hasAmount) clientUpdates.total_spent = Math.round((currentSpent + totalAmount) * 100) / 100;
    if (avoirUsed > 0) clientUpdates.store_credit = Math.max(0, Math.round((currentCredit - avoirUsed) * 100) / 100);
    await supabase.from('clients').update(clientUpdates).eq('id', devis.client_id);
  }

  // If livraison: mark existing delivery as delivered, or create one for records
  if (devis.type_expedition === 'livraison' && devis.adresse_livraison) {
    const existingDeliveryId = (devis as any).delivery_id;
    if (existingDeliveryId) {
      await supabase.from('deliveries').update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        ...(receipt ? { receipt_id: receipt.id } : {}),
      }).eq('id', existingDeliveryId);
    } else {
      // Create a delivered record (shortcut flow — was marked livre directly)
      await supabase.from('deliveries').insert({
        client_name: clientName,
        client_phone: devis.client?.first_name ? null : null,
        delivery_address: devis.adresse_livraison,
        delivery_notes: devis.notes_preparation || null,
        products: items.filter((i: any) => !String(i.id || '').startsWith('custom-')).map((i: any) => ({
          name: i.name, qty: i.qty, sku: i.sku || '',
        })),
        total_amount: totalAmount,
        receipt_id: receipt?.id || null,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
      });
    }
  }
}

// Creates a pending delivery when devis is ready for livraison
async function createLivraisonPending(supabase: ReturnType<typeof createAdminClient>, devisId: string) {
  const { data: devis } = await supabase
    .from('devis_pro')
    .select(`*, client:clients(id, first_name, last_name, phone, whatsapp)`)
    .eq('id', devisId)
    .single();

  if (!devis || devis.type_expedition !== 'livraison' || !devis.adresse_livraison) return;

  // Check no delivery already exists for this devis
  const existingId = (devis as any).delivery_id;
  if (existingId) return;

  const items: any[] = Array.isArray(devis.items) ? devis.items : [];
  const clientName = devis.client
    ? `${devis.client.first_name || ''} ${devis.client.last_name || ''}`.trim()
    : null;
  const clientPhone = devis.client?.phone || devis.client?.whatsapp || null;

  const { data: delivery } = await supabase.from('deliveries').insert({
    client_name: clientName,
    client_phone: clientPhone,
    delivery_address: devis.adresse_livraison,
    delivery_notes: devis.notes_preparation || null,
    products: items.filter((i: any) => !String(i.id || '').startsWith('custom-')).map((i: any) => ({
      name: i.name, qty: i.qty, sku: i.sku || '',
    })),
    total_amount: Number(devis.client_pays) || 0,
    status: 'pending',
  }).select('id').single();

  if (delivery?.id) {
    // Save delivery_id back to devis (ignore if column missing)
    await supabase.from('devis_pro').update({ delivery_id: delivery.id }).eq('id', devisId).then(() => {});
    console.log('[devis-pro livraison] created pending delivery', delivery.id, 'for devis', devis.numero);
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

  const { data: current } = await supabase
    .from('devis_pro')
    .select('statut, type_expedition, adresse_livraison, delivery_id, client_id, paiements')
    .eq('id', id)
    .single();

  const allowed = [
    'items', 'discount_pct', 'credit', 'total_ttc', 'client_pays', 'free_shipping',
    'statut', 'type_expedition', 'adresse_livraison', 'notes', 'notes_preparation',
    'pdf_url', 'paiements', 'paye_total', 'delivery_id',
    'sent_at', 'validated_at', 'ready_at', 'delivered_at',
  ];

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  // Re-credit avoir to client balance if an avoir payment was removed or reduced
  if ('paiements' in body && current?.client_id) {
    const oldPaiements: any[] = Array.isArray(current.paiements) ? current.paiements : [];
    const newPaiements: any[] = Array.isArray(body.paiements) ? body.paiements : [];
    const oldAvoir = oldPaiements.filter((p: any) => p.method === 'avoir').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const newAvoir = newPaiements.filter((p: any) => p.method === 'avoir').reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    const toReCredit = oldAvoir - newAvoir;
    if (toReCredit > 0.005) {
      const { data: cl } = await supabase.from('clients').select('store_credit').eq('id', current.client_id).maybeSingle();
      if (cl) {
        const newCredit = Math.round((Number(cl.store_credit) + toReCredit) * 100) / 100;
        await supabase.from('clients').update({ store_credit: newCredit }).eq('id', current.client_id);
      }
    }
  }

  const { data, error } = await supabase.from('devis_pro').update(patch).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const wasAlreadyLivre = current?.statut === 'livre';
  const becomesLivre = body.statut === 'livre';
  if (!wasAlreadyLivre && becomesLivre) {
    try {
      await createReceiptFromDevis(supabase, id);
    } catch (e) {
      console.error('[devis-pro receipt] unexpected error:', e);
    }
    // Refetch to include receipt_id written by createReceiptFromDevis
    const { data: refreshed } = await supabase
      .from('devis_pro')
      .select(`*, client:clients(id, firstName:first_name, lastName:last_name, phone, whatsapp, clientType:client_type, address, city, country)`)
      .eq('id', id)
      .single();
    return NextResponse.json({ devis: refreshed ?? data });
  }

  const wasAlreadyPret = current?.statut === 'pret';
  const becomesPret = body.statut === 'pret';
  const typeExp = body.type_expedition ?? current?.type_expedition;
  const newAddr = body.adresse_livraison ?? current?.adresse_livraison;
  const hasNoDelivery = !current?.delivery_id;
  // Create pending delivery when status becomes 'pret' OR when the livraison address
  // is saved on a devis that is already 'pret' (address added after status was set)
  const isPretNowOrStaying = becomesPret || (wasAlreadyPret && !becomesLivre);
  if (typeExp === 'livraison' && newAddr && isPretNowOrStaying && hasNoDelivery) {
    createLivraisonPending(supabase, id).catch((e) =>
      console.error('[devis-pro livraison] unexpected error:', e)
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
