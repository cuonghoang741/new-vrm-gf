-- The 3D trial goes from three minutes to five.
--
-- Three was barely enough to find the camera controls before the paywall came
-- back. The length lives only in v_minutes; the app reads it from the RPC, so
-- every installed version shows the new number. Trials already started keep
-- the expiry they were given.

create or replace function public.app_3d_trial(p_start boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_minutes int := 5;
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
