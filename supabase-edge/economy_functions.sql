-- ============================================================================
--  Ruby economy — server-side functions (run ONCE in Supabase SQL Editor)
--  Ruby-only. Atomic + SECURITY DEFINER so the client can't tamper with balances.
--  The existing update_user_currency RPC has an ambiguous-column bug; these
--  self-contained functions replace its role for the app's flows.
-- ============================================================================

-- Read a user's ruby balance (creates a zero row if missing).
create or replace function app_get_ruby(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruby integer;
begin
  select ruby into v_ruby from user_currency where user_id = p_user_id;
  if not found then
    insert into user_currency (user_id, owner_key, vcoin, ruby)
    values (p_user_id, p_user_id::text, 0, 0);
    return 0;
  end if;
  return coalesce(v_ruby, 0);
end;
$$;

-- Claim today's daily check-in reward (ruby). One claim per calendar day.
-- 30-day cycle (loops). Returns { day, ruby } or { already: true }.
create or replace function app_claim_daily_reward(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer := 0;
  v_last    date;
  v_new_day integer;
  v_ruby    integer := 0;
begin
  select current_day, last_claim_date into v_current, v_last
  from user_login_rewards where user_id = p_user_id;

  if not found then
    insert into user_login_rewards (user_id, current_day, last_claim_date, total_days_claimed)
    values (p_user_id, 0, null, 0);
    v_current := 0;
    v_last := null;
  end if;

  if v_last = current_date then
    return jsonb_build_object('already', true, 'day', v_current);
  end if;

  v_new_day := (coalesce(v_current, 0) % 30) + 1;
  select coalesce(reward_ruby, 0) into v_ruby from login_rewards where day_number = v_new_day;
  v_ruby := coalesce(v_ruby, 0);

  if not exists (select 1 from user_currency where user_id = p_user_id) then
    insert into user_currency (user_id, owner_key, vcoin, ruby)
    values (p_user_id, p_user_id::text, 0, 0);
  end if;

  update user_currency
  set ruby = coalesce(ruby, 0) + v_ruby, updated_at = now()
  where user_id = p_user_id;

  update user_login_rewards
  set current_day = v_new_day,
      last_claim_date = current_date,
      total_days_claimed = coalesce(total_days_claimed, 0) + 1,
      updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object('day', v_new_day, 'ruby', v_ruby);
end;
$$;

-- Buy a locked item with ruby. Returns { ok, price, ruby_left } or { error, ... }.
create or replace function app_purchase_item(p_user_id uuid, p_item_type text, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price integer;
  v_ruby  integer;
begin
  if exists (
    select 1 from user_assets
    where user_id = p_user_id and item_type = p_item_type and item_id = p_item_id
  ) then
    return jsonb_build_object('error', 'owned');
  end if;

  if p_item_type = 'background' then
    select price_ruby into v_price from backgrounds where id = p_item_id;
  elsif p_item_type = 'character_costume' then
    select price_ruby into v_price from character_costumes where id = p_item_id;
  elsif p_item_type = 'character' then
    select price_ruby into v_price from characters where id = p_item_id;
  else
    return jsonb_build_object('error', 'bad_type');
  end if;

  v_price := coalesce(v_price, 0);
  if v_price <= 0 then
    return jsonb_build_object('error', 'not_for_sale');
  end if;

  select coalesce(ruby, 0) into v_ruby from user_currency where user_id = p_user_id;
  v_ruby := coalesce(v_ruby, 0);
  if v_ruby < v_price then
    return jsonb_build_object('error', 'insufficient', 'need', v_price, 'have', v_ruby);
  end if;

  update user_currency set ruby = ruby - v_price, updated_at = now() where user_id = p_user_id;
  insert into user_assets (user_id, owner_key, item_type, item_id)
  values (p_user_id, p_user_id::text, p_item_type, p_item_id);

  return jsonb_build_object('ok', true, 'price', v_price, 'ruby_left', v_ruby - v_price);
end;
$$;

grant execute on function app_get_ruby(uuid)                      to anon, authenticated;
grant execute on function app_claim_daily_reward(uuid)           to anon, authenticated;
grant execute on function app_purchase_item(uuid, text, uuid)    to anon, authenticated;
