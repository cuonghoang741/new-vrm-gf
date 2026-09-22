-- PRO doubles what you earn: daily check-in and quest rewards pay ×2.
--
-- The multiplier is applied on the server, next to the ledger write, so the
-- client cannot claim to be PRO — and `app_get_quests` reports it so the UI can
-- show the doubled figure before the user claims.
--
-- The PRO daily bonus (economy_config.pro_daily_bonus) is separate and is not
-- doubled; rewarded-video ruby is not doubled either.

create or replace function public._pro_multiplier(p_uid uuid) returns integer
language sql stable security definer set search_path = public
as $$ select case when _is_pro(p_uid) then 2 else 1 end $$;
revoke all on function public._pro_multiplier(uuid) from public, anon, authenticated;

create or replace function public.app_claim_daily_reward(p_user_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_today date := _econ_today();
  v_current integer; v_last date; v_new_day integer; v_ruby integer; v_mult integer;
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
  v_mult := _pro_multiplier(v_uid);
  v_ruby := coalesce(v_ruby, 0) * v_mult;
  if v_ruby > 0 then perform _ruby_apply(v_uid, v_ruby, 'checkin', v_today::text); end if;

  update user_login_rewards
     set current_day = v_new_day, last_claim_date = v_today,
         total_days_claimed = coalesce(total_days_claimed, 0) + 1, updated_at = now()
   where user_id = v_uid;
  return jsonb_build_object('day', v_new_day, 'ruby', v_ruby, 'multiplier', v_mult);
end $$;
revoke all on function public.app_claim_daily_reward(uuid) from public, anon;
grant execute on function public.app_claim_daily_reward(uuid) to authenticated;

create or replace function public.app_claim_quest(p_quest_id text) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); q quests; v_bal integer; v_period date; v_mult integer; v_reward integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into q from quests where id = p_quest_id and is_active;
  if q.id is null then return jsonb_build_object('error', 'not_found'); end if;
  if _quest_value(v_uid, q) < q.target then return jsonb_build_object('error', 'not_done'); end if;
  v_period := _quest_period(q.kind);
  v_mult := _pro_multiplier(v_uid);
  v_reward := q.reward_ruby * v_mult;
  v_bal := _ruby_apply(v_uid, v_reward, 'quest', q.id || ':' || v_period::text);
  if v_bal is null then return jsonb_build_object('error', 'claimed'); end if;
  insert into user_quest_progress (user_id, quest_id, period, progress, claimed_at)
  values (v_uid, q.id, v_period, q.target, now())
  on conflict (user_id, quest_id, period) do update set claimed_at = now();
  return jsonb_build_object('ok', true, 'reward', v_reward, 'multiplier', v_mult, 'ruby', v_bal);
end $$;
revoke all on function public.app_claim_quest(text) from public, anon;
grant execute on function public.app_claim_quest(text) to authenticated;

-- Report the multiplier (and the check-in schedule's doubled values) so the
-- app can show "×2" on every reward a PRO user is about to collect.
create or replace function public.app_get_quests() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_day date := _econ_today();
  v_ads integer; v_last_ad timestamptz; v_pro boolean; v_ruby integer; v_list jsonb; v_mult integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select count(*), max(created_at) into v_ads, v_last_ad from ruby_ledger
   where user_id = v_uid and reason = 'ad' and created_at >= v_day;
  v_pro := _is_pro(v_uid);
  v_mult := case when v_pro then 2 else 1 end;
  select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'kind', q.kind, 'event', q.event, 'title', q.title, 'icon', q.icon,
      'target', q.target, 'reward', q.reward_ruby * v_mult, 'base_reward', q.reward_ruby,
      'progress', _quest_value(v_uid, q),
      'claimed', exists (select 1 from ruby_ledger l where l.user_id = v_uid and l.reason = 'quest'
                          and l.ref = q.id || ':' || _quest_period(q.kind)::text)
    ) order by q.sort_order), '[]'::jsonb)
  into v_list from quests q where q.is_active;

  return jsonb_build_object(
    'day', v_day,
    'ruby', coalesce(v_ruby, 0),
    'is_pro', v_pro,
    'multiplier', v_mult,
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

-- The check-in sheet needs the same multiplier without loading the quest page.
create or replace function public.app_checkin_state() returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row user_login_rewards; v_mult integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into v_row from user_login_rewards where user_id = v_uid order by created_at limit 1;
  v_mult := _pro_multiplier(v_uid);
  return jsonb_build_object(
    'current_day', coalesce(v_row.current_day, 0),
    'total_days', coalesce(v_row.total_days_claimed, 0),
    'claimed_today', coalesce(v_row.last_claim_date = _econ_today(), false),
    'multiplier', v_mult,
    'is_pro', v_mult > 1,
    'ruby', coalesce((select ruby from user_currency where user_id = v_uid), 0),
    'schedule', (select coalesce(jsonb_agg(jsonb_build_object(
                    'day', day_number, 'ruby', coalesce(reward_ruby, 0) * v_mult) order by day_number), '[]'::jsonb)
                 from login_rewards)
  );
end $$;
revoke all on function public.app_checkin_state() from public, anon;
grant execute on function public.app_checkin_state() to authenticated;
