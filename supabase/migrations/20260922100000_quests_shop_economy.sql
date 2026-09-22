-- ─────────────────────────────────────────────────────────────────────────────
-- Quest + Shop + Dance + Privilege — the whole ruby economy, server-authoritative.
--
-- Rules this migration enforces (and why):
--   * Ruby only moves inside SECURITY DEFINER functions. The client can no
--     longer INSERT/UPDATE `user_currency.ruby` (it could before: RLS allowed
--     own-row updates, so anyone could set their own balance). Ruby is now sold
--     for money, so this is not optional.
--   * Every ruby movement is a row in `ruby_ledger`, unique on
--     (user_id, reason, ref). A retried/duplicated call cannot pay twice.
--   * "Today" is the server's UTC date, never a client value.
--   * The user is always auth.uid(). The legacy RPCs that took p_user_id keep
--     their signature (old app builds call them) but refuse any other id.
--   * PRO is decided server-side from `subscriptions` (written only by the
--     RevenueCat webhook) or `privileged_users` — never from a client flag.
--
-- Unlock model for backgrounds / costumes / dances (`unlock_type`):
--   default — free for everyone
--   ads     — one rewarded ad, kept forever (PRO: free)
--   pro     — PRO only; if price_ruby > 0 a free user may buy it with ruby instead
--   ruby    — bought with ruby by everyone (PRO gets a daily ruby stipend)
-- `tier` is kept in sync (default/ads → free, pro/ruby → pro) so older app
-- builds, which only read `tier`, never hand out a ruby item for an ad.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function public._econ_today() returns date
language sql stable set search_path = public
as $$ select (now() at time zone 'utc')::date $$;

-- ── economy config (CMS-editable numbers) ────────────────────────────────────
create table if not exists public.economy_config (
  key text primary key,
  value integer not null,
  description text,
  updated_at timestamptz not null default now()
);
alter table public.economy_config enable row level security;
drop policy if exists public_read on public.economy_config;
create policy public_read on public.economy_config for select to anon, authenticated using (true);
drop policy if exists cms_admin_all on public.economy_config;
create policy cms_admin_all on public.economy_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke truncate on public.economy_config from anon, authenticated;

insert into public.economy_config (key, value, description) values
  ('ad_reward_ruby',        10,    'Ruby cho mỗi lần xem quảng cáo nhận ruby'),
  ('ad_daily_limit',        5,     'Số lần xem quảng cáo nhận ruby tối đa mỗi ngày (UTC)'),
  ('ad_min_gap_seconds',    20,    'Khoảng cách tối thiểu giữa 2 lần nhận ruby từ quảng cáo'),
  ('pro_daily_bonus',       30,    'Ruby PRO nhận mỗi ngày trong trang Quest'),
  ('ad_unlocks_daily_cap',  40,    'Số item mở bằng quảng cáo tối đa mỗi ngày (chống script)'),
  ('pack_truemate.ruby.1',  120,   'Ruby của gói truemate.ruby.1'),
  ('pack_truemate.ruby.2',  650,   'Ruby của gói truemate.ruby.2'),
  ('pack_truemate.ruby.3',  1400,  'Ruby của gói truemate.ruby.3'),
  ('pack_truemate.ruby.4',  3000,  'Ruby của gói truemate.ruby.4'),
  ('pack_truemate.ruby.5',  8000,  'Ruby của gói truemate.ruby.5'),
  ('pack_truemate.ruby.6',  17500, 'Ruby của gói truemate.ruby.6')
on conflict (key) do nothing;

create or replace function public._econ(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = public
as $$ select coalesce((select value from economy_config where key = p_key), p_default) $$;

-- ── ruby ledger ──────────────────────────────────────────────────────────────
create table if not exists public.ruby_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  balance_after integer not null,
  reason text not null,          -- ad | quest | pro_bonus | checkin | pack | purchase | admin | legacy_purchase
  ref text not null,             -- dedup key within reason (e.g. quest id + day, transaction id)
  created_at timestamptz not null default now(),
  unique (user_id, reason, ref)
);
create index if not exists ruby_ledger_user_time on public.ruby_ledger (user_id, created_at desc);
alter table public.ruby_ledger enable row level security;
drop policy if exists own_read on public.ruby_ledger;
create policy own_read on public.ruby_ledger for select to authenticated using (user_id = auth.uid());
drop policy if exists cms_admin_read on public.ruby_ledger;
create policy cms_admin_read on public.ruby_ledger for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.ruby_ledger from anon, authenticated;

create unique index if not exists user_currency_one_row_per_user
  on public.user_currency (user_id) where user_id is not null;

