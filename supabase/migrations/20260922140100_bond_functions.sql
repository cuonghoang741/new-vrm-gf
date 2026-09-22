-- Bond level logic. Every number the client could profit from lying about is
-- decided here: XP per event, the daily cap on each event, the level curve, and
-- whether a capability is open.

-- XP per event and how much of it a single UTC day may grant.
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
    ('checkin',          25,  25)
  ) as r(event, xp, day_cap)
  where r.event = p_event;
$$;

-- Cumulative XP this character demands to reach `p_level`.
-- Difficulty stretches the whole curve: x1.0 at 1 up to x2.6 at 5.
create or replace function _bond_threshold(p_level smallint, p_difficulty smallint)
returns integer
language sql stable as $$
  select ceil(
           coalesce((select base_xp from bond_levels where level = p_level), 0)
           * (1 + 0.4 * (greatest(1, least(5, coalesce(p_difficulty, 2))) - 1))
         )::integer;
$$;

-- Highest level whose threshold this XP has met.
create or replace function _bond_level_for(p_xp integer, p_difficulty smallint)
returns smallint
language sql stable as $$
  select coalesce(max(level), 1)::smallint
    from bond_levels
   where _bond_threshold(level, p_difficulty) <= greatest(0, coalesce(p_xp, 0));
$$;

create or replace function _is_pro(p_uid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from subscriptions
     where user_id = p_uid and status in ('active', 'trialing')
       and (expires_at is null or expires_at > now())
  );
$$;

-- ─── grant XP for something the user just did ───────────────────────────────
-- Returns the new state plus whether this call pushed them up a level, so the
-- client can celebrate exactly once.
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
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

  select * into v_rule from _bond_rule(p_event);
  if v_rule is null then return jsonb_build_object('error', 'unknown_event'); end if;

  select difficulty into v_diff from characters where id = p_character_id;
  if v_diff is null then return jsonb_build_object('error', 'no_character'); end if;

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
  v_grant := greatest(0, least(v_rule.xp * v_n, v_rule.day_cap - v_used));

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
    'level', v_after,
    'leveled_up', v_after > v_before,
    'capped', v_grant = 0
  );
end $$;

-- ─── move a character's quests along ────────────────────────────────────────
create or replace function _bond_quest_bump(p_uid uuid, p_char uuid, p_event text, p_n integer)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare q character_quests; v_period text; v_today date := (now() at time zone 'utc')::date;
begin
  for q in
    select * from character_quests
     where is_active and event = p_event
       and (character_id is null or character_id = p_char)
  loop
    v_period := case when q.kind = 'daily' then to_char(v_today, 'YYYY-MM-DD') else 'once' end;
    -- Daily quests are only offered three at a time; ignore the rest.
    if q.kind = 'daily' and not _bond_is_offered(p_uid, p_char, q.id, v_today) then
      continue;
    end if;
    insert into user_character_quests (user_id, character_id, quest_id, period, progress)
    values (p_uid, p_char, q.id, v_period, least(q.target, p_n))
    on conflict (user_id, quest_id, period) do update
      set progress = least(q.target, user_character_quests.progress + p_n)
      where user_character_quests.claimed_at is null;
  end loop;
end $$;

-- Which three dailies this user sees for this character today. Derived from a
-- hash rather than stored, so the set is stable for the day, varies per user
-- and per character, and costs no rows.
create or replace function _bond_is_offered(p_uid uuid, p_char uuid, p_quest uuid, p_day date)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select p_quest in (
    select id from character_quests
     where is_active and kind = 'daily' and character_id is null
     order by md5(p_uid::text || p_char::text || p_day::text || id::text)
     limit 3
  );
$$;

