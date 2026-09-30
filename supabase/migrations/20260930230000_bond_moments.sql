-- A moment at each bond level: when she reaches a level she says something
-- that only happens once (Lv2 a secret, Lv3 a nickname for you, Lv4 a
-- confession, Lv5 a vow). Written by the `bond-moment` edge function, which
-- checks the stored level first; one row per user, character and level, so a
-- moment is never generated twice. The Lv3 nickname is read by the chat.
create table if not exists public.bond_moments (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  level        smallint not null check (level between 2 and 5),
  message      text not null,
  nickname     text,
  created_at   timestamptz not null default now(),
  primary key (user_id, character_id, level)
);
alter table public.bond_moments enable row level security;
drop policy if exists "own moments" on public.bond_moments;
create policy "own moments" on public.bond_moments for select using (auth.uid() = user_id);
