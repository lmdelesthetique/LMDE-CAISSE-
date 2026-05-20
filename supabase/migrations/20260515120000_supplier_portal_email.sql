-- Add portal_email column to supplier_portal_users if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'supplier_portal_users'
      AND column_name = 'portal_email'
  ) THEN
    ALTER TABLE public.supplier_portal_users ADD COLUMN portal_email text;
  END IF;
END $$;
