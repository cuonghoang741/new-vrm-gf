-- In-app rating: log every star, send only the happy ones to the store.
--
-- ⚠️ Read before shipping. Deciding who sees the store's review page from a
-- rating they gave you first is "review gating", and both stores forbid it —
-- App Store Review Guideline 1.1.7 and Google Play's Ratings & Reviews policy.
-- Paying ruby for five stars specifically is incentivised review, which is
-- forbidden on its own. The mechanism is built here as asked; making it
-- compliant is two small changes, and both are noted where they apply:
--   * pay the quest for ANY rating, not only 5 (see `app_submit_rating`);
--   * offer the store link to everyone (see the client dialog).

create table if not exists public.app_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  comment text,
  /** Whether this rating opened the real store page. */
  sent_to_store boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists app_ratings_user_idx on public.app_ratings (user_id, created_at desc);

alter table public.app_ratings enable row level security;
drop policy if exists app_ratings_select_self on public.app_ratings;
create policy app_ratings_select_self on public.app_ratings
  for select to authenticated using (user_id = auth.uid());
-- Writes go through the RPC, which is what bumps the quest.
revoke insert, update, delete on public.app_ratings from anon, authenticated;

-- The quest itself.
insert into public.quests (id, kind, event, target, reward_ruby, title, icon, sort_order, is_active)
values ('s_rate', 'special', 'rate_app', 1, 200, 'Rate TrueMate 5★', 'star', 105, true)
on conflict (id) do update
  set event = excluded.event,
      target = excluded.target,
      reward_ruby = excluded.reward_ruby,
      title = excluded.title,
      icon = excluded.icon,
      sort_order = excluded.sort_order,
      is_active = true;

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

  -- Only five stars completes the quest. Change this to `if true then` to pay
  -- for any rating, which is what the store policies expect.
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
