-- Allow 'cancelled' and 'en_livraison' statuses on subscription_orders
ALTER TABLE subscription_orders
  DROP CONSTRAINT IF EXISTS subscription_orders_status_check;

ALTER TABLE subscription_orders
  ADD CONSTRAINT subscription_orders_status_check
  CHECK (status IN ('open','confirmed','preparing','shipped','auto','en_livraison','cancelled'));
