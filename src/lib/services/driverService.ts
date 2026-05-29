'use client';

import { createClient } from '@/lib/supabase/client';

export interface Driver {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  pinCode: string;
  status: 'active' | 'inactive';
  driverStatus: 'on' | 'off';
  notes: string | null;
  createdAt: string;
  deliveriesCount?: number;
}

export interface CreateDriverInput {
  firstName: string;
  lastName: string;
  phone: string;
  pinCode: string;
  notes?: string;
}

export interface UpdateDriverInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  pinCode?: string;
  notes?: string;
  status?: 'active' | 'inactive';
}

function mapDriver(row: any): Driver {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    pinCode: row.pin_code,
    status: row.status ?? 'active',
    driverStatus: row.driver_status ?? 'off',
    notes: row.notes ?? null,
    createdAt: row.created_at,
  };
}

export const driverService = {
  async getAll(): Promise<Driver[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDriver);
  },

  async getAllWithDeliveryCounts(): Promise<Driver[]> {
    const supabase = createClient();
    const [{ data: drivers, error }, { data: counts }] = await Promise.all([
      supabase.from('drivers').select('*').order('created_at', { ascending: false }),
      supabase
        .from('deliveries')
        .select('assigned_to_driver')
        .not('status', 'eq', 'cancelled'),
    ]);
    if (error) throw error;

    const countMap: Record<string, number> = {};
    for (const row of counts ?? []) {
      if (row.assigned_to_driver) {
        countMap[row.assigned_to_driver] = (countMap[row.assigned_to_driver] ?? 0) + 1;
      }
    }

    return (drivers ?? []).map((row) => ({
      ...mapDriver(row),
      deliveriesCount: countMap[row.id] ?? 0,
    }));
  },

  async create(input: CreateDriverInput): Promise<Driver> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('drivers')
      .insert({
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        pin_code: input.pinCode,
        notes: input.notes ?? null,
        status: 'active',
        driver_status: 'off',
      })
      .select()
      .single();
    if (error) throw error;
    return mapDriver(data);
  },

  async update(id: string, input: UpdateDriverInput): Promise<Driver> {
    const supabase = createClient();
    const updates: any = {};
    if (input.firstName !== undefined) updates.first_name = input.firstName;
    if (input.lastName !== undefined)  updates.last_name = input.lastName;
    if (input.phone !== undefined)     updates.phone = input.phone;
    if (input.pinCode !== undefined)   updates.pin_code = input.pinCode;
    if (input.notes !== undefined)     updates.notes = input.notes;
    if (input.status !== undefined)    updates.status = input.status;
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return mapDriver(data);
  },

  async toggleStatus(id: string, current: 'active' | 'inactive'): Promise<void> {
    const supabase = createClient();
    await supabase
      .from('drivers')
      .update({ status: current === 'active' ? 'inactive' : 'active' })
      .eq('id', id);
  },

  async delete(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('drivers').delete().eq('id', id);
    if (error) throw error;
  },
};
