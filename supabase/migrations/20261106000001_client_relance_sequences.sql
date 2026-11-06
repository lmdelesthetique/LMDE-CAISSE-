-- Séquences de relance A/B/D/E par client
-- Chaque ligne = une séquence active (ou historique) pour un client donné
CREATE TABLE IF NOT EXISTS client_relance_sequences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sequence        text NOT NULL CHECK (sequence IN ('A', 'B', 'D', 'E')),
  devis_id        uuid REFERENCES devis_pro(id) ON DELETE SET NULL,
  etape_actuelle  text,
  statut          text NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'pause', 'stop', 'complete')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_client_relance_sequences_client ON client_relance_sequences(client_id);
CREATE INDEX IF NOT EXISTS idx_client_relance_sequences_statut ON client_relance_sequences(statut);
