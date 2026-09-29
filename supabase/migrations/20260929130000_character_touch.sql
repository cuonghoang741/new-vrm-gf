-- Touching a character, and double bond XP for PRO.
--
-- A free account gets 3 touches per UTC day, across all characters; after that
-- the app offers PRO. PRO touches without limit. Every allowed touch earns bond
-- XP through app_bond_track, so it inherits the per-event daily cap: PRO can
-- keep touching for the reactions, but cannot farm levels with it.
--
-- The limit lives here and not in the app. A counter kept on the device would
-- reset whenever someone cleared the app's data.

-- ─── XP rule for the new event ──────────────────────────────────────────────
-- 5 XP a touch with a 15 XP daily cap: a free user's three touches land exactly
-- on the cap. PRO earns 10 a touch against a doubled cap of 30 (see below).
create or replace function _bond_rule(p_event text)
returns table (xp integer, day_cap integer)
language sql immutable as $$
  select r.xp, r.day_cap from (values
    ('chat_message',      3,  45),
    ('voice_minute',      8,  48),
    ('video_minute',     10,  60),
    ('change_outfit',     5,  15),
    ('change_background', 4,  12),
    ('dance',             6,  18),
    ('open_gallery',      4,  12),
    ('checkin',          25,  25),
    ('touch',             5,  15)
  ) as r(event, xp, day_cap)
  where r.event = p_event;
$$;

-- ─── PRO earns double bond XP ───────────────────────────────────────────────
-- Both the grant and the daily ceiling double. Doubling only the grant would
-- let PRO reach the same ceiling in half the actions and earn nothing more,
-- which is not double XP.
--
-- Mid-day changes behave sensibly without special cases: someone who
-- subscribes after using a free allowance keeps earning up to the PRO ceiling,
-- and someone whose PRO lapses is already past the free ceiling and earns
-- nothing more that day.
create or replace function app_bond_track(p_character_id uuid, p_event text, p_amount integer default 1)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_rule  record;
  v_diff  smallint;
  v_row   user_bond;
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
  v_grant integer;
  v_before smallint;
  v_after  smallint;
  v_n     integer := greatest(1, least(coalesce(p_amount, 1), 60));
  v_mult  integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

  select * into v_rule from _bond_rule(p_event);
  if v_rule is null then return jsonb_build_object('error', 'unknown_event'); end if;

  select difficulty into v_diff from characters where id = p_character_id;
  if v_diff is null then return jsonb_build_object('error', 'no_character'); end if;

  v_mult := case when _is_pro(v_uid) then 2 else 1 end;

  insert into user_bond (user_id, character_id, day)
  values (v_uid, p_character_id, v_today)
  on conflict (user_id, character_id) do nothing;

  select * into v_row from user_bond
   where user_id = v_uid and character_id = p_character_id for update;

  -- A new UTC day wipes every per-event allowance.
  if v_row.day is distinct from v_today then
    v_row.day := v_today;
    v_row.day_xp := '{}'::jsonb;
  end if;

  v_used := coalesce((v_row.day_xp ->> p_event)::integer, 0);
  v_grant := greatest(0, least(v_rule.xp * v_n * v_mult, v_rule.day_cap * v_mult - v_used));

  v_before := _bond_level_for(v_row.xp, v_diff);
  v_after  := _bond_level_for(v_row.xp + v_grant, v_diff);

  update user_bond
     set xp = xp + v_grant,
         level = v_after,
         day = v_today,
         day_xp = jsonb_set(v_row.day_xp, array[p_event],
                            to_jsonb(v_used + v_grant), true),
         updated_at = now()
   where user_id = v_uid and character_id = p_character_id;

  -- The same action usually moves a daily quest along.
  perform _bond_quest_bump(v_uid, p_character_id, p_event, v_n);

  return jsonb_build_object(
    'ok', true,
    'xp', v_row.xp + v_grant,
    'granted', v_grant,
    'multiplier', v_mult,
    'level', v_after,
    'leveled_up', v_after > v_before,
    'capped', v_grant = 0
  );
end $$;

-- ─── the daily touch counter ────────────────────────────────────────────────
-- One row per user per UTC day, across all characters, so switching character
-- does not buy three more. PRO rows are counted too, for analytics only.
create table if not exists public.touch_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  count   integer not null default 0,
  primary key (user_id, day)
);
-- No policies on purpose: only the security-definer functions below read or
-- write it, so no client can reset its own counter.
alter table public.touch_daily enable row level security;

create or replace function _touch_free_limit() returns integer
language sql immutable as $$ select 3 $$;

create or replace function app_touch_quota()
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
  v_pro   boolean;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  v_pro := _is_pro(v_uid);
  select count into v_used from touch_daily where user_id = v_uid and day = v_today;
  v_used := coalesce(v_used, 0);
  return jsonb_build_object(
    'pro', v_pro,
    'limit', _touch_free_limit(),
    'used', v_used,
    'left', case when v_pro then null else greatest(0, _touch_free_limit() - v_used) end
  );
end $$;

-- Spends one touch and grants its XP, or refuses with 'daily_limit'.
create or replace function app_touch(p_character_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid   uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_pro   boolean;
  v_used  integer;
  v_limit integer := _touch_free_limit();
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if not exists (select 1 from characters where id = p_character_id) then
    return jsonb_build_object('error', 'no_character');
  end if;

  v_pro := _is_pro(v_uid);

  insert into touch_daily (user_id, day) values (v_uid, v_today)
  on conflict (user_id, day) do nothing;

  if v_pro then
    update touch_daily set count = count + 1
     where user_id = v_uid and day = v_today
    returning count into v_used;
  else
    -- One statement both checks and spends, so taps racing each other (or two
    -- devices) cannot slip a fourth touch past the limit.
    update touch_daily set count = count + 1
     where user_id = v_uid and day = v_today and count < v_limit
    returning count into v_used;
    if v_used is null then
      return jsonb_build_object('ok', false, 'error', 'daily_limit',
                                'pro', false, 'limit', v_limit, 'left', 0);
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'pro', v_pro,
    'limit', v_limit,
    'left', case when v_pro then null else v_limit - v_used end,
    'bond', app_bond_track(p_character_id, 'touch', 1)
  );
end $$;

revoke all on function app_touch(uuid) from public, anon;
revoke all on function app_touch_quota() from public, anon;
grant execute on function app_touch(uuid) to authenticated;
grant execute on function app_touch_quota() to authenticated;
