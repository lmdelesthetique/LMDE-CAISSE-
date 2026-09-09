import { NextResponse } from 'next/server';

// GET /api/admin/migrate-devis
// Adds the produits_reassort and devis_history columns to client_pro_profiles.
// Call once from the browser if Devis PRO data is not persisting.
export async function GET() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const sql = `
    ALTER TABLE public.client_pro_profiles
      ADD COLUMN IF NOT EXISTS produits_reassort jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS devis_history     jsonb DEFAULT '[]'::jsonb;
    SELECT 'ok' AS result;
  `;

  // Try the Supabase SQL editor endpoint via the management API
  // This requires a project access token which we may not have, but worth trying.
  const projectRef = SUPABASE_URL.replace('https://', '').split('.')[0];
  const mgmtRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  }).catch(() => null);

  if (mgmtRes?.ok) {
    return NextResponse.json({ ok: true, method: 'management-api' });
  }

  // Fallback: return the SQL for manual execution
  return NextResponse.json({
    ok: false,
    message: 'Automatic migration failed — run the SQL below manually in your Supabase SQL Editor (https://app.supabase.com → votre projet → SQL Editor)',
    sql: sql.trim(),
  }, { status: 422 });
}
