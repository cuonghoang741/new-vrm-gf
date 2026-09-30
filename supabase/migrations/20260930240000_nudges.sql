-- She texts first. `nudges` holds the "missing you" lines she writes ahead of
-- time (edge function `nudges`), which the app schedules as local
-- notifications when it goes to the background. Opening one delivers it: the
-- function writes it into the conversation as her message, once.
create table if not exists public.nudges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  text         text not null,
  delay_hours  integer not null,
  created_at   timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists nudges_user_char on public.nudges (user_id, character_id, created_at desc);
alter table public.nudges enable row level security;
drop policy if exists "own nudges" on public.nudges;
create policy "own nudges" on public.nudges for select using (auth.uid() = user_id);

alter table public.nudges add column if not exists lang text;
