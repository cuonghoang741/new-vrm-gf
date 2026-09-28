-- `_is_pro` lost the privilege branch, so a privileged account got no PRO perk.
--
-- 20260922100000 defined it as "privileged_users OR an active subscription".
-- 20260922140100 (bond functions) redefined the same function to add 'trialing'
-- and kept only the subscription half — the privilege branch was dropped by
-- accident, and being the later migration it won.
--
-- `app_redeem_privilege` writes to `privileged_users` and nothing else, so from
-- then on the server never saw a privileged account as PRO. The client shows
-- PRO from its own state, which is why this looked like it worked: the badge
-- appeared, and every server-side perk silently did nothing.
--
-- Everything gated on this function was affected for privileged accounts:
--   app_pro_weekly        the 500 ruby was never granted ('not_pro')
--   _reward_mult          quests and check-in paid ×1 instead of ×2
--   call_quota_guard      30s of calls per day instead of 3600s
--   app_bond_track        PRO bond bonus not applied
--
-- The subscription half is left exactly as it is. It works, and tightening it
-- would change who counts as PRO: 1 active row has `tier = null`, so restoring
-- the original `tier = 'pro'` test would take PRO away from that account.
--
-- The privilege half now joins `privilege_credentials` and requires `is_active`.
-- The original did not, but the CMS toggle promises it does — Privilege.tsx
-- asks "Tắt X? N tài khoản đang PRO nhờ nó sẽ mất PRO." Without the join that
-- sentence is false and a leaked review login keeps PRO forever.
create or replace function public._is_pro(p_uid uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from subscriptions
     where user_id = p_uid and status in ('active', 'trialing')
       and (expires_at is null or expires_at > now())
  ) or exists (
    select 1
      from privileged_users pu
      join privilege_credentials pc on pc.id = pu.credential_id
     where pu.user_id = p_uid and pc.is_active
  );
$$;

revoke all on function public._is_pro(uuid) from public, anon, authenticated;
