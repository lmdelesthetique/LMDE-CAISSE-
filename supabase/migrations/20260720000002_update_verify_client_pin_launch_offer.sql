-- Update verify_client_pin to also return launch_offer from client_subscriptions
create or replace function verify_client_pin(p_phone text, p_pin text)
returns table(
  subscription_id uuid,
  client_id       uuid,
  client_name     text,
  plan_name       text,
  plan_price      numeric,
  quota_amount    numeric,
  shipping_free   boolean,
  shipping_cost   numeric,
  launch_offer    boolean
)
language plpgsql security definer set search_path = public
as $$
begin
  return query
    select
      cs.id                                      as subscription_id,
      c.id                                       as client_id,
      (c.first_name || ' ' || c.last_name)::text as client_name,
      sp.name                                    as plan_name,
      sp.price                                   as plan_price,
      sp.quota_amount,
      sp.shipping_free,
      sp.shipping_cost,
      cs.launch_offer
    from client_subscriptions cs
    join clients c on c.id = cs.client_id
    join subscription_plans sp on sp.id = cs.plan_id
    where cs.portal_phone = trim(p_phone)
      and cs.pin_code     = trim(p_pin)
      and cs.status       = 'active'
      and sp.is_active    = true;
end;
$$;
