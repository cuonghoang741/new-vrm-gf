-- Pay every PRO week, not just the one they happened to open the app in.
--
-- The first version granted the current ISO week and nothing else, so a
-- subscriber who did not launch the app for a fortnight simply lost those
-- weeks. They paid for them. This walks back over recent weeks and pays each
-- one the subscription actually covered.
--
-- Each week is its own ledger row keyed by its own ISO week, so the unique
-- (user_id, reason, ref) index still makes the whole thing idempotent — run it
-- twice in a row and the second run grants nothing.
--
-- Bounded at `pro_weekly_backfill_weeks` (8). Someone returning after a year
-- of an auto-renewing subscription should get a welcome back, not a windfall
-- large enough to buy the catalogue outright; if that ever comes up it is a
-- support conversation, not a silent 26,000 ruby.

insert into economy_config (key, value)
values ('pro_weekly_backfill_weeks', 8)
on conflict (key) do nothing;

create or replace function public.app_pro_weekly()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_uid    uuid := auth.uid();
    v_amt    integer := _econ('pro_weekly_bonus', 500);
    v_cap    integer := _econ('pro_weekly_backfill_weeks', 8);
    v_ruby   integer;
    v_bal    integer;
    v_total  integer := 0;
    v_weeks  integer := 0;
    v_monday date;
    v_ref    text;
    i        integer;
begin
    if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

    select coalesce(ruby, 0) into v_ruby from user_currency where user_id = v_uid;
    v_ruby := coalesce(v_ruby, 0);

    -- Oldest first, so the ledger reads in the order the weeks happened.
    for i in reverse (v_cap - 1) .. 0 loop
        -- Monday 00:00 UTC of that week.
        v_monday := (date_trunc('week', (now() at time zone 'utc') - make_interval(weeks => i)))::date;
        v_ref := to_char(v_monday, 'IYYY-IW');

        -- Was the subscription live at any point during that week? `started_at`
        -- can be null on rows written before it existed, hence the fallback to
        -- `created_at` — treating "unknown start" as "already running" only
        -- ever pays a week they were plausibly subscribed for.
        if not exists (
            select 1 from subscriptions s
             where s.user_id = v_uid
               and s.status in ('active', 'trialing')
               and coalesce(s.started_at, s.created_at, v_monday) < v_monday + 7
               and (s.expires_at is null or s.expires_at >= v_monday)
        ) then
            continue;
        end if;

        v_bal := _ruby_apply(v_uid, v_amt, 'pro_weekly', v_ref);
        if v_bal is not null then
            v_ruby := v_bal;
            v_total := v_total + v_amt;
            v_weeks := v_weeks + 1;
        end if;
    end loop;

    return jsonb_build_object(
        'ok', true,
        'granted', v_weeks > 0,
        'weeks', v_weeks,
        'amount', v_total,
        'weekly', v_amt,
        'ruby', v_ruby,
        'week', _econ_week()
    );
end $$;

revoke all on function public.app_pro_weekly() from public;
grant execute on function public.app_pro_weekly() to authenticated;
