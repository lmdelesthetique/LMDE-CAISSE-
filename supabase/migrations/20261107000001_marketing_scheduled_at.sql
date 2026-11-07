-- Add scheduled_at to campagnes_marketing (needed for "programmer l'envoi" feature)
ALTER TABLE campagnes_marketing
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- Index for cron scheduler query: statut='programme' AND scheduled_at <= now()
CREATE INDEX IF NOT EXISTS idx_campagnes_marketing_scheduled
  ON campagnes_marketing(statut, scheduled_at)
  WHERE statut = 'programme';
