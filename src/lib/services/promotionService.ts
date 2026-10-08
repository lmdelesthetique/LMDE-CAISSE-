'use client';

export interface ActivePromo {
  id: string;
  name: string;
  type: 'discount' | 'bundle' | 'bogo';
  discountType: 'percent' | 'amount' | null;
  discountValue: number | null;
  products: { product_id: string; name: string; qty: number; unit_price: number }[];
  bundlePrice: number | null;
  productIds: string[];
}

export async function fetchActivePromotions(): Promise<ActivePromo[]> {
  try {
    const res = await fetch('/api/promotions');
    if (!res.ok) return [];
    const data: any[] = await res.json();

    const now = new Date();
    return data
      .filter((p) => {
        if (!p.is_active) return false;
        if (p.starts_at && new Date(p.starts_at) > now) return false;
        if (p.ends_at && new Date(p.ends_at) < now) return false;
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type as 'discount' | 'bundle' | 'bogo',
        discountType: p.discount_type as 'percent' | 'amount' | null,
        discountValue: p.discount_value != null ? Number(p.discount_value) : null,
        products: (p.products ?? []) as { product_id: string; name: string; qty: number; unit_price: number }[],
        bundlePrice: p.bundle_price != null ? Number(p.bundle_price) : null,
        productIds: (p.products ?? []).map((x: any) => String(x.product_id)),
      }));
  } catch {
    return [];
  }
}

export function getProductPromo(promos: ActivePromo[], productId: string): ActivePromo | null {
  return promos.find((p) => p.productIds.length === 0 || p.productIds.includes(productId)) ?? null;
}

export function promoDiscountLabel(promo: ActivePromo): string {
  if (promo.type === 'bogo') return '1+1 offert';
  if (promo.discountType === 'percent' && promo.discountValue)
    return `-${promo.discountValue}%`;
  if (promo.discountType === 'amount' && promo.discountValue)
    return `-${promo.discountValue.toFixed(2)}€`;
  if (promo.type === 'bundle' && promo.bundlePrice)
    return `${promo.bundlePrice.toFixed(2)}€`;
  return 'PROMO';
}
