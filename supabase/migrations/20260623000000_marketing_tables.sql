-- Marketing campaign tables
CREATE TABLE IF NOT EXISTS campagnes_marketing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nom TEXT NOT NULL,
  segment TEXT NOT NULL,
  message TEXT NOT NULL,
  statut TEXT NOT NULL DEFAULT 'brouillon',
  total_clients INTEGER DEFAULT 0,
  envoyes INTEGER DEFAULT 0,
  erreurs INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_by TEXT
);

CREATE TABLE IF NOT EXISTS campagne_marketing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campagne_id UUID REFERENCES campagnes_marketing(id) ON DELETE CASCADE,
  client_id UUID,
  phone TEXT NOT NULL,
  client_name TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente',
  error_message TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE campagnes_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE campagne_marketing_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access campagnes_marketing"
  ON campagnes_marketing FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access campagne_marketing_logs"
  ON campagne_marketing_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