-- ─── read the whole picture for one character ───────────────────────────────
create or replace function app_bond_state(p_character_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid  uuid := auth.uid();
  v_diff smallint;
  v_xp   integer := 0;
  v_lvl  smallint := 1;
  v_pro  boolean;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select difficulty into v_diff from characters where id = p_character_id;
  if v_diff is null then return jsonb_build_object('error', 'no_character'); end if;

  select xp, level into v_xp, v_lvl from user_bond
   where user_id = v_uid and character_id = p_character_id;
  v_xp := coalesce(v_xp, 0);
  v_lvl := _bond_level_for(v_xp, v_diff);
  v_pro := _is_pro(v_uid);

  return jsonb_build_object(
    'ok', true,
    'difficulty', v_diff,
    'xp', v_xp,
    'level', v_lvl,
    'next_level', case when v_lvl < 5 then v_lvl + 1 else null end,
    'xp_into_level', v_xp - _bond_threshold(v_lvl, v_diff),
    'xp_for_next', case when v_lvl < 5
      then _bond_threshold((v_lvl + 1)::smallint, v_diff) - _bond_threshold(v_lvl, v_diff)
      else null end,
    'levels', (
      select jsonb_agg(jsonb_build_object(
               'level', level, 'title_key', title_key, 'unlocks_key', unlocks_key,
               'xp', _bond_threshold(level, v_diff),
               'reached', level <= v_lvl) order by level)
        from bond_levels),
    'capabilities', (
      select jsonb_object_agg(code, jsonb_build_object(
               'min_level', min_level, 'pro_only', pro_only,
               'open', v_lvl >= min_level and (not pro_only or v_pro)))
        from bond_capabilities),
    'quests', (
      select coalesce(jsonb_agg(x order by x->>'kind', (x->>'sort')::int), '[]'::jsonb) from (
        select jsonb_build_object(
                 'id', q.id, 'kind', q.kind, 'code', q.code,
                 'target', q.target, 'reward_xp', q.reward_xp, 'reward_ruby', q.reward_ruby,
                 'sort', q.sort,
                 'progress', coalesce(u.progress, 0),
                 'claimed', u.claimed_at is not null) as x
          from character_quests q
          left join user_character_quests u
                 on u.quest_id = q.id and u.user_id = v_uid
                and u.period = case when q.kind = 'daily'
                                    then to_char(v_today, 'YYYY-MM-DD') else 'once' end
         where q.is_active
           and (q.character_id is null or q.character_id = p_character_id)
           and (
             -- dailies: only today's three
             (q.kind = 'daily' and _bond_is_offered(v_uid, p_character_id, q.id, v_today))
             -- hidden: nothing until it is actually done
             or (q.kind = 'hidden' and coalesce(u.progress, 0) >= q.target)
             or q.kind = 'unique'
           )
      ) s)
  );
end $$;

-- ─── claim a finished quest ─────────────────────────────────────────────────
create or replace function app_bond_claim(p_quest_id uuid, p_character_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  q character_quests;
  v_period text;
  v_row user_character_quests;
  v_diff smallint;
  v_xp integer;
  v_before smallint; v_after smallint;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into q from character_quests where id = p_quest_id and is_active;
  if q.id is null then return jsonb_build_object('error', 'no_quest'); end if;

  v_period := case when q.kind = 'daily' then to_char(v_today, 'YYYY-MM-DD') else 'once' end;

  select * into v_row from user_character_quests
   where user_id = v_uid and quest_id = p_quest_id and period = v_period for update;

  if v_row.user_id is null or v_row.progress < q.target then
    return jsonb_build_object('error', 'not_complete');
  end if;
  if v_row.claimed_at is not null then
    return jsonb_build_object('error', 'already_claimed');
  end if;

  update user_character_quests set claimed_at = now()
   where user_id = v_uid and quest_id = p_quest_id and period = v_period;

  select difficulty into v_diff from characters where id = p_character_id;

  insert into user_bond (user_id, character_id) values (v_uid, p_character_id)
  on conflict (user_id, character_id) do nothing;

  select xp into v_xp from user_bond
   where user_id = v_uid and character_id = p_character_id for update;

  v_before := _bond_level_for(v_xp, v_diff);
  v_after  := _bond_level_for(v_xp + q.reward_xp, v_diff);

  update user_bond set xp = xp + q.reward_xp, level = v_after, updated_at = now()
   where user_id = v_uid and character_id = p_character_id;

  -- Quest ruby goes through the ledger like every other payout.
  if q.reward_ruby > 0 then
    perform _ruby_apply(v_uid, q.reward_ruby, 'bond_quest', p_quest_id::text);
  end if;

  return jsonb_build_object('ok', true, 'reward_xp', q.reward_xp,
                            'reward_ruby', q.reward_ruby,
                            'xp', v_xp + q.reward_xp, 'level', v_after,
                            'leveled_up', v_after > v_before);
end $$;

revoke all on function app_bond_track(uuid, text, integer) from public;
revoke all on function app_bond_state(uuid) from public;
revoke all on function app_bond_claim(uuid, uuid) from public;
grant execute on function app_bond_track(uuid, text, integer) to authenticated;
grant execute on function app_bond_state(uuid) to authenticated;
grant execute on function app_bond_claim(uuid, uuid) to authenticated;
