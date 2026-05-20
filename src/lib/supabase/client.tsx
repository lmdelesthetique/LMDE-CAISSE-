import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    'https://yztwtuhtlkuybekxkhno.supabase.co',
    'sb_publishable_vTKmaGRIpZiVicWZ5s2P5Q_EZKN_Fxf'
  );
}
