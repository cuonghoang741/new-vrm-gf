-- Swinging the camera to a sensitive angle before the bond allows it (Lv4).
-- The page pulls the camera back and the app shows her reaction; this records
-- it and, from the second peek in ten minutes, costs a little bond XP:
-- 5 XP, at most 3 times a day per character, and never enough to drop a level.
create table if not exists public.bond_peeks (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  penalty      integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists bond_peeks_recent on public.bond_peeks (user_id, character_id, created_at desc);
alter table public.bond_peeks enable row level security;

create or replace function app_bond_peek(p_character_id uuid)
returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_diff smallint; v_xp integer; v_lvl smallint; v_floor integer;
  v_recent integer; v_penalised integer; v_pen integer := 0;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select difficulty into v_diff from characters where id = p_character_id;
  if v_diff is null then return jsonb_build_object('error', 'no_character'); end if;
  select xp into v_xp from user_bond where user_id = v_uid and character_id = p_character_id for update;
  v_xp := coalesce(v_xp, 0);
  v_lvl := _bond_level_for(v_xp, v_diff);
  if v_lvl >= 4 then return jsonb_build_object('ok', true, 'allowed', true, 'penalty', 0, 'level', v_lvl); end if;

  select count(*) into v_recent from bond_peeks
   where user_id = v_uid and character_id = p_character_id and created_at > now() - interval '10 minutes';
  select count(*) into v_penalised from bond_peeks
   where user_id = v_uid and character_id = p_character_id and penalty > 0
     and created_at >= v_today;
  if v_recent >= 1 and v_penalised < 3 then
    v_floor := _bond_threshold(v_lvl, v_diff);
    v_pen := least(5, greatest(0, v_xp - v_floor));
    if v_pen > 0 then
      update user_bond set xp = xp - v_pen, updated_at = now()
       where user_id = v_uid and character_id = p_character_id;
    end if;
  end if;
  insert into bond_peeks (user_id, character_id, penalty) values (v_uid, p_character_id, v_pen);
  return jsonb_build_object('ok', true, 'allowed', false, 'penalty', v_pen,
                            'xp', v_xp - v_pen, 'level', v_lvl, 'unlock_level', 4);
end $$;
grant execute on function app_bond_peek(uuid) to authenticated;
