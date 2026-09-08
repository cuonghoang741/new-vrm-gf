-- Permanent "watch one rewarded ad, keep it forever" unlocks for free assets.
-- Applied to the TrueFeel project on 2026-09-08.
--
-- The client mirrors this in SecureStore so the gate still works before
-- sign-in and offline; this table is the record of truth, so unlocks follow
-- the account onto a new device or a reinstall.

create table if not exists public.user_unlocks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  asset_type  text not null check (asset_type in ('character','costume','background')),
  asset_id    uuid not null,
  created_at  timestamptz not null default now(),
  -- One row per asset per user; the client upserts on this.
  unique (user_id, asset_type, asset_id)
);

create index if not exists user_unlocks_user_idx on public.user_unlocks (user_id);

alter table public.user_unlocks enable row level security;

-- A user may only ever see and add their own unlocks. No update or delete
-- policy exists: an unlock is earned and permanent, so the client has no
-- reason to revoke one.
drop policy if exists user_unlocks_select_own on public.user_unlocks;
create policy user_unlocks_select_own on public.user_unlocks
  for select using (auth.uid() = user_id);

drop policy if exists user_unlocks_insert_own on public.user_unlocks;
create policy user_unlocks_insert_own on public.user_unlocks
  for insert with check (auth.uid() = user_id);
