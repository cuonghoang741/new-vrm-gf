-- Ruby: a starting gift, and roughly double the free earning rate.
--
-- Before: a free player doing everything earned ~100 ruby a day (check-in
-- 5-10, daily quests ~30, bond dailies ~20, five ads at 10), so the first
-- 800-ruby character was ~8 days away and new accounts started at 0.
-- After: 100 ruby on sign-up and ~200 a day, so it is 3-4 days away.

-- ─── 100 ruby when the account is created ──────────────────────────────────
-- Through the ledger like every payout; (user, 'starter', 'starter') is unique
-- there, so it can never be paid twice. A failure must not block sign-up.
create or replace function _grant_starter_ruby() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform _ruby_apply(new.id, 100, 'starter', 'starter');
  return new;
exception when others then
  raise warning '_grant_starter_ruby failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists on_auth_user_starter_ruby on auth.users;
create trigger on_auth_user_starter_ruby
  after insert on auth.users
  for each row execute function _grant_starter_ruby();

-- ─── earning rates ──────────────────────────────────────────────────────────
-- Guarded so that re-running this file does not double them again.
do $$
begin
  if not exists (select 1 from economy_config where key = 'ruby_rates_v2') then
    update login_rewards set reward_ruby = reward_ruby * 2;
    update quests set reward_ruby = reward_ruby * 2 where kind = 'daily';
    update character_quests set reward_ruby = reward_ruby * 2 where kind = 'daily' and not pro_only;
    insert into economy_config (key, value, description)
    values ('ad_reward_ruby', 20, 'Ruby cho mỗi lần xem quảng cáo nhận ruby')
    on conflict (key) do update set value = 20, updated_at = now();
    insert into economy_config (key, value, description)
    values ('ruby_rates_v2', 1, 'Mốc: đã nhân đôi thưởng ruby (2026-09-30)');
  end if;
end $$;
