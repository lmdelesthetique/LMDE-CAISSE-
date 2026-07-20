CREATE TABLE IF NOT EXISTS app_reviews (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id       uuid NOT NULL REFERENCES client_subscriptions(id) ON DELETE CASCADE,
  rating                smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment               text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id)
);
