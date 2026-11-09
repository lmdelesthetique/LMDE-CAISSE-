-- Stripe IDs on client_subscriptions (may already exist if added manually)
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_sub
  ON client_subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_stripe_customer
  ON client_subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
