-- Add delivery mode choice per subscription order
ALTER TABLE subscription_orders
  ADD COLUMN IF NOT EXISTS shipping_mode text NOT NULL DEFAULT 'delivery'
  CHECK (shipping_mode IN ('delivery', 'pickup'));

-- Add launch offer flag per subscription (free shipping for first 20 clients)
ALTER TABLE client_subscriptions
  ADD COLUMN IF NOT EXISTS launch_offer boolean NOT NULL DEFAULT false;
