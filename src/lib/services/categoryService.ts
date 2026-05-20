import { createClient } from '@/lib/supabase/client';

export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // computed stats (from products)
  productCount?: number;
  totalStock?: number;
  avgMarginPct?: number;
  totalRevenue?: number;
}

export interface CategoryFormData {
  name: string;
  description: string;
  color: string;
  icon: string;
  image_url?: string;
  is_active: boolean;
  sort_order: number;
}

const supabase = createClient();

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createCategory(form: CategoryFormData): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert([{ ...form, updated_at: new Date().toISOString() }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, form: Partial<CategoryFormData>): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .update({ ...form, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}
