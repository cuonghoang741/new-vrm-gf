-- Security hardening: close the admin self-promotion hole and the 14 tables
-- that were readable AND writable by anyone holding the anon key.
--
-- The anon key ships inside every app build, so "anon" means "anyone on the
-- internet". Before this migration:
--
--   * profiles_update_own let every signed-in user UPDATE their own profile row
--     with no column restriction — including is_admin. is_admin() then returned
--     true and the cms_admin_all policies opened full write/delete on
--     characters, costumes, backgrounds, medias and translations.
--   * 14 tables had RLS disabled while anon/authenticated held INSERT, UPDATE,
--     DELETE and TRUNCATE on them.
--
-- Reads are deliberately preserved for every table a client might read today:
-- app versions already installed on phones cannot be updated by this change,
-- so "the current code doesn't read it" is not proof no client does.
--
-- Server code (edge functions with the service role, pg_cron, SECURITY
-- DEFINER functions owned by postgres) bypasses RLS and is unaffected.

begin;

-- ─── 1. is_admin can only be changed by the server ──────────────────────────
-- A trigger rather than column privileges: the app updates other profile
-- columns with a table-level UPDATE grant, and revoking that would mean
-- re-granting every column by hand (and silently breaking any new column).
create or replace function public.protect_profile_is_admin()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- JWT requests from the app/CMS carry role anon or authenticated. The SQL
  -- editor, migrations and the service role do not, and may change it.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_admin := false;
    elsif new.is_admin is distinct from old.is_admin then
      raise exception 'is_admin can only be changed by the server'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_is_admin on public.profiles;
create trigger protect_profile_is_admin
  before insert or update on public.profiles
  for each row execute function public.protect_profile_is_admin();

-- ─── 2. Reference / config tables: public read, admin write ─────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'game_config', 'login_rewards', 'daily_quests', 'medals', 'medal_requirements',
    'quest_categories', 'relationship_stages', 'relationship_tree_paths',
    'notification_templates', 'notification_messages'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true)', t);
    execute format('drop policy if exists cms_admin_all on public.%I', t);
    execute format('create policy cms_admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- ─── 3. Server-internal tables: no client access at all ─────────────────────
-- notification_logs holds external user ids; function_schedule_control is
-- cron bookkeeping; messages is an empty legacy table. With RLS on and no
-- policy, anon/authenticated get nothing; the service role still does.
alter table public.function_schedule_control enable row level security;
alter table public.notification_logs enable row level security;
alter table public.messages enable row level security;

drop policy if exists cms_admin_read on public.notification_logs;
create policy cms_admin_read on public.notification_logs
  for select to authenticated using (public.is_admin());

-- ─── 4. api_characters: user-owned rows ─────────────────────────────────────
alter table public.api_characters enable row level security;
drop policy if exists api_characters_read on public.api_characters;
create policy api_characters_read on public.api_characters
  for select to anon, authenticated
  using (coalesce(is_public, false) or user_id = (select auth.uid()));
drop policy if exists api_characters_write_own on public.api_characters;
create policy api_characters_write_own on public.api_characters
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── 5. TRUNCATE is not subject to RLS at all ───────────────────────────────
-- Not reachable over PostgREST today, but there is no reason for a client role
-- to hold it on any of these tables.
revoke truncate on
  public.api_characters, public.daily_quests, public.function_schedule_control,
  public.game_config, public.login_rewards, public.medal_requirements, public.medals,
  public.messages, public.notification_logs, public.notification_messages,
  public.notification_templates, public.quest_categories, public.relationship_stages,
  public.relationship_tree_paths
from anon, authenticated;

commit;
