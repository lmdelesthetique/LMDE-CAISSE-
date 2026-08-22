import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

/**
 * Verifies that the provided sessionToken matches the stored token for subscriptionId.
 * Returns null if valid, or a 401/400 NextResponse to return immediately.
 */
export async function verifyClientSession(
  subscriptionId: string | null | undefined,
  sessionToken: string | null | undefined
): Promise<NextResponse | null> {
  if (!subscriptionId || !sessionToken) {
    return NextResponse.json({ error: 'Session invalide' }, { status: 401 });
  }
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('client_subscriptions')
    .select('id')
    .eq('id', subscriptionId)
    .eq('session_token', sessionToken)
    .maybeSingle();
  if (!data) {
    return NextResponse.json({ error: 'Session expirée — veuillez vous reconnecter' }, { status: 401 });
  }
  return null; // valid
}
