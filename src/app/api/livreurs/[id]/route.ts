import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// PATCH /api/livreurs/[id] — update driver (status toggle, edit details)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const updates: Record<string, unknown> = {};
    if (body.firstName  !== undefined) updates.first_name    = String(body.firstName).trim();
    if (body.lastName   !== undefined) updates.last_name     = String(body.lastName).trim();
    if (body.phone      !== undefined) updates.phone         = String(body.phone).trim();
    if (body.pinCode    !== undefined) updates.pin_code      = String(body.pinCode);
    if (body.notes      !== undefined) updates.notes         = body.notes ? String(body.notes).trim() : null;
    if (body.status     !== undefined) updates.status        = body.status;
    if (body.driverStatus !== undefined) updates.driver_status = body.driverStatus;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ driver: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/livreurs/[id] — remove driver
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
