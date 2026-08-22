-- ── Client Portal Security Upgrade ──────────────────────────────────────────
-- 1. Session token per subscription (generated on every login)
-- 2. PIN brute-force protection (lock after 5 failures for 30 min)

alter table client_subscriptions
  add column if not exists session_token   uuid    default gen_random_uuid(),
  add column if not exists pin_failed_attempts int  default 0,
  add column if not exists pin_locked_until    timestamptz;

-- Backfill existing rows with a token
update client_subscriptions
set session_token = gen_random_uuid()
where session_token is null;

-- ── Updated verify_client_pin ────────────────────────────────────────────────
-- Returns session_token on success, raises exception on lockout,
-- returns empty on wrong PIN (while incrementing failure counter).

create or replace function verify_client_pin(p_phone text, p_pin text)
returns table(
  subscription_id   uuid,
  client_id         uuid,
  client_name       text,
  plan_name         text,
  plan_price        numeric,
  quota_amount      numeric,
  shipping_free     boolean,
  shipping_cost     numeric,
  launch_offer      boolean,
  session_token     uuid
)
language plpgsql security definer set search_path = public
as $$
declare
  v_sub_id       uuid;
  v_locked_until timestamptz;
  v_failed       int;
  v_new_token    uuid;
begin
  -- Find subscription by phone (not yet checking PIN)
  select cs.id, cs.pin_locked_until, cs.pin_failed_attempts
  into   v_sub_id, v_locked_until, v_failed
  from   client_subscriptions cs
  where  cs.portal_phone = trim(p_phone)
    and  cs.status in ('active', 'pending')
  limit 1;

  -- Check lockout
  if v_sub_id is not null
     and v_locked_until is not null
     and v_locked_until > now() then
    raise exception 'Trop de tentatives. Réessayez dans % minutes.',
      ceil(extract(epoch from (v_locked_until - now())) / 60)::int;
  end if;

  -- Check PIN
  if v_sub_id is not null and exists (
    select 1 from client_subscriptions cs
    where  cs.id = v_sub_id
      and  cs.pin_code = trim(p_pin)
  ) then
    -- ✅ Success — new session token, reset failures
    v_new_token := gen_random_uuid();
    update client_subscriptions
    set session_token       = v_new_token,
        pin_failed_attempts = 0,
        pin_locked_until    = null
    where id = v_sub_id;

    return query
      select
        cs.id                                       as subscription_id,
        c.id                                        as client_id,
        (c.first_name || ' ' || c.last_name)::text as client_name,
        sp.name                                     as plan_name,
        sp.price                                    as plan_price,
        sp.quota_amount,
        sp.shipping_free,
        sp.shipping_cost,
        cs.launch_offer,
        v_new_token                                 as session_token
      from client_subscriptions cs
      join clients c  on c.id  = cs.client_id
      join subscription_plans sp on sp.id = cs.plan_id
      where cs.id = v_sub_id
        and sp.is_active = true;
  else
    -- ❌ Wrong PIN — increment failure counter, lock if >= 5
    if v_sub_id is not null then
      update client_subscriptions
      set pin_failed_attempts = pin_failed_attempts + 1,
          pin_locked_until = case
            when pin_failed_attempts + 1 >= 5
            then now() + interval '30 minutes'
            else pin_locked_until
          end
      where id = v_sub_id;
    end if;
    -- Return empty row set (wrong PIN)
  end if;
end;
$$;
