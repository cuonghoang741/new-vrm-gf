-- Lv5, the top of the bond ladder, is PRO's. A free account stops at Lv4.
--
-- XP keeps counting past the Lv5 threshold, so a free player who has earned
-- it goes straight to Lv5 on subscribing, and back to Lv4 if PRO lapses. The
-- cap lives in `_bond_level_for`, which every level computation (tracking,
-- quest claims, state) goes through, so no path can write or report a Lv5
-- for a free account. It reads the caller (auth.uid()): every caller is the
-- user's own RPC. Free camera was already `pro_only` on top of Lv5.

-- The uncapped level, for "you have earned it" in the UI.
create or replace function _bond_level_raw(p_xp integer, p_difficulty smallint)
returns smallint
language sql stable as $$
  select coalesce(max(level), 1)::smallint
    from bond_levels
   where _bond_threshold(level, p_difficulty) <= greatest(0, coalesce(p_xp, 0));
$$;

create or replace function _bond_level_cap() returns smallint
language sql stable security definer set search_path to 'public' as $$
  select case when _is_pro(auth.uid()) then 5 else 4 end::smallint;
$$;

create or replace function _bond_level_for(p_xp integer, p_difficulty smallint)
returns smallint
language sql stable as $$
  select least(_bond_level_raw(p_xp, p_difficulty), _bond_level_cap())::smallint;
$$;

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


-- Stored levels written before the cap: bring free accounts back to Lv4.
update user_bond b set level = 4
 where level > 4
   and not exists (
     select 1 from subscriptions s
      where s.user_id = b.user_id and s.status in ('active', 'trialing')
        and (s.expires_at is null or s.expires_at > now()));
