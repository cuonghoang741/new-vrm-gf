-- Three free minutes of 3D, once per account.
--
-- 3D is the thing PRO is for, and a free user has never seen it — the toggle
-- just opens the paywall. So the first time they reach the play screen they
-- are given three minutes of it, and the toggle counts down in front of them.
--
-- Kept server-side rather than in SecureStore because the grant is worth
-- something: a local flag is cleared by a reinstall, and then the trial is
-- unlimited for anyone willing to tap "delete app".

create table if not exists public.user_trials (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, kind)
);

alter table public.user_trials enable row level security;
drop policy if exists user_trials_select_self on public.user_trials;
create policy user_trials_select_self on public.user_trials
  for select to authenticated using (user_id = auth.uid());
-- Writes go through the RPC; the client may not grant itself a trial.
revoke insert, update, delete on public.user_trials from anon, authenticated;

/**
 * The 3D trial, as one call.
 *
 * `p_start` false just reads the state, which is what the play screen does on
 * open. True claims it, and is idempotent: a second call returns the same
 * expiry rather than extending it, so a re-render or a retry cannot buy more
 * time.
 */
create or replace function public.app_3d_trial(p_start boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := 3;
  t user_trials;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;

  select * into t from user_trials where user_id = v_uid and kind = '3d';

  if t.user_id is null and p_start then
    insert into user_trials (user_id, kind, expires_at)
    values (v_uid, '3d', now() + make_interval(mins => v_minutes))
    on conflict (user_id, kind) do nothing
    returning * into t;
    if t.user_id is null then
      select * into t from user_trials where user_id = v_uid and kind = '3d';
    end if;
  end if;

  if t.user_id is null then
    return jsonb_build_object('ok', true, 'claimed', false, 'remaining', 0,
                              'minutes', v_minutes);
  end if;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'expires_at', t.expires_at,
    'remaining', greatest(0, floor(extract(epoch from (t.expires_at - now())))::int),
    'minutes', v_minutes
  );
end $$;

revoke all on function public.app_3d_trial(boolean) from public, anon;
grant execute on function public.app_3d_trial(boolean) to authenticated;
