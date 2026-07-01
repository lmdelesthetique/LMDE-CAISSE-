import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number, supplier_invoice_url, invoice_received_at, suppliers(company_name)')
    .eq('invoice_upload_token', token)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 });
  }

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

  const { data: order } = await supabase
    .from('fo_orders')
    .select('id, order_number')
    .eq('invoice_upload_token', token)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: 'Lien invalide ou expiré' }, { status: 404 });
  }

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

  const path = `${order.id}/${Date.now()}.${ext}`;
  const buffer = new Uint8Array(await file.arrayBuffer());

  // Ensure bucket exists (idempotent)
  await supabase.storage.createBucket('supplier-invoices', { public: false }).catch(() => {});

  // Remove old invoice if any
  const { data: existing } = await supabase
    .from('fo_orders')
    .select('supplier_invoice_path')
    .eq('id', order.id)
    .single();
  if (existing?.supplier_invoice_path) {
    await supabase.storage.from('supplier-invoices').remove([existing.supplier_invoice_path]);
  }

  const { data: uploaded, error: uploadError } = await supabase.storage
    .from('supplier-invoices')
    .upload(path, buffer, { contentType: file.type || 'application/pdf', upsert: true });

  if (uploadError) {
    console.error('[invoice-upload] storage error:', uploadError.message);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Generate a long-lived signed URL (10 years = for practical use)
  const { data: signedData } = await supabase.storage
    .from('supplier-invoices')
    .createSignedUrl(uploaded.path, 60 * 60 * 24 * 365 * 10);

  const { error: dbError } = await supabase
    .from('fo_orders')
    .update({
      supplier_invoice_path: uploaded.path,
      supplier_invoice_url: signedData?.signedUrl ?? null,
      invoice_received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);

  if (dbError) {
    console.error('[invoice-upload] db error:', dbError.message);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  console.log(`[invoice-upload] ✅ Invoice received for ${order.order_number}`);
  return NextResponse.json({ ok: true, orderNumber: order.order_number });
}
