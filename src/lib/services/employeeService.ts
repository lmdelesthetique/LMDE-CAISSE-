'use client';

import { createClient } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type EmployeeRole = 'admin' | 'manager' | 'cashier' | 'stock_manager' | 'sales_rep';
export type EmployeeStatus = 'active' | 'inactive' | 'on_leave' | 'terminated';

export interface EmployeePermissions {
  cashierAccess: boolean;
  stockAccess: boolean;
  suppliersAccess: boolean;
  productsAccess: boolean;
  statsAccess: boolean;
  discountAuth: boolean;
  cancelAuth: boolean;
  priceModify: boolean;
  adminAccess: boolean;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  role: EmployeeRole;
  status: EmployeeStatus;
  posPin: string | null;
  avatarInitials: string;
  hireDate: string | null;
  notes: string | null;
  permissions: EmployeePermissions;
  monthlyObjective: number;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeSale {
  id: string;
  employeeId: string;
  receiptNumber: string;
  totalTtc: number;
  discountAmount: number;
  itemsCount: number;
  paymentMethod: string | null;
  wasCancelled: boolean;
  clientId: string | null;
  soldAt: string;
  createdAt: string;
}

export interface EmployeeObjective {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  targetRevenue: number;
  targetTickets: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeStats {
  totalRevenue: number;
  totalTickets: number;
  avgBasket: number;
  totalCancellations: number;
  totalDiscounts: number;
  currentMonthRevenue: number;
  currentMonthTickets: number;
  objectiveProgress: number; // 0-100%
}

export interface CreateEmployeeInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role: EmployeeRole;
  status?: EmployeeStatus;
  posPin?: string;
  hireDate?: string;
  notes?: string;
  permissions: EmployeePermissions;
  monthlyObjective?: number;
}

export interface UpdateEmployeeInput extends Partial<CreateEmployeeInput> {
  id: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapEmployee(row: any): Employee {
  const fn = row.first_name ?? '';
  const ln = row.last_name ?? '';
  return {
    id: row.id,
    firstName: fn,
    lastName: ln,
    fullName: `${fn} ${ln}`.trim(),
    email: row.email ?? null,
    phone: row.phone ?? null,
    role: row.role,
    status: row.status,
    posPin: row.pos_pin ?? null,
    avatarInitials: row.avatar_initials ?? `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase(),
    hireDate: row.hire_date ?? null,
    notes: row.notes ?? null,
    permissions: {
      cashierAccess: row.perm_cashier_access ?? true,
      stockAccess: row.perm_stock_access ?? false,
      suppliersAccess: row.perm_suppliers_access ?? false,
      productsAccess: row.perm_products_access ?? false,
      statsAccess: row.perm_stats_access ?? false,
      discountAuth: row.perm_discount_auth ?? false,
      cancelAuth: row.perm_cancel_auth ?? false,
      priceModify: row.perm_price_modify ?? false,
      adminAccess: row.perm_admin_access ?? false,
    },
    monthlyObjective: parseFloat(row.monthly_objective ?? 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSale(row: any): EmployeeSale {
  return {
    id: row.id,
    employeeId: row.employee_id,
    receiptNumber: row.receipt_number,
    totalTtc: parseFloat(row.total_ttc ?? 0),
    discountAmount: parseFloat(row.discount_amount ?? 0),
    itemsCount: row.items_count ?? 0,
    paymentMethod: row.payment_method ?? null,
    wasCancelled: row.was_cancelled ?? false,
    clientId: row.client_id ?? null,
    soldAt: row.sold_at,
    createdAt: row.created_at,
  };
}

function mapObjective(row: any): EmployeeObjective {
  return {
    id: row.id,
    employeeId: row.employee_id,
    year: row.year,
    month: row.month,
    targetRevenue: parseFloat(row.target_revenue ?? 0),
    targetTickets: row.target_tickets ?? 0,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const employeeService = {
  async getAll(): Promise<Employee[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('first_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapEmployee);
  },

  async getById(id: string): Promise<Employee | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return mapEmployee(data);
  },

  async search(query: string): Promise<Employee[]> {
    const supabase = createClient();
    const q = `%${query}%`;
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q},phone.ilike.${q}`)
      .order('first_name', { ascending: true });
    if (error) throw error;
    return (data ?? []).map(mapEmployee);
  },

