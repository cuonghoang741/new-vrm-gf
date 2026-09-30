-- Touch quests, PRO only.
--
-- PRO touches without limit, so touching is where its quests belong: two
-- dailies (always shown, on top of the day's three) and three milestones.
-- A free account sees them with a PRO tag, but they neither progress nor pay
-- out for it; the claim is refused on the server, not only hidden.

alter table character_quests add column if not exists pro_only boolean not null default false;

-- The day's three are drawn from the ordinary pool only.
create or replace function _bond_is_offered(p_uid uuid, p_char uuid, p_quest uuid, p_day date)
returns boolean
language sql stable security definer set search_path to 'public' as $$
  select p_quest in (
    select id from character_quests
     where is_active and kind = 'daily' and character_id is null and not pro_only
     order by md5(p_uid::text || p_char::text || p_day::text || id::text)
     limit 3
  );
$$;

create or replace function _bond_quest_bump(p_uid uuid, p_char uuid, p_event text, p_n integer)
returns void
language plpgsql security definer set search_path to 'public' as $$
declare q character_quests; v_period text; v_today date := (now() at time zone 'utc')::date;
        v_pro boolean := _is_pro(p_uid);
begin
  for q in
    select * from character_quests
     where is_active and event = p_event
       and (character_id is null or character_id = p_char)
  loop
    if q.pro_only and not v_pro then continue; end if;
    v_period := case when q.kind = 'daily' then to_char(v_today, 'YYYY-MM-DD') else 'once' end;
    -- Ordinary dailies are offered three at a time; ignore the rest.
    if q.kind = 'daily' and not q.pro_only and not _bond_is_offered(p_uid, p_char, q.id, v_today) then
      continue;
    end if;
    insert into user_character_quests (user_id, character_id, quest_id, period, progress)
    values (p_uid, p_char, q.id, v_period, least(q.target, p_n))
    on conflict (user_id, quest_id, period) do update
      set progress = least(q.target, user_character_quests.progress + p_n)
      where user_character_quests.claimed_at is null;
  end loop;
end $$;

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
  v_raw  smallint;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select difficulty into v_diff from characters where id = p_character_id;
  if v_diff is null then return jsonb_build_object('error', 'no_character'); end if;

  select xp, level into v_xp, v_lvl from user_bond
   where user_id = v_uid and character_id = p_character_id;
  v_xp := coalesce(v_xp, 0);
  v_lvl := _bond_level_for(v_xp, v_diff);
  v_pro := _is_pro(v_uid);
  v_raw := _bond_level_raw(v_xp, v_diff);

  return jsonb_build_object(
    'ok', true,
    'difficulty', v_diff,
    'xp', v_xp,
    'level', v_lvl,
    'max_level', _bond_level_cap(),
    -- The next level exists but is PRO's: Lv5 for a free account.
    'next_pro_only', v_lvl < 5 and v_lvl + 1 > _bond_level_cap(),
    -- Enough XP for it already; PRO would open it at once.
    'next_ready', v_raw > v_lvl,
    'next_level', case when v_lvl < 5 then v_lvl + 1 else null end,
    'xp_into_level', v_xp - _bond_threshold(v_lvl, v_diff),
    'xp_for_next', case when v_lvl < 5
      then _bond_threshold((v_lvl + 1)::smallint, v_diff) - _bond_threshold(v_lvl, v_diff)
      else null end,
    'levels', (
      select jsonb_agg(jsonb_build_object(
               'level', level, 'title_key', title_key, 'unlocks_key', unlocks_key,
               'xp', _bond_threshold(level, v_diff),
               'reached', level <= v_lvl,
               'pro_only', level > 4) order by level)
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
                 'pro_only', q.pro_only,
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
             (q.kind = 'daily' and (q.pro_only or _bond_is_offered(v_uid, p_character_id, q.id, v_today)))
             -- hidden: nothing until it is actually done
             or (q.kind = 'hidden' and coalesce(u.progress, 0) >= q.target)
             or q.kind = 'unique'
           )
      ) s)
  );
end $$;



-- character_id is null for templates, and the (character_id, code) key does
-- not treat nulls as equal, so this cannot lean on ON CONFLICT.
with v(kind, code, target, reward_xp, reward_ruby, sort) as (values
  ('daily',  'touch_pro_d10', 10,  40,  10, 20),
  ('daily',  'touch_pro_d25', 25,  70,  20, 21),
  ('unique', 'touch_pro_50',  50,  150, 40, 20),
  ('unique', 'touch_pro_200', 200, 400, 100, 21),
  ('unique', 'touch_pro_500', 500, 800, 200, 22)
), upd as (
  update character_quests q
     set kind = v.kind, event = 'touch', target = v.target, reward_xp = v.reward_xp,
         reward_ruby = v.reward_ruby, sort = v.sort, pro_only = true, is_active = true
    from v where q.character_id is null and q.code = v.code
  returning q.code
)
insert into character_quests (character_id, kind, code, event, target, reward_xp, reward_ruby, sort, pro_only)
select null, v.kind, v.code, 'touch', v.target, v.reward_xp, v.reward_ruby, v.sort, true
  from v
 where not exists (select 1 from character_quests q where q.character_id is null and q.code = v.code);

CREATE OR REPLACE FUNCTION public.app_bond_claim(p_quest_id uuid, p_character_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- PRO quests pay out to PRO only, whatever the client shows.
  if q.pro_only and not _is_pro(v_uid) then return jsonb_build_object('error', 'pro_only'); end if;

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
    -- The period belongs in the ref. Without it the ledger's
    -- (user, reason, ref) uniqueness swallowed every claim after the
    -- first, so a DAILY bond quest paid its ruby exactly once, ever,
    -- while still reporting reward_ruby > 0 to the app.
    perform _ruby_apply(v_uid, q.reward_ruby, 'bond_quest',
                        p_quest_id::text || ':' || v_period);
  end if;

  return jsonb_build_object('ok', true, 'reward_xp', q.reward_xp,
                            'reward_ruby', q.reward_ruby,
                            'xp', v_xp + q.reward_xp, 'level', v_after,
                            'leveled_up', v_after > v_before);
end $function$;
