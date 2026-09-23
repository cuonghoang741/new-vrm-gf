-- Pay the rating quest for ANY number of stars.
--
-- Paying only for five was incentivised review: the reward bought the score,
-- not the feedback. Now the ruby is for telling us what you think, whatever
-- you think, and the number of stars only decides where the rating goes —
-- five opens the store page, anything less stays in `app_ratings` with the
-- comment.
--
-- (The remaining store-policy exposure is that gate itself: Apple 1.1.7 and
-- Google Play both dislike choosing who sees the review page. Changing
-- `v_send` to true for everyone is what closes it.)

update public.quests
   set title = 'Rate TrueMate'
 where id = 's_rate';

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

  -- Five stars is the only rating that goes to the store.
  v_send := p_stars = 5;

  insert into app_ratings (user_id, stars, comment, sent_to_store)
  values (v_uid, p_stars, nullif(btrim(coalesce(p_comment, '')), ''), v_send);

  -- Every rating completes the quest, so the reward is for the feedback
  -- rather than for the score.
  for q in select * from quests where event = 'rate_app' and is_active loop
    insert into user_quest_progress (user_id, quest_id, period, progress)
    values (v_uid, q.id, _quest_period(q.kind), q.target)
    on conflict (user_id, quest_id, period) do update
      set progress = greatest(user_quest_progress.progress, q.target);
  end loop;

  return jsonb_build_object('ok', true, 'stars', p_stars, 'open_store', v_send);
end $$;

revoke all on function public.app_submit_rating(smallint, text) from public, anon;
grant execute on function public.app_submit_rating(smallint, text) to authenticated;