  async create(input: CreateEmployeeInput): Promise<Employee> {
    const supabase = createClient();
    const fn = input.firstName;
    const ln = input.lastName;
    const initials = `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
    const { data, error } = await supabase
      .from('employees')
      .insert({
        first_name: fn,
        last_name: ln,
        email: input.email ?? null,
        phone: input.phone ?? null,
        role: input.role,
        status: input.status ?? 'active',
        pos_pin: input.posPin ?? null,
        avatar_initials: initials,
        hire_date: input.hireDate ?? null,
        notes: input.notes ?? null,
        perm_cashier_access: input.permissions.cashierAccess,
        perm_stock_access: input.permissions.stockAccess,
        perm_suppliers_access: input.permissions.suppliersAccess,
        perm_products_access: input.permissions.productsAccess,
        perm_stats_access: input.permissions.statsAccess,
        perm_discount_auth: input.permissions.discountAuth,
        perm_cancel_auth: input.permissions.cancelAuth,
        perm_price_modify: input.permissions.priceModify,
        perm_admin_access: input.permissions.adminAccess,
        monthly_objective: input.monthlyObjective ?? 0,
      })
      .select()
      .single();
    if (error) throw error;
    return mapEmployee(data);
  },

  async update(input: UpdateEmployeeInput): Promise<Employee> {
    const supabase = createClient();
    const updates: any = {};
    if (input.firstName !== undefined) updates.first_name = input.firstName;
    if (input.lastName !== undefined) updates.last_name = input.lastName;
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.role !== undefined) updates.role = input.role;
    if (input.status !== undefined) updates.status = input.status;
    if (input.posPin !== undefined) updates.pos_pin = input.posPin;
    if (input.hireDate !== undefined) updates.hire_date = input.hireDate;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.monthlyObjective !== undefined) updates.monthly_objective = input.monthlyObjective;
    if (input.permissions) {
      updates.perm_cashier_access = input.permissions.cashierAccess;
      updates.perm_stock_access = input.permissions.stockAccess;
      updates.perm_suppliers_access = input.permissions.suppliersAccess;
      updates.perm_products_access = input.permissions.productsAccess;
      updates.perm_stats_access = input.permissions.statsAccess;
      updates.perm_discount_auth = input.permissions.discountAuth;
      updates.perm_cancel_auth = input.permissions.cancelAuth;
      updates.perm_price_modify = input.permissions.priceModify;
      updates.perm_admin_access = input.permissions.adminAccess;
    }
    if (input.firstName !== undefined || input.lastName !== undefined) {
      const fn = input.firstName ?? '';
      const ln = input.lastName ?? '';
      updates.avatar_initials = `${fn.charAt(0)}${ln.charAt(0)}`.toUpperCase();
    }
    const { data, error } = await supabase
      .from('employees')
      .update(updates)
      .eq('id', input.id)
      .select()
      .single();
    if (error) throw error;
    return mapEmployee(data);
  },

  async delete(id: string): Promise<void> {
    const supabase = createClient();
    const { error } = await supabase.from('employees').delete().eq('id', id);
    if (error) throw error;
  },

  async getSales(employeeId: string, from?: string, to?: string): Promise<EmployeeSale[]> {
    const supabase = createClient();
    let query = supabase
      .from('employee_sales')
      .select('*')
      .eq('employee_id', employeeId)
      .order('sold_at', { ascending: false });
    if (from) query = query.gte('sold_at', from);
    if (to) query = query.lte('sold_at', to);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(mapSale);
  },

  async getStats(employeeId: string, from?: string, to?: string): Promise<EmployeeStats> {
    const sales = await employeeService.getSales(employeeId, from, to);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;

    const activeSales = sales.filter((s) => !s.wasCancelled);
    const totalRevenue = activeSales.reduce((sum, s) => sum + s.totalTtc, 0);
    const totalTickets = activeSales.length;
    const avgBasket = totalTickets > 0 ? totalRevenue / totalTickets : 0;
    const totalCancellations = sales.filter((s) => s.wasCancelled).length;
    const totalDiscounts = sales.reduce((sum, s) => sum + s.discountAmount, 0);

    const monthSales = activeSales.filter((s) => s.soldAt >= monthStart);
    const currentMonthRevenue = monthSales.reduce((sum, s) => sum + s.totalTtc, 0);
    const currentMonthTickets = monthSales.length;

    // Get objective for current month
    const objective = await employeeService.getObjective(employeeId, currentYear, currentMonth);
    const target = objective?.targetRevenue ?? 0;
    const objectiveProgress = target > 0 ? Math.min(100, (currentMonthRevenue / target) * 100) : 0;

    return {
      totalRevenue,
      totalTickets,
      avgBasket,
      totalCancellations,
      totalDiscounts,
      currentMonthRevenue,
      currentMonthTickets,
      objectiveProgress,
    };
  },

  async getObjective(employeeId: string, year: number, month: number): Promise<EmployeeObjective | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employee_objectives')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .eq('month', month)
      .single();
    if (error) return null;
    return mapObjective(data);
  },

  async getAllObjectives(employeeId: string): Promise<EmployeeObjective[]> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employee_objectives')
      .select('*')
      .eq('employee_id', employeeId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapObjective);
  },

  async upsertObjective(input: {
    employeeId: string;
    year: number;
    month: number;
    targetRevenue: number;
    targetTickets: number;
    notes?: string;
  }): Promise<EmployeeObjective> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employee_objectives')
      .upsert(
        {
          employee_id: input.employeeId,
          year: input.year,
          month: input.month,
          target_revenue: input.targetRevenue,
          target_tickets: input.targetTickets,
          notes: input.notes ?? null,
        },
        { onConflict: 'employee_id,year,month' }
      )
      .select()
      .single();
    if (error) throw error;
    return mapObjective(data);
  },

  async verifyPin(pin: string): Promise<Employee | null> {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('pos_pin', pin)
      .eq('status', 'active')
      .single();
    if (error) return null;
    return mapEmployee(data);
  },
};

// ─── Constants ────────────────────────────────────────────────────────────────

export const ROLE_CONFIG: Record<EmployeeRole, { label: string; color: string; icon: string }> = {
  admin:         { label: 'Admin',          color: 'text-purple-700 bg-purple-50 border-purple-200',   icon: 'ShieldCheckIcon' },
  manager:       { label: 'Manager',        color: 'text-blue-700 bg-blue-50 border-blue-200',         icon: 'StarIcon' },
  cashier:       { label: 'Caissier(e)',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: 'ShoppingCartIcon' },
  stock_manager: { label: 'Resp. Stock',    color: 'text-amber-700 bg-amber-50 border-amber-200',      icon: 'ArchiveBoxIcon' },
  sales_rep:     { label: 'Commercial(e)',  color: 'text-indigo-700 bg-indigo-50 border-indigo-200',   icon: 'TagIcon' },
};

export const STATUS_CONFIG: Record<EmployeeStatus, { label: string; color: string; dot: string }> = {
  active:     { label: 'Actif',       color: 'text-emerald-700 bg-emerald-50 border-emerald-200', dot: 'bg-emerald-400' },
  inactive:   { label: 'Inactif',     color: 'text-slate-600 bg-slate-50 border-slate-200',       dot: 'bg-slate-400' },
  on_leave:   { label: 'En congé',    color: 'text-amber-700 bg-amber-50 border-amber-200',       dot: 'bg-amber-400' },
  terminated: { label: 'Terminé',     color: 'text-red-700 bg-red-50 border-red-200',             dot: 'bg-red-400' },
};

export const PERMISSION_LABELS: Record<keyof EmployeePermissions, { label: string; description: string; icon: string }> = {
  cashierAccess:   { label: 'Accès caisse',             description: 'Peut utiliser la caisse enregistreuse',          icon: 'ShoppingCartIcon' },
  stockAccess:     { label: 'Accès stock',              description: 'Peut consulter et modifier le stock',             icon: 'ArchiveBoxIcon' },
  suppliersAccess: { label: 'Accès fournisseurs',       description: 'Peut gérer les fournisseurs et commandes',        icon: 'TruckIcon' },
  productsAccess:  { label: 'Accès produits',           description: 'Peut créer et modifier les produits',             icon: 'TagIcon' },
  statsAccess:     { label: 'Accès statistiques',       description: 'Peut consulter les rapports et statistiques',     icon: 'ChartBarIcon' },
  discountAuth:    { label: 'Autorisation remises',     description: 'Peut appliquer des remises en caisse',            icon: 'ReceiptPercentIcon' },
  cancelAuth:      { label: 'Autorisation annulations', description: 'Peut annuler des ventes',                         icon: 'XCircleIcon' },
  priceModify:     { label: 'Modification prix',        description: 'Peut modifier les prix en caisse',                icon: 'PencilSquareIcon' },
  adminAccess:     { label: 'Accès administration',     description: 'Accès complet à toutes les fonctionnalités',      icon: 'ShieldCheckIcon' },
};

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<EmployeeRole, EmployeePermissions> = {
  admin: {
    cashierAccess: true, stockAccess: true, suppliersAccess: true, productsAccess: true,
    statsAccess: true, discountAuth: true, cancelAuth: true, priceModify: true, adminAccess: true,
  },
  manager: {
    cashierAccess: true, stockAccess: true, suppliersAccess: true, productsAccess: true,
    statsAccess: true, discountAuth: true, cancelAuth: true, priceModify: true, adminAccess: false,
  },
  cashier: {
    cashierAccess: true, stockAccess: false, suppliersAccess: false, productsAccess: false,
    statsAccess: false, discountAuth: true, cancelAuth: false, priceModify: false, adminAccess: false,
  },
  stock_manager: {
    cashierAccess: true, stockAccess: true, suppliersAccess: true, productsAccess: true,
    statsAccess: false, discountAuth: false, cancelAuth: false, priceModify: false, adminAccess: false,
  },
  sales_rep: {
    cashierAccess: true, stockAccess: false, suppliersAccess: false, productsAccess: false,
    statsAccess: true, discountAuth: true, cancelAuth: false, priceModify: true, adminAccess: false,
  },
};
