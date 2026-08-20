alter table client_subscriptions
  add column if not exists payment_email text;
