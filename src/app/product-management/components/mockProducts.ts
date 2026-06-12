export interface ProductRecord {
  id: string;
  ref: string;
  barcode: string;
  name: string;
  category: string;
  supplier: string;
  supplierId?: string;
  buyPrice: number;
  transport: number;
  customs: number;
  otherFees?: number;
  structurePct?: number;
  costPrice: number;
  sellPriceHT: number;
  sellPriceTTC: number;
  marginAmount: number;
  marginPct: number;
  stock: number;
  minStock: number;
  status: 'active' | 'inactive' | 'rupture' | 'coming_soon';
  shopify: boolean;
  shopifyError?: boolean;
  variants: boolean;
  imageUrl?: string;
  colorVariants?: ColorVariant[];
  isKit?: boolean;
  isFavorite?: boolean;
  variantName?: string;
  description?: string;
}

export interface ColorVariant {
  id: string;
  colorName: string;
  colorHex: string;
  quantity: number;
  minStock: number;
}

// Legacy mock data kept for reference only — ProductManagementContent now loads from Supabase
export const mockProducts: ProductRecord[] = [];
export const categories: string[] = ['Tous'];
export const suppliers: string[] = ['Tous'];
export const statusOptions: string[] = ['Tous', 'Actif', 'Inactif', 'Rupture', 'Bientôt dispo'];