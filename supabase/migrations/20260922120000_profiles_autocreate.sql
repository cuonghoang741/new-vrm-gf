-- Nobody was creating `profiles` rows.
--
-- The app only ever UPDATEs a profile (AuthManager.updateCountryIfMissing), and
-- there was no trigger on auth.users, so 433 of 444 accounts had no profile at
-- all: no display name, no country — and, because the "new user" Telegram
-- notification hangs off an INSERT on `profiles`, the team never got one.
--
-- On top of that the notifier itself was broken: it passed `body` to
-- pg_net as text while net.http_post takes jsonb, so every insert into
-- `profiles` raised "function net.http_post(...) does not exist" and failed.
--
-- This creates the row on sign-up, makes the notifier match pg_net's signature,
-- and never lets a notification failure block the insert again.

create or replace function public.notify_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  begin
    perform net.http_post(
      url := 'https://kwqqmjfsrgoczbutuisx.supabase.co/functions/v1/handle-new-user',
      body := json_build_object('record', row_to_json(new))::jsonb,   -- jsonb, not text
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    -- A dead webhook must never stop an account from getting a profile.
    raise warning 'notify_new_user failed: %', sqlerrm;
  end;
  return new;
end $$;

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise warning 'create_profile_for_new_user failed: %', sqlerrm;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Backfill the accounts that never got one. The notifier is switched off for
-- this: these are old accounts, and 433 Telegram messages are not a backfill.
alter table public.profiles disable trigger on_new_user_profile;
insert into public.profiles (id, display_name)
select u.id, nullif(trim(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')), '')
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
alter table public.profiles enable trigger on_new_user_profile;
