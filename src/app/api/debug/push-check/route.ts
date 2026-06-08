import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? '';
  const vapidEmail = process.env.VAPID_EMAIL ?? '';

  let subscriptionsInDB = 0;
  let dbError: string | null = null;

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { count, error } = await supabase
      .from('driver_push_subscriptions')
      .select('*', { count: 'exact', head: true });
    if (error) dbError = error.message;
    else subscriptionsInDB = count ?? 0;
  } catch (e: any) {
    dbError = e.message;
  }

  return Response.json({
    hasPublicKey: !!vapidPublic,
    hasPrivateKey: !!vapidPrivate,
    hasEmail: !!vapidEmail,
    publicKeyStart: vapidPublic ? vapidPublic.substring(0, 15) + '...' : null,
    subscriptionsInDB,
    allConfigured: !!(vapidPublic && vapidPrivate && vapidEmail),
    dbError,
  });
}
