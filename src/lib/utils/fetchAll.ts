/**
 * Supabase PostgREST silently caps results at 1000 rows when no limit is set.
 * Use this to load all rows by auto-paginating with .range().
 *
 * Usage:
 *   const products = await fetchAll((from, to) =>
 *     supabase.from('products').select('*').order('name').range(from, to)
 *   );
 */
export async function fetchAll<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryFn(from, from + PAGE - 1);
    if (error || !data?.length) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
