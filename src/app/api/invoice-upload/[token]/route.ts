import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyInvoiceToken } from '@/lib/utils/invoiceToken';

function admin() {
  return createAdminClient();
}

// GET — return order info for the public deposit page
export async function GET(
  _req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const supabase = admin();

  // 1. Try deterministic token (no migration needed)
  const orderId = await verifyInvoiceToken(token);
  if (orderId) {
    const { data: order } = await supabase
      .from('fo_orders')
      .select('id, order_number, suppliers(company_name)')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 });

    // Check if invoice already received (column may or may not exist)
    let alreadyReceived = false;
    try {
      const { data: inv } = await supabase
        .from('fo_orders')
        .select('invoice_received_at')
        .eq('id', orderId)
        .maybeSingle();
      alreadyReceived = !!inv?.invoice_received_at;
    } catch { /* column not yet migrated */ }

    return NextResponse.json({
      orderNumber: order.order_number,
      supplierName: (order.suppliers as any)?.company_name ?? null,
      alreadyReceived,
    });
  }

  // 2. Fallback: look up by stored token (migration applied)
  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, invoice_received_at, suppliers(company_name)')
    .eq('invoice_upload_token', token)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 });

  return NextResponse.json({
    orderNumber: order.order_number,
    supplierName: (order.suppliers as any)?.company_name ?? null,
    alreadyReceived: !!order.invoice_received_at,
  });
}

// POST — receive PDF, upload to storage, update order
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  const supabase = admin();

  // Resolve order ID from token (deterministic or stored)
  let orderId: string | null = null;
  let orderNumber: string | null = null;

  const decodedId = await verifyInvoiceToken(token);
  if (decodedId) {
    const { data: o } = await supabase
      .from('fo_orders')
      .select('id, order_number')
      .eq('id', decodedId)
      .maybeSingle();
    if (o) { orderId = o.id; orderNumber = o.order_number; }
  }

  if (!orderId) {
    // Fallback: stored token column
    const { data: o } = await supabase
      .from('fo_orders')
      .select('id, order_number')
      .eq('invoice_upload_token', token)
      .maybeSingle();
    if (o) { orderId = o.id; orderNumber = o.order_number; }
  }

  if (!orderId) return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
  }

  const file = formData.get('invoice') as File | null;
  if (!file) return NextResponse.json({ error: 'Aucun fichier reçu' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
  if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext)) {
    return NextResponse.json({ error: 'Format non accepté (PDF uniquement)' }, { status: 400 });
  }

  const path = `${orderId}/${Date.now()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  // Ensure bucket exists (idempotent)
  await supabase.storage.createBucket('supplier-invoices', { public: false }).catch(() => {});

  // Remove old invoice if column exists
  try {
    const { data: existing } = await supabase
      .from('fo_orders')
      .select('supplier_invoice_path')
      .eq('id', orderId)
      .single();
    if (existing?.supplier_invoice_path) {
      await supabase.storage.from('supplier-invoices').remove([existing.supplier_invoice_path]);
    }
  } catch { /* column not yet migrated */ }

  const { data: uploaded, error: uploadError } = await supabase.storage
    .from('supplier-invoices')
    .upload(path, buffer, { contentType: file.type || 'application/pdf', upsert: true });

  if (uploadError) {
    console.error('[invoice-upload] storage error:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Generate a long-lived signed URL (10 years)
  const { data: signedData } = await supabase.storage
    .from('supplier-invoices')
    .createSignedUrl(uploaded.path, 60 * 60 * 24 * 365 * 10);

  // Update order — best effort (columns may not exist if migration pending)
  const updatePayload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  // Try with full columns (migration applied)
  const { error: dbError } = await supabase
    .from('fo_orders')
    .update({
      ...updatePayload,
      supplier_invoice_path: uploaded.path,
      supplier_invoice_url: signedData?.signedUrl ?? null,
      invoice_received_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (dbError) {
    // Migration not applied yet — update only updated_at (file is already in storage)
    await supabase
      .from('fo_orders')
      .update(updatePayload)
      .eq('id', orderId);
    console.warn('[invoice-upload] columns missing — apply migration for full functionality. File saved at:', uploaded.path);
  }

  console.log(`[invoice-upload] ✅ Invoice received for ${orderNumber}`);
  return NextResponse.json({ ok: true, orderNumber });
}
