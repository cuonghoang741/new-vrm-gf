-- "Share TrueMate with 5 people" — a special quest.
--
-- `app_track` only ever bumped DAILY quests, because every event it accepted
-- had a daily counterpart. Sharing has no daily version, so the event is
-- handled on its own and matches quests of any kind.

insert into public.quests (id, kind, event, target, reward_ruby, title, icon, sort_order, is_active)
values ('s_share_5', 'special', 'share_app', 5, 60, 'Share TrueMate 5 times', 'share', 106, true)
on conflict (id) do update
  set event = excluded.event, target = excluded.target, reward_ruby = excluded.reward_ruby,
      title = excluded.title, icon = excluded.icon, sort_order = excluded.sort_order, is_active = true;

create or replace function public.app_track(p_event text, p_amount integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); q quests;
begin
  if v_uid is null then return; end if;

  -- Sharing: one per call, no batching, and it counts towards a special quest.
  if p_event = 'share_app' then
    for q in select * from quests where event = 'share_app' and is_active loop
      insert into user_quest_progress (user_id, quest_id, period, progress)
      values (v_uid, q.id, _quest_period(q.kind), 1)
      on conflict (user_id, quest_id, period) do update
        set progress = least(q.target, user_quest_progress.progress + 1);
    end loop;
    return;
  end if;

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
