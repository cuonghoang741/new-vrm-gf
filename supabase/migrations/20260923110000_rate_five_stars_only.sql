-- Back to paying the rating quest for five stars only, as asked.
--
-- (The store-policy note stands on the store side, not the AdMob side — the
-- two are unrelated. It is recorded in `20260923070000_app_ratings.sql`.)

update public.quests set title = 'Rate TrueMate 5★' where id = 's_rate';

create or replace function public.app_submit_rating(p_stars smallint, p_comment text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_send boolean;
  q quests;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if p_stars is null or p_stars < 1 or p_stars > 5 then
    return jsonb_build_object('error', 'bad_stars');
  end if;

  v_send := p_stars = 5;

  insert into app_ratings (user_id, stars, comment, sent_to_store)
  values (v_uid, p_stars, nullif(btrim(coalesce(p_comment, '')), ''), v_send);

  -- Five stars completes the quest; anything less is logged and paid nothing.
  if v_send then
    for q in select * from quests where event = 'rate_app' and is_active loop
      insert into user_quest_progress (user_id, quest_id, period, progress)
      values (v_uid, q.id, _quest_period(q.kind), q.target)
      on conflict (user_id, quest_id, period) do update
        set progress = greatest(user_quest_progress.progress, q.target);
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'stars', p_stars, 'open_store', v_send);
end $$;

revoke all on function public.app_submit_rating(smallint, text) from public, anon;
grant execute on function public.app_submit_rating(smallint, text) to authenticated;