-- Move ruby. Returns the new balance, or NULL when (user, reason, ref) was
-- already applied (idempotent) or the balance would go negative.
create or replace function public._ruby_apply(p_uid uuid, p_delta integer, p_reason text, p_ref text)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_bal integer;
begin
  if p_uid is null then raise exception 'no user' using errcode = '28000'; end if;
  insert into user_currency (user_id, vcoin, ruby) values (p_uid, 0, 0)
    on conflict (user_id) where user_id is not null do nothing;
  select ruby into v_bal from user_currency where user_id = p_uid for update;
  if v_bal + p_delta < 0 then return null; end if;
  begin
    insert into ruby_ledger (user_id, delta, balance_after, reason, ref)
    values (p_uid, p_delta, v_bal + p_delta, p_reason, p_ref);
  exception when unique_violation then
    return null;
  end;
  update user_currency set ruby = v_bal + p_delta, updated_at = now() where user_id = p_uid;
  return v_bal + p_delta;
end $$;
revoke all on function public._ruby_apply(uuid, integer, text, text) from public, anon, authenticated;

-- ── lock client writes to money tables ───────────────────────────────────────
-- user_currency: the client may still keep `vcoin` (VoiceCallService writes
-- it) but can never set `ruby`. Column grants do that; RLS still limits rows.
revoke insert, update on public.user_currency from anon, authenticated;
grant insert (user_id, client_id, vcoin, owner_key) on public.user_currency to authenticated;
grant update (vcoin, updated_at) on public.user_currency to authenticated;
revoke truncate on public.user_currency from anon, authenticated;

-- subscriptions: written by the RevenueCat webhook (service role) only. The
-- app never writes it; it only deletes on "reset account".
drop policy if exists subscriptions_insert_owner on public.subscriptions;
drop policy if exists subscriptions_update_owner on public.subscriptions;
revoke insert, update, truncate on public.subscriptions from anon, authenticated;

-- transactions stays client-insertable: it is only a history log (VoiceCallService
-- writes call rows there) and nothing reads it to decide ownership.

-- ── privilege (reviewer / partner accounts) ──────────────────────────────────
create table if not exists public.privilege_credentials (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
alter table public.privilege_credentials enable row level security;
revoke all on public.privilege_credentials from anon, authenticated;

create table if not exists public.privileged_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  credential_id uuid references public.privilege_credentials(id) on delete set null,
  granted_at timestamptz not null default now()
);
alter table public.privileged_users enable row level security;
drop policy if exists own_read on public.privileged_users;
create policy own_read on public.privileged_users for select to authenticated using (user_id = auth.uid());
drop policy if exists cms_admin_all on public.privileged_users;
create policy cms_admin_all on public.privileged_users for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, update, truncate on public.privileged_users from anon;

create table if not exists public.privilege_attempts (
  id bigserial primary key,
  user_id uuid not null,
  ok boolean not null,
  at timestamptz not null default now()
);
create index if not exists privilege_attempts_user_at on public.privilege_attempts (user_id, at desc);
alter table public.privilege_attempts enable row level security;
revoke all on public.privilege_attempts from anon, authenticated;

create or replace function public._is_pro(p_uid uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from privileged_users where user_id = p_uid)
      or exists (
        select 1 from subscriptions
        where user_id = p_uid and tier = 'pro' and coalesce(status, 'active') = 'active'
          and coalesce(expires_at, current_period_end, now() + interval '1 day') > now()
      )
$$;
revoke all on function public._is_pro(uuid) from public, anon, authenticated;

create or replace function public.app_redeem_privilege(p_username text, p_password text)
returns jsonb
language plpgsql security definer set search_path = public, extensions
as $$
declare v_uid uuid := auth.uid(); v_cred privilege_credentials; v_fails integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  -- Brute-force guard: 5 wrong tries per hour per account.
  select count(*) into v_fails from privilege_attempts
   where user_id = v_uid and not ok and at > now() - interval '1 hour';
  if v_fails >= 5 then return jsonb_build_object('error', 'too_many_attempts'); end if;

  select * into v_cred from privilege_credentials
   where username = trim(p_username) and is_active
     and password_hash = crypt(p_password, password_hash);
  insert into privilege_attempts (user_id, ok) values (v_uid, v_cred.id is not null);
  if v_cred.id is null then return jsonb_build_object('error', 'invalid'); end if;

  insert into privileged_users (user_id, credential_id) values (v_uid, v_cred.id)
    on conflict (user_id) do update set credential_id = excluded.credential_id, granted_at = now();
  return jsonb_build_object('ok', true, 'username', v_cred.username);
end $$;
revoke all on function public.app_redeem_privilege(text, text) from public, anon;
grant execute on function public.app_redeem_privilege(text, text) to authenticated;

