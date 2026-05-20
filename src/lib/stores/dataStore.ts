'use client';

/**
 * Centralized in-memory store for categories and suppliers.
 * Provides a single source of truth that all modules subscribe to.
 */

import { createClient } from '@/lib/supabase/client';
import { Category } from '@/lib/services/categoryService';
import { Supplier } from '@/lib/services/supplierService';

const supabase = createClient();

type Listener = () => void;

// ─── Category Store ──────────────────────────────────────────────────────────

let _categories: Category[] = [];
let _categoriesLoaded = false;
const _categoryListeners = new Set<Listener>();

export const categoryStore = {
  getAll(): Category[] { return _categories; },

  subscribe(fn: Listener): () => void {
    _categoryListeners.add(fn);
    return () => _categoryListeners.delete(fn);
  },

  notify() { _categoryListeners.forEach((fn) => fn()); },

  async load(force = false): Promise<Category[]> {
    if (_categoriesLoaded && !force) return _categories;
    const { data } = await supabase.from('categories').select('*').order('sort_order');
    _categories = data || [];
    _categoriesLoaded = true;
    categoryStore.notify();
    return _categories;
  },

  /** Ensure a category exists by name; creates it if missing. Returns the category. */
  async ensureByName(name: string): Promise<Category | null> {
    if (!name?.trim()) return null;
    await categoryStore.load();
    const existing = _categories.find((c) => c.name.toLowerCase() === name.toLowerCase().trim());
    if (existing) return existing;
    // Create it
    const { data, error } = await supabase
      .from('categories')
      .insert([{ name: name.trim(), description: '', color: '#8B5CF6', icon: 'TagIcon', is_active: true, sort_order: _categories.length + 1, updated_at: new Date().toISOString() }])
      .select()
      .single();
    if (error || !data) return null;
    _categories = [..._categories, data];
    categoryStore.notify();
    return data;
  },

  /** Update category name and propagate to all products */
  async rename(id: string, newName: string): Promise<void> {
    const { error } = await supabase
      .from('categories')
      .update({ name: newName, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
    // DB trigger handles product sync; reload store
    await categoryStore.load(true);
  },

  invalidate() { _categoriesLoaded = false; },
};

// ─── Supplier Store ──────────────────────────────────────────────────────────

let _suppliers: Supplier[] = [];
let _suppliersLoaded = false;
const _supplierListeners = new Set<Listener>();

function mapRow(row: any): Supplier {
  return {
    id: row.id,
    companyName: row.company_name,
    contactName: row.contact_name,
    logoUrl: row.logo_url,
    email: row.email,
    phone: row.phone,
    whatsapp: row.whatsapp,
    wechat: row.wechat,
    address: row.address,
    country: row.country || '',
    language: row.language || 'fr',
    website: row.website,
    alibabaLink: row.alibaba_link,
    categories: row.categories || [],
    bankDetails: row.bank_details,
    paymentConditions: row.payment_conditions,
    productionDelayDays: row.production_delay_days || 0,
    shippingDelayDays: row.shipping_delay_days || 0,
    minimumOrder: row.minimum_order,
    notes: row.notes,
    reliability: row.reliability || 'unknown',
    lastContactAt: row.last_contact_at,
    lastOrderAt: row.last_order_at,
    isActive: row.is_active ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    portalLogin: row.portal_login,
    portalPasswordPlain: row.portal_password_plain,
    portalUserId: row.portal_user_id,
  };
}

export const supplierStore = {
  getAll(): Supplier[] { return _suppliers; },

  subscribe(fn: Listener): () => void {
    _supplierListeners.add(fn);
    return () => _supplierListeners.delete(fn);
  },

  notify() { _supplierListeners.forEach((fn) => fn()); },

  async load(force = false): Promise<Supplier[]> {
    if (_suppliersLoaded && !force) return _suppliers;
    const { data } = await supabase.from('suppliers').select('*').order('company_name');
    _suppliers = (data || []).map(mapRow);
    _suppliersLoaded = true;
    supplierStore.notify();
    return _suppliers;
  },

  getById(id: string): Supplier | undefined {
    return _suppliers.find((s) => s.id === id);
  },

  invalidate() { _suppliersLoaded = false; },
};
