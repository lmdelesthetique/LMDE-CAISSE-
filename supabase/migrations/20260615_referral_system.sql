-- Referral (Parrainage) system migration
-- Created: 2026-06-15

-- ─── Add referral columns to clients ────────────────────────────────────────
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES clients(id),
  ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_points_earned INTEGER DEFAULT 0;

-- ─── referrals table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS referrals (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  parrain_id                UUID REFERENCES clients(id),
  filleul_id                UUID REFERENCES clients(id),
  code_utilise              TEXT NOT NULL,
  statut                    TEXT DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'valide', 'recompense')),
  parrain_points            INTEGER DEFAULT 300,
  parrain_rewarded_at       TIMESTAMPTZ,
  filleul_discount_percent  INTEGER DEFAULT 10,
  filleul_discount_used     BOOLEAN DEFAULT false,
  filleul_discount_used_at  TIMESTAMPTZ,
  filleul_receipt_id        UUID,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "access_policy" ON referrals;
END $$;
CREATE POLICY "access_policy" ON referrals FOR ALL USING (true) WITH CHECK (true);

-- ─── Generate referral codes for existing clients (first_name + 2 digits) ──
UPDATE clients
SET referral_code = UPPER(
  SUBSTRING(
    REPLACE(
      CONCAT(first_name, FLOOR(RANDOM() * 90 + 10)::TEXT),
      ' ', ''
    ), 1, 8
  )
)
WHERE referral_code IS NULL AND first_name IS NOT NULL;

-- Fix any duplicates that may have appeared
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, first_name FROM clients
    WHERE referral_code IN (
      SELECT referral_code FROM clients
      WHERE referral_code IS NOT NULL
      GROUP BY referral_code HAVING COUNT(*) > 1
    )
  LOOP
    UPDATE clients
    SET referral_code = UPPER(SUBSTRING(REPLACE(
      CONCAT(r.first_name, FLOOR(RANDOM() * 900 + 100)::TEXT), ' ', ''), 1, 8))
    WHERE id = r.id;
  END LOOP;
END $$;
