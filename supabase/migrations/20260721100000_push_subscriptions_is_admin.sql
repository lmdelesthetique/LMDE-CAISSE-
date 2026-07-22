-- Add is_admin column to push_subscriptions for admin notification targeting
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;
