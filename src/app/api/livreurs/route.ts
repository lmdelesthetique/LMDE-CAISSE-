import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET /api/livreurs — list all drivers
export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .select('id, first_name, last_name, phone, pin_code, status, driver_status, notes, created_at')
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ drivers: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/livreurs — create a driver (service role bypasses RLS)
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: 'Corps JSON invalide' }, { status: 400 });

    const { firstName, lastName, phone, pinCode, notes } = body;
    if (!firstName || !lastName || !phone || !pinCode) {
      return NextResponse.json({ error: 'Champs requis : firstName, lastName, phone, pinCode' }, { status: 400 });
    }
    if (!/^\d{4}$/.test(String(pinCode))) {
      return NextResponse.json({ error: 'PIN doit être 4 chiffres' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        first_name: String(firstName).trim(),
        last_name: String(lastName).trim(),
        phone: String(phone).trim(),
        pin_code: String(pinCode),
        notes: notes ? String(notes).trim() : null,
        status: 'active',
        driver_status: 'off',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ driver: data }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
