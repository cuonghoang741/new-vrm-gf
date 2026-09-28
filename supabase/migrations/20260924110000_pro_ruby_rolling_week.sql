-- PRO ruby: one grant per rolling 7 days, and one faucet instead of two.
--
-- 1) The ISO week was exploitable once the paywall started selling a WEEKLY
--    plan. Subscribing on Sunday evening paid `2026-38`; Monday morning is a
--    new ISO week, so the same seven paid days paid `2026-39` too. One week of
--    money, two weeks of ruby. The grant is now due when the last one is more
--    than 7 days old, per user, so a paid week can only ever pay once.
--
-- 2) `pro_daily_bonus` (30, tapped on the quest page) and `pro_weekly_bonus`
--    (500, granted) were two separate PRO ruby faucets, which made "what do I
--    get for subscribing" impossible to state in one line. They are merged
--    into one: the weekly grant stays at 500 and the daily card is switched off
--    by setting its amount to 0. What PRO gives is now one sentence: 500 ruby
--    a week, plus double rewards on quests and check-in.

update economy_config set value = 500 where key = 'pro_weekly_bonus';
update economy_config set value = 0   where key = 'pro_daily_bonus';

insert into economy_config (key, value, description)
values ('pro_week_days', 7, 'So ngay giua hai lan cap ruby PRO')
on conflict (key) do nothing;

/**
 * Grants the PRO ruby if the last grant is older than `pro_week_days`.
 *
 * `ref` is the UTC date of the grant, so the ledger's unique
 * (user_id, reason, ref) still collapses two calls made on the same day, and
 * the 7-day check does the rest.
 */
create or replace function public.app_pro_weekly()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid   uuid := auth.uid();
    v_amt   integer := _econ('pro_weekly_bonus', 500);
    v_days  integer := _econ('pro_week_days', 7);
    v_last  timestamptz;
    v_next  timestamptz;
    v_bal   integer;
    v_ruby  integer;
begin
    if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

    select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;

    select max(created_at) into v_last
      from ruby_ledger where user_id = v_uid and reason = 'pro_weekly';
    v_next := v_last + make_interval(days => v_days);

    if not _is_pro(v_uid) then
        return jsonb_build_object('ok', true, 'granted', false, 'reason', 'not_pro',
                                  'amount', v_amt, 'ruby', coalesce(v_ruby, 0), 'next_at', v_next);
    end if;

    if v_last is not null and v_next > now() then
        return jsonb_build_object('ok', true, 'granted', false, 'reason', 'already',
                                  'amount', v_amt, 'ruby', coalesce(v_ruby, 0), 'next_at', v_next);
    end if;

    -- Null means a grant already landed today: two devices, one paid week.
    v_bal := _ruby_apply(v_uid, v_amt, 'pro_weekly', to_char((now() at time zone 'utc'), 'YYYY-MM-DD'));
    if v_bal is null then
        return jsonb_build_object('ok', true, 'granted', false, 'reason', 'already',
                                  'amount', v_amt, 'ruby', coalesce(v_ruby, 0),
                                  'next_at', coalesce(v_next, now() + make_interval(days => v_days)));
    end if;

    return jsonb_build_object('ok', true, 'granted', true, 'amount', v_amt, 'ruby', v_bal,
                              'next_at', now() + make_interval(days => v_days));
end $$;

revoke all on function public.app_pro_weekly() from public;
grant execute on function public.app_pro_weekly() to authenticated;

/**
 * The daily PRO card is retired: PRO ruby is the weekly grant alone.
 * Kept as a function that pays nothing, so an older build that still has the
 * button gets a clean "nothing to claim" instead of an error dialog.
 */
create or replace function public.app_claim_pro_bonus() returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_ruby integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;
  return jsonb_build_object('ok', true, 'reward', 0, 'ruby', coalesce(v_ruby, 0), 'retired', true);
end $$;
revoke all on function public.app_claim_pro_bonus() from public, anon;
grant execute on function public.app_claim_pro_bonus() to authenticated;
