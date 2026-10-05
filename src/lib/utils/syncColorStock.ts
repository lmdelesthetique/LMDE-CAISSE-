// Server-side only. Proportionally redistributes product_color_stock quantities
// to match a new products.stock total. Called after products.stock is already updated.
// If product has no color variants, does nothing.
export async function syncColorStocksToTotal(
  supabase: any,
  productId: string,
  newTotalStock: number
): Promise<void> {
  const { data: variants } = await supabase
    .from('product_color_stock')
    .select('id, quantity')
    .eq('product_id', productId);

  if (!variants?.length) return;

  const target = Math.max(0, newTotalStock);
  const currentTotal = variants.reduce((s: number, v: any) => s + Number(v.quantity || 0), 0);

  if (currentTotal === 0) {
    // Distribute evenly when all colors are at 0
    const perColor = Math.floor(target / variants.length);
    const remainder = target % variants.length;
    for (let i = 0; i < variants.length; i++) {
      await supabase
        .from('product_color_stock')
        .update({ quantity: perColor + (i === 0 ? remainder : 0) })
        .eq('id', variants[i].id);
    }
    return;
  }

  // Proportional distribution with largest-remainder rounding
  const fractions = variants.map((v: any) => {
    const raw = (Number(v.quantity || 0) / currentTotal) * target;
    return { id: v.id, floor: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });

  const assignedTotal = fractions.reduce((s: number, v: { id: string; floor: number; remainder: number }) => s + v.floor, 0);
  const diff = target - assignedTotal;

  const sorted = [...fractions].sort((a, b) => b.remainder - a.remainder);
  const finalQtys: Record<string, number> = {};
  fractions.forEach((v: { id: string; floor: number; remainder: number }) => { finalQtys[v.id] = v.floor; });
  for (let i = 0; i < diff; i++) {
    finalQtys[sorted[i].id] += 1;
  }

  for (const v of variants) {
    await supabase
      .from('product_color_stock')
      .update({ quantity: finalQtys[v.id] })
      .eq('id', v.id);
  }
}