create or replace function public.app_leave_privilege() returns jsonb
language sql security definer set search_path = public
as $$ delete from privileged_users where user_id = auth.uid(); select jsonb_build_object('ok', true) $$;
revoke all on function public.app_leave_privilege() from public, anon;
grant execute on function public.app_leave_privilege() to authenticated;

-- CMS: create/rotate a credential (hashing happens here, the CMS never stores it).
create or replace function public.admin_set_privilege_credential(p_username text, p_password text, p_note text default null)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'password must be at least 8 characters'; end if;
  insert into privilege_credentials (username, password_hash, note)
  values (trim(p_username), crypt(p_password, gen_salt('bf', 10)), p_note)
  on conflict (username) do update set password_hash = excluded.password_hash, is_active = true,
    note = coalesce(excluded.note, privilege_credentials.note)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.admin_set_privilege_credential(text, text, text) from public, anon;
grant execute on function public.admin_set_privilege_credential(text, text, text) to authenticated;

create or replace function public.admin_list_privilege() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'username', c.username, 'is_active', c.is_active, 'note', c.note,
      'created_at', c.created_at, 'users', (select count(*) from privileged_users u where u.credential_id = c.id))
      order by c.created_at)
    from privilege_credentials c), '[]'::jsonb);
end $$;
revoke all on function public.admin_list_privilege() from public, anon;
grant execute on function public.admin_list_privilege() to authenticated;

