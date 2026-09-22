-- Voice-call quota: the app meters calls itself and writes the remaining
-- seconds back, and RLS let it write ANY value — one upsert of
-- remaining_seconds = 999999 was unlimited free calls. Deleting the row and
-- letting the app re-create it also reset the free allowance.
--
-- From here the client can only spend quota, never add it:
--   * INSERT from the app is capped at the starting allowance (PRO: 3600 s,
--     matching CallQuotaService; free: 30 s).
--   * UPDATE from the app can only lower remaining_seconds.
--   * The app can no longer DELETE its row.
-- The RevenueCat webhook (service role) is unaffected and still grants PRO time.

create or replace function public._guard_call_quota() returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_cap integer;
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;                      -- service role / SQL: trusted
  end if;
  if tg_op = 'INSERT' then
    v_cap := case when _is_pro(new.user_id) then 3600 else 30 end;
    new.remaining_seconds := least(greatest(coalesce(new.remaining_seconds, 0), 0), v_cap);
  else
    new.user_id := old.user_id;
    new.remaining_seconds := least(greatest(coalesce(new.remaining_seconds, 0), 0), old.remaining_seconds);
    new.last_reset_at := old.last_reset_at;
  end if;
  return new;
end $$;

drop trigger if exists guard_call_quota on public.user_call_quota;
create trigger guard_call_quota before insert or update on public.user_call_quota
  for each row execute function public._guard_call_quota();

drop policy if exists "Users can delete own call quota" on public.user_call_quota;
revoke delete, truncate on public.user_call_quota from anon, authenticated;
