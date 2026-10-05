'use client';

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
    const res = await fetch('/api/deliveries/drivers?all=true&full=true');
    if (!res.ok) throw new Error('Failed to fetch drivers');
    const data = await res.json();
    return (Array.isArray(data) ? data : []).map(mapDriver);
  },

  async getAllWithDeliveryCounts(): Promise<Driver[]> {
    const [driversRes, deliveriesRes] = await Promise.all([
      fetch('/api/deliveries/drivers?all=true&full=true'),
      fetch('/api/deliveries'),
    ]);

    const driversData = driversRes.ok ? await driversRes.json() : [];
    const deliveriesData = deliveriesRes.ok ? await deliveriesRes.json() : [];

    const countMap: Record<string, number> = {};
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : (deliveriesData?.deliveries ?? []);
    for (const row of deliveries) {
      if (row.assigned_to_driver && row.status !== 'cancelled') {
        countMap[row.assigned_to_driver] = (countMap[row.assigned_to_driver] ?? 0) + 1;
      }
    }

    return (Array.isArray(driversData) ? driversData : []).map((r: any) => ({
      ...mapDriver(r),
      deliveriesCount: countMap[r.id] ?? 0,
    }));
  },

  async create(input: CreateDriverInput): Promise<Driver> {
    const res = await fetch('/api/deliveries/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        pin_code: input.pinCode,
        notes: input.notes ?? null,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed to create driver');
    }
    return mapDriver(await res.json());
  },

  async update(id: string, input: UpdateDriverInput): Promise<Driver> {
    const body: any = {};
    if (input.firstName !== undefined) body.first_name = input.firstName;
    if (input.lastName !== undefined)  body.last_name = input.lastName;
    if (input.phone !== undefined)     body.phone = input.phone;
    if (input.pinCode !== undefined)   body.pin_code = input.pinCode;
    if (input.notes !== undefined)     body.notes = input.notes;
    if (input.status !== undefined)    body.status = input.status;
    const res = await fetch(`/api/deliveries/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed to update driver');
    }
    return mapDriver(await res.json());
  },

  async toggleStatus(id: string, current: 'active' | 'inactive'): Promise<void> {
    await fetch(`/api/deliveries/drivers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: current === 'active' ? 'inactive' : 'active' }),
    });
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`/api/deliveries/drivers/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? 'Failed to delete driver');
    }
  },
};