create or replace function public.admin_toggle_privilege_credential(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  update privilege_credentials set is_active = p_active where id = p_id;
  -- Turning a credential off also removes the PRO it granted.
  if not p_active then delete from privileged_users where credential_id = p_id; end if;
end $$;
revoke all on function public.admin_toggle_privilege_credential(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_privilege_credential(uuid, boolean) to authenticated;

-- ── unlock types on items ────────────────────────────────────────────────────
alter table public.backgrounds add column if not exists unlock_type text;
alter table public.character_costumes add column if not exists unlock_type text;

-- Backfill once, from what each row means today.
update public.backgrounds b set unlock_type = case
    when exists (select 1 from characters c where c.background_default_id = b.id) then 'default'
    when b.tier = 'pro' then 'pro'
    when coalesce(b.price_ruby, 0) > 0 then 'ruby'
    else 'ads' end
  where unlock_type is null;
update public.character_costumes k set unlock_type = case
    when exists (select 1 from characters c where c.default_costume_id = k.id) then 'default'
    when k.tier = 'pro' then 'pro'
    when coalesce(k.price_ruby, 0) > 0 then 'ruby'
    else 'ads' end
  where unlock_type is null;

create table if not exists public.dances (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_url text not null,          -- absolute URL of the FBX (Mixamo rig)
  thumbnail_url text,
  music_url text,
  duration_seconds integer,
  unlock_type text not null default 'ads',
  tier text not null default 'free',
  price_ruby integer not null default 0,
  sort_order integer not null default 0,
  available boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.dances enable row level security;
drop policy if exists public_read on public.dances;
create policy public_read on public.dances for select to anon, authenticated using (true);
drop policy if exists cms_admin_all on public.dances;
create policy cms_admin_all on public.dances for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke truncate on public.dances from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['backgrounds', 'character_costumes', 'dances'] loop
    execute format('alter table public.%I alter column unlock_type set default %L', t, 'ads');
    execute format('update public.%I set unlock_type = %L where unlock_type is null', t, 'ads');
    execute format('alter table public.%I alter column unlock_type set not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_unlock_type_check');
    execute format('alter table public.%I add constraint %I check (unlock_type in (''default'',''ads'',''pro'',''ruby''))', t, t || '_unlock_type_check');
  end loop;
end $$;

-- Keep `tier` (read by older builds) consistent with unlock_type.
create or replace function public._sync_tier_from_unlock_type() returns trigger
language plpgsql set search_path = public
as $$
begin
  new.tier := case when new.unlock_type in ('pro', 'ruby') then 'pro' else 'free' end;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['backgrounds', 'character_costumes', 'dances'] loop
    execute format('drop trigger if exists sync_tier on public.%I', t);
    execute format('create trigger sync_tier before insert or update of unlock_type, tier on public.%I for each row execute function public._sync_tier_from_unlock_type()', t);
    execute format('update public.%I set unlock_type = unlock_type', t);
  end loop;
end $$;

-- ── ownership (user_unlocks) ────────────────────────────────────────────────
alter table public.user_unlocks add column if not exists source text not null default 'ad';
alter table public.user_unlocks drop constraint if exists user_unlocks_asset_type_check;
alter table public.user_unlocks add constraint user_unlocks_asset_type_check
  check (asset_type in ('character', 'costume', 'background', 'dance'));
alter table public.user_unlocks drop constraint if exists user_unlocks_source_check;
alter table public.user_unlocks add constraint user_unlocks_source_check
  check (source in ('ad', 'ruby', 'legacy', 'reward'));

-- Unlock type of any item, by unlock-table asset type.
create or replace function public._item_unlock(p_type text, p_id uuid, out unlock_type text, out price_ruby integer)
language plpgsql stable security definer set search_path = public
as $$
begin
  if p_type = 'background' then
    select b.unlock_type, coalesce(b.price_ruby, 0) into unlock_type, price_ruby from backgrounds b where b.id = p_id;
  elsif p_type = 'costume' then
    select k.unlock_type, coalesce(k.price_ruby, 0) into unlock_type, price_ruby from character_costumes k where k.id = p_id;
  elsif p_type = 'dance' then
    select d.unlock_type, coalesce(d.price_ruby, 0) into unlock_type, price_ruby from dances d where d.id = p_id;
  elsif p_type = 'character' then
    -- Characters keep their old model: free tier = one ad, pro = paywall/ruby.
    select case when c.tier = 'free' then 'ads' else 'pro' end, coalesce(c.price_ruby, 0)
      into unlock_type, price_ruby from characters c where c.id = p_id;
  end if;
end $$;
revoke all on function public._item_unlock(text, uuid) from public, anon;
grant execute on function public._item_unlock(text, uuid) to authenticated;

-- The client may still record an ad unlock directly (older builds do exactly
-- that) — but only for items whose unlock type IS "watch an ad", and only as
-- source 'ad'. Ruby/PRO items can no longer be self-granted.
drop policy if exists user_unlocks_insert_own on public.user_unlocks;
create policy user_unlocks_insert_own on public.user_unlocks for insert to authenticated
  with check (
    auth.uid() = user_id and source = 'ad'
    and (select u.unlock_type from public._item_unlock(asset_type, asset_id) u) in ('ads', 'default')
  );
revoke update, truncate on public.user_unlocks from anon, authenticated;

-- Carry over what users already own. The old sheets treated ANY user_assets
-- row as owned (ruby purchases were recorded only there), so every such row
-- becomes a 'legacy' unlock — nobody loses an item in the switch.
insert into public.user_unlocks (user_id, asset_type, asset_id, source)
select distinct a.user_id, case a.item_type when 'character_costume' then 'costume' else a.item_type end, a.item_id, 'legacy'
from public.user_assets a
join auth.users u on u.id = a.user_id
where a.item_type in ('background', 'character_costume')
  and (exists (select 1 from public.backgrounds b where b.id = a.item_id)
       or exists (select 1 from public.character_costumes k where k.id = a.item_id))
on conflict do nothing;

-- Unlock one "ads" item after the rewarded ad (preferred over the direct insert).
create or replace function public.app_unlock_with_ad(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_u record; v_today integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into v_u from _item_unlock(p_type, p_id);
  if v_u.unlock_type is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_u.unlock_type not in ('ads', 'default') then return jsonb_build_object('error', 'not_ad_item'); end if;
  select count(*) into v_today from user_unlocks
   where user_id = v_uid and source = 'ad' and created_at >= _econ_today();
  if v_today >= _econ('ad_unlocks_daily_cap', 40) then return jsonb_build_object('error', 'daily_cap'); end if;
  insert into user_unlocks (user_id, asset_type, asset_id, source) values (v_uid, p_type, p_id, 'ad')
    on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.app_unlock_with_ad(text, uuid) from public, anon;
grant execute on function public.app_unlock_with_ad(text, uuid) to authenticated;

-- Buy one item with ruby: 'ruby' items for everyone, 'pro' items with a price
-- for non-PRO users.
create or replace function public.app_buy_item(p_type text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_u record; v_bal integer; v_have integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if p_type not in ('background', 'costume', 'dance', 'character') then return jsonb_build_object('error', 'bad_type'); end if;
  if exists (select 1 from user_unlocks where user_id = v_uid and asset_type = p_type and asset_id = p_id and source <> 'ad') then
    return jsonb_build_object('error', 'owned');
  end if;
  select * into v_u from _item_unlock(p_type, p_id);
  if v_u.unlock_type is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_u.price_ruby <= 0 or v_u.unlock_type not in ('ruby', 'pro') then
    return jsonb_build_object('error', 'not_for_sale');
  end if;

  v_bal := _ruby_apply(v_uid, -v_u.price_ruby, 'purchase', p_type || ':' || p_id);
  if v_bal is null then
    select coalesce(ruby, 0) into v_have from user_currency where user_id = v_uid;
    return jsonb_build_object('error', 'insufficient', 'need', v_u.price_ruby, 'have', coalesce(v_have, 0));
  end if;

  insert into user_unlocks (user_id, asset_type, asset_id, source) values (v_uid, p_type, p_id, 'ruby')
    on conflict (user_id, asset_type, asset_id) do update set source = 'ruby';
  insert into user_assets (user_id, item_type, item_id)
    select v_uid, case p_type when 'costume' then 'character_costume' else p_type end, p_id
    where p_type <> 'dance'
      and not exists (select 1 from user_assets where user_id = v_uid and item_id = p_id);
  insert into transactions (user_id, item_type, item_id, currency_type, amount_paid)
    values (v_uid, p_type, p_id, 'ruby', v_u.price_ruby);
  return jsonb_build_object('ok', true, 'price', v_u.price_ruby, 'ruby_left', v_bal);
end $$;
revoke all on function public.app_buy_item(text, uuid) from public, anon;
grant execute on function public.app_buy_item(text, uuid) to authenticated;

-- ── legacy RPCs: same signatures, now bound to auth.uid() ────────────────────
create or replace function public.app_get_ruby(p_user_id uuid default null) returns integer
language sql stable security definer set search_path = public
as $$ select coalesce((select ruby from user_currency where user_id = auth.uid()), 0) $$;
revoke all on function public.app_get_ruby(uuid) from public, anon;
grant execute on function public.app_get_ruby(uuid) to authenticated;

create or replace function public.app_purchase_item(p_user_id uuid, p_item_type text, p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_res jsonb;
begin
  if auth.uid() is null or p_user_id is distinct from auth.uid() then
    return jsonb_build_object('error', 'forbidden');
  end if;
  v_res := app_buy_item(case p_item_type when 'character_costume' then 'costume' else p_item_type end, p_item_id);
  return v_res;
end $$;
revoke all on function public.app_purchase_item(uuid, text, uuid) from public, anon;
grant execute on function public.app_purchase_item(uuid, text, uuid) to authenticated;

create or replace function public.app_claim_daily_reward(p_user_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := _econ_today();
  v_current integer; v_last date; v_new_day integer; v_ruby integer;
begin
  if v_uid is null or (p_user_id is not null and p_user_id <> v_uid) then
    return jsonb_build_object('error', 'forbidden');
  end if;
  insert into user_login_rewards (user_id, current_day, last_claim_date, total_days_claimed)
  select v_uid, 0, null, 0
  where not exists (select 1 from user_login_rewards where user_id = v_uid);
  select current_day, last_claim_date into v_current, v_last
    from user_login_rewards where user_id = v_uid order by created_at limit 1 for update;
  if v_last = v_today then return jsonb_build_object('already', true, 'day', v_current); end if;

  v_new_day := (coalesce(v_current, 0) % 30) + 1;
  select coalesce(reward_ruby, 0) into v_ruby from login_rewards where day_number = v_new_day;
  v_ruby := coalesce(v_ruby, 0);
  if v_ruby > 0 then perform _ruby_apply(v_uid, v_ruby, 'checkin', v_today::text); end if;

  update user_login_rewards
     set current_day = v_new_day, last_claim_date = v_today,
         total_days_claimed = coalesce(total_days_claimed, 0) + 1, updated_at = now()
   where user_id = v_uid;
  return jsonb_build_object('day', v_new_day, 'ruby', v_ruby);
end $$;
revoke all on function public.app_claim_daily_reward(uuid) from public, anon;
grant execute on function public.app_claim_daily_reward(uuid) to authenticated;

-- user_login_rewards: the client used to be able to rewrite its own streak.
revoke insert, update, truncate on public.user_login_rewards from anon, authenticated;

-- ── quests ───────────────────────────────────────────────────────────────────
create table if not exists public.quests (
  id text primary key,
  kind text not null check (kind in ('daily', 'special')),
  event text not null,
  target integer not null check (target > 0),
  reward_ruby integer not null check (reward_ruby >= 0),
  title text not null,               -- English fallback; the app localises by id
  icon text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.quests enable row level security;
drop policy if exists public_read on public.quests;
create policy public_read on public.quests for select to anon, authenticated using (true);
drop policy if exists cms_admin_all on public.quests;
create policy cms_admin_all on public.quests for all to authenticated using (public.is_admin()) with check (public.is_admin());
revoke truncate on public.quests from anon, authenticated;

-- Events:
--   server-counted: chat (messages sent today / total), checkin, watch_ad,
--                   outfits_owned, backgrounds_owned, dances_owned, checkin_days,
--                   all_daily (every other active daily quest done)
--   client-reported (capped at target, daily only): change_outfit,
--                   change_background, dance, open_gallery, voice_call
insert into public.quests (id, kind, event, target, reward_ruby, title, icon, sort_order) values
  ('d_checkin',      'daily',   'checkin',            1,    3,  'Check in today',               'calendar',   10),
  ('d_chat_10',      'daily',   'chat',              10,    5,  'Send 10 messages',             'message',    20),
  ('d_chat_30',      'daily',   'chat',              30,    8,  'Send 30 messages',             'messages',   30),
  ('d_outfit',       'daily',   'change_outfit',      1,    3,  'Change her outfit',            'shirt',      40),
  ('d_background',   'daily',   'change_background',  1,    3,  'Take her somewhere new',       'map',        50),
  ('d_dance',        'daily',   'dance',              1,    3,  'Watch her dance',              'music',      60),
  ('d_gallery',      'daily',   'open_gallery',       1,    3,  'Open the gallery',             'photo',      70),
  ('d_ads_3',        'daily',   'watch_ad',           3,    5,  'Watch 3 reward videos',        'video',      80),
  ('d_all',          'daily',   'all_daily',          1,    7,  'Complete every daily quest',   'trophy',     90),
  ('s_msg_100',      'special', 'chat',             100,   30,  'Send 100 messages',            'message',   110),
  ('s_msg_500',      'special', 'chat',             500,   80,  'Send 500 messages',            'messages',  120),
  ('s_msg_2000',     'special', 'chat',            2000,  200,  'Send 2,000 messages',          'messages',  130),
  ('s_checkin_7',    'special', 'checkin_days',       7,   50,  'Check in on 7 days',           'calendar',  140),
  ('s_checkin_30',   'special', 'checkin_days',      30,  150,  'Check in on 30 days',          'calendar',  150),
  ('s_outfit_3',     'special', 'outfits_owned',      3,   30,  'Unlock 3 outfits',             'shirt',     160),
  ('s_outfit_10',    'special', 'outfits_owned',     10,  100,  'Unlock 10 outfits',            'shirt',     170),
  ('s_bg_5',         'special', 'backgrounds_owned',  5,   50,  'Unlock 5 places',              'map',       180),
  ('s_dance_5',      'special', 'dances_owned',       5,   50,  'Unlock 5 dances',              'music',     190),
  ('s_ads_20',       'special', 'watch_ad',          20,   40,  'Watch 20 reward videos',       'video',     200),
  ('s_ads_100',      'special', 'watch_ad',         100,  120,  'Watch 100 reward videos',      'video',     210)
on conflict (id) do nothing;

create table if not exists public.user_quest_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  quest_id text not null references public.quests(id) on delete cascade,
  period date not null,              -- UTC day for daily quests; 2000-01-01 for special
  progress integer not null default 0,
  claimed_at timestamptz,
  primary key (user_id, quest_id, period)
);
alter table public.user_quest_progress enable row level security;
drop policy if exists own_read on public.user_quest_progress;
create policy own_read on public.user_quest_progress for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete, truncate on public.user_quest_progress from anon, authenticated;

create or replace function public._quest_period(p_kind text) returns date
language sql stable set search_path = public
as $$ select case when p_kind = 'daily' then _econ_today() else date '2000-01-01' end $$;

-- Current value of an event for a user, for the quest's period. Server-counted
-- events are computed from real data; the rest come from user_quest_progress.
create or replace function public._quest_value(p_uid uuid, q public.quests) returns integer
language plpgsql stable security definer set search_path = public
as $$
declare v integer; v_day date := _econ_today();
begin
  if q.event = 'chat' then
    if q.kind = 'daily' then
      select count(*) into v from conversation
       where user_id = p_uid and not coalesce(is_agent, false) and created_at >= v_day and created_at < v_day + 1;
    else
      select count(*) into v from conversation where user_id = p_uid and not coalesce(is_agent, false);
    end if;
  elsif q.event = 'checkin' then
    select count(*) into v from user_login_rewards where user_id = p_uid and last_claim_date = v_day;
  elsif q.event = 'checkin_days' then
    select coalesce(max(total_days_claimed), 0) into v from user_login_rewards where user_id = p_uid;
  elsif q.event = 'watch_ad' then
    if q.kind = 'daily' then
      select count(*) into v from ruby_ledger where user_id = p_uid and reason = 'ad' and created_at >= v_day;
    else
      select count(*) into v from ruby_ledger where user_id = p_uid and reason = 'ad';
    end if;
  elsif q.event = 'outfits_owned' then
    select count(*) into v from user_unlocks where user_id = p_uid and asset_type = 'costume';
  elsif q.event = 'backgrounds_owned' then
    select count(*) into v from user_unlocks where user_id = p_uid and asset_type = 'background';
  elsif q.event = 'dances_owned' then
    select count(*) into v from user_unlocks where user_id = p_uid and asset_type = 'dance';
  elsif q.event = 'all_daily' then
    select case when bool_and(_quest_value(p_uid, o) >= o.target) then 1 else 0 end into v
      from quests o where o.kind = 'daily' and o.is_active and o.event <> 'all_daily';
  else
    select progress into v from user_quest_progress
     where user_id = p_uid and quest_id = q.id and period = _quest_period(q.kind);
  end if;
  return least(coalesce(v, 0), q.target);
end $$;
revoke all on function public._quest_value(uuid, public.quests) from public, anon, authenticated;

-- Report a client-side event (outfit changed, danced…). Only moves quests whose
-- event is client-reported; capped at each quest's target.
create or replace function public.app_track(p_event text, p_amount integer default 1) returns void
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); q quests;
begin
  if v_uid is null then return; end if;
  if p_event not in ('change_outfit', 'change_background', 'dance', 'open_gallery', 'voice_call') then return; end if;
  for q in select * from quests where event = p_event and is_active and kind = 'daily' loop
    insert into user_quest_progress (user_id, quest_id, period, progress)
    values (v_uid, q.id, _quest_period(q.kind), least(q.target, greatest(1, least(coalesce(p_amount, 1), 10))))
    on conflict (user_id, quest_id, period) do update
      set progress = least(q.target, user_quest_progress.progress + greatest(1, least(coalesce(p_amount, 1), 10)));
  end loop;
end $$;
revoke all on function public.app_track(text, integer) from public, anon;
grant execute on function public.app_track(text, integer) to authenticated;

-- Everything the Quest page shows, in one round-trip.
create or replace function public.app_get_quests() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := _econ_today();
  v_ads integer; v_last_ad timestamptz; v_pro boolean; v_ruby integer; v_list jsonb;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select count(*), max(created_at) into v_ads, v_last_ad from ruby_ledger
   where user_id = v_uid and reason = 'ad' and created_at >= v_day;
  v_pro := _is_pro(v_uid);
  select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'event', q.event, 'title', q.title, 'icon', q.icon,
      'target', q.target, 'reward', q.reward_ruby,
      'progress', _quest_value(v_uid, q),
      'claimed', exists (select 1 from ruby_ledger l where l.user_id = v_uid and l.reason = 'quest'
                          and l.ref = q.id || ':' || _quest_period(q.kind)::text)
    ) order by q.sort_order), '[]'::jsonb)
  into v_list from quests q where q.is_active;

  return jsonb_build_object(
    'day', v_day,
    'ruby', coalesce(v_ruby, 0),
    'is_pro', v_pro,
    'quests', v_list,
    'ads', jsonb_build_object(
      'watched', v_ads, 'limit', _econ('ad_daily_limit', 5), 'reward', _econ('ad_reward_ruby', 10),
      'next_at', case when v_last_ad is null then null
                      else v_last_ad + make_interval(secs => _econ('ad_min_gap_seconds', 20)) end),
    'pro_bonus', jsonb_build_object(
      'amount', _econ('pro_daily_bonus', 30),
      'claimed', exists (select 1 from ruby_ledger where user_id = v_uid and reason = 'pro_bonus' and ref = v_day::text)),
    'packs', (select coalesce(jsonb_object_agg(substr(key, 6), value), '{}'::jsonb)
                from economy_config where key like 'pack_%')
  );
end $$;
revoke all on function public.app_get_quests() from public, anon;
grant execute on function public.app_get_quests() to authenticated;

create or replace function public.app_claim_quest(p_quest_id text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); q quests; v_bal integer; v_period date;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into q from quests where id = p_quest_id and is_active;
  if q.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if _quest_value(v_uid, q) < q.target then return jsonb_build_object('error', 'not_done'); end if;
  v_period := _quest_period(q.kind);
  v_bal := _ruby_apply(v_uid, q.reward_ruby, 'quest', q.id || ':' || v_period::text);
  if v_bal is null then return jsonb_build_object('error', 'claimed'); end if;
  insert into user_quest_progress (user_id, quest_id, period, progress, claimed_at)
  values (v_uid, q.id, v_period, q.target, now())
  on conflict (user_id, quest_id, period) do update set claimed_at = now();
  return jsonb_build_object('ok', true, 'reward', q.reward_ruby, 'ruby', v_bal);
end $$;
revoke all on function public.app_claim_quest(text) from public, anon;
grant execute on function public.app_claim_quest(text) to authenticated;

-- Rewarded ad for ruby: server counts the day's grants and spaces them out.
create or replace function public.app_reward_ad() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_day date := _econ_today();
  v_n integer; v_last timestamptz; v_bal integer; v_reward integer := _econ('ad_reward_ruby', 10);
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  perform 1 from user_currency where user_id = v_uid for update;   -- serialise per user
  select count(*), max(created_at) into v_n, v_last from ruby_ledger
   where user_id = v_uid and reason = 'ad' and created_at >= v_day;
  if v_n >= _econ('ad_daily_limit', 5) then return jsonb_build_object('error', 'daily_limit', 'watched', v_n); end if;
  if v_last is not null and v_last > now() - make_interval(secs => _econ('ad_min_gap_seconds', 20)) then
    return jsonb_build_object('error', 'too_soon');
  end if;
  v_bal := _ruby_apply(v_uid, v_reward, 'ad', v_day::text || '#' || (v_n + 1));
  if v_bal is null then return jsonb_build_object('error', 'retry'); end if;
  return jsonb_build_object('ok', true, 'reward', v_reward, 'ruby', v_bal, 'watched', v_n + 1);
end $$;
revoke all on function public.app_reward_ad() from public, anon;
grant execute on function public.app_reward_ad() to authenticated;

create or replace function public.app_claim_pro_bonus() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_bal integer; v_amt integer := _econ('pro_daily_bonus', 30);
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if not _is_pro(v_uid) then return jsonb_build_object('error', 'not_pro'); end if;
  v_bal := _ruby_apply(v_uid, v_amt, 'pro_bonus', _econ_today()::text);
  if v_bal is null then return jsonb_build_object('error', 'claimed'); end if;
  return jsonb_build_object('ok', true, 'reward', v_amt, 'ruby', v_bal);
end $$;
revoke all on function public.app_claim_pro_bonus() from public, anon;
grant execute on function public.app_claim_pro_bonus() to authenticated;

create or replace function public.app_is_privileged() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from privileged_users where user_id = auth.uid()) $$;
revoke all on function public.app_is_privileged() from public, anon;
grant execute on function public.app_is_privileged() to authenticated;

-- ── IAP fulfilment (RevenueCat webhook, service role only) ───────────────────
create or replace function public.grant_ruby_pack(p_user_id uuid, p_product_id text, p_transaction_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_amt integer; v_bal integer;
begin
  select value into v_amt from economy_config where key = 'pack_' || p_product_id;
  if v_amt is null then return jsonb_build_object('error', 'unknown_product'); end if;
  if not exists (select 1 from auth.users where id = p_user_id) then return jsonb_build_object('error', 'unknown_user'); end if;
  v_bal := _ruby_apply(p_user_id, v_amt, 'pack', p_transaction_id);
  if v_bal is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  return jsonb_build_object('ok', true, 'granted', v_amt, 'ruby', v_bal);
end $$;
revoke all on function public.grant_ruby_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function public.grant_ruby_pack(uuid, text, text) to service_role;

-- Refund of a ruby pack: take it back (never below zero).
create or replace function public.revoke_ruby_pack(p_user_id uuid, p_product_id text, p_transaction_id text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_amt integer; v_have integer; v_bal integer;
begin
  select delta into v_amt from ruby_ledger where user_id = p_user_id and reason = 'pack' and ref = p_transaction_id;
  if v_amt is null then return jsonb_build_object('error', 'not_granted'); end if;
  select coalesce(ruby, 0) into v_have from user_currency where user_id = p_user_id;
  v_bal := _ruby_apply(p_user_id, -least(v_amt, v_have), 'pack_refund', p_transaction_id);
  return jsonb_build_object('ok', true, 'ruby', v_bal);
end $$;
revoke all on function public.revoke_ruby_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function public.revoke_ruby_pack(uuid, text, text) to service_role;

-- CMS: adjust a user's ruby with an audit trail.
create or replace function public.admin_adjust_ruby(p_user_id uuid, p_delta integer, p_note text)
returns integer
language plpgsql security definer set search_path = public
as $$
begin
  if not is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return _ruby_apply(p_user_id, p_delta, 'admin', coalesce(p_note, '') || '#' || gen_random_uuid());
end $$;
revoke all on function public.admin_adjust_ruby(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_ruby(uuid, integer, text) to authenticated;

-- Existing balances enter the ledger as an opening entry, so balance_after is
-- continuous from here on.
insert into public.ruby_ledger (user_id, delta, balance_after, reason, ref)
select c.user_id, c.ruby, c.ruby, 'opening', 'opening'
from public.user_currency c join auth.users u on u.id = c.user_id
where c.ruby > 0
on conflict do nothing;
