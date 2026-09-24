-- 500 ruby a week, for being PRO.
--
-- Separate from the existing `pro_daily_bonus` (30, claimed by tapping a card
-- on the quest page). That one is an engagement hook — it wants you to come
-- back. This one is part of what the subscription *is*, so it is granted, not
-- claimed: nobody should lose it for not opening the right screen.
--
-- Idempotence comes from `ruby_ledger`'s unique (user_id, reason, ref) and the
-- ISO week as the ref, so calling this a hundred times in a week pays once.
-- ISO weeks, not "7 days since last grant", so everyone's week turns over at
-- the same moment and the reward cannot drift later every time it is claimed.

insert into economy_config (key, value)
values ('pro_weekly_bonus', 500)
on conflict (key) do nothing;

/** `2026-39` — the ISO year and week, in UTC. */
create or replace function public._econ_week()
returns text
language sql
stable
set search_path = public
as $$ select to_char((now() at time zone 'utc'), 'IYYY-IW') $$;

/**
 * Grants this week's PRO ruby if it is due.
 *
 * Returns what happened either way, so the caller can tell the difference
 * between "here is 500" and "already had it" without a second round trip.
 */
create or replace function public.app_pro_weekly()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid  uuid := auth.uid();
    v_week text := _econ_week();
    v_amt  integer := _econ('pro_weekly_bonus', 500);
    v_bal  integer;
    v_ruby integer;
begin
    if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

    select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;

    if not _is_pro(v_uid) then
        return jsonb_build_object('ok', true, 'granted', false, 'reason', 'not_pro',
                                  'amount', v_amt, 'ruby', coalesce(v_ruby, 0), 'week', v_week);
    end if;

    -- Null means the ledger already has this week's row.
    v_bal := _ruby_apply(v_uid, v_amt, 'pro_weekly', v_week);
    if v_bal is null then
        return jsonb_build_object('ok', true, 'granted', false, 'reason', 'already',
                                  'amount', v_amt, 'ruby', coalesce(v_ruby, 0), 'week', v_week);
    end if;

    return jsonb_build_object('ok', true, 'granted', true,
                              'amount', v_amt, 'ruby', v_bal, 'week', v_week);
end $$;

revoke all on function public.app_pro_weekly() from public;
grant execute on function public.app_pro_weekly() to authenticated;
