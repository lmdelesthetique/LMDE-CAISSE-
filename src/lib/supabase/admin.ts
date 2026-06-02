import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL not set');
  // Prefer service role key (bypasses RLS). Fall back to anon key — all POS
  // tables have open RLS policies so anon key still works for reads+writes.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error('No Supabase key configured');
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
