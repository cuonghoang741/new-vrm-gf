-- Bond levels: per-character progression, 1..5, with per-character difficulty.
--
-- Why a new set of tables rather than the existing `level_definitions` /
-- `character_relationship`: those are a dead 100-level design from 2025-11 with
-- XP in the hundreds of thousands. Nothing in the app reads them any more (only
-- AuthManager's delete list names them), and their stored levels would be
-- nonsense on a 1..5 scale. They are left untouched here.
--
-- The server owns every number in this file. The client may ask what the state
-- is and report that an event happened; it never says what level someone is,
-- how much XP they have, or whether a capability is unlocked.

-- ─── difficulty on the character ────────────────────────────────────────────
alter table characters
  add column if not exists difficulty smallint not null default 2
    check (difficulty between 1 and 5);

comment on column characters.difficulty is
  'How hard she is to bond with, 1 (easy) .. 5 (very hard). Scales every XP threshold.';

-- ─── what each level is, and what it opens ──────────────────────────────────
create table if not exists bond_levels (
  level        smallint primary key check (level between 1 and 5),
  title_key    text not null,     -- i18n key, e.g. 'bond.lv2'
  -- Cumulative XP to REACH this level at difficulty 1. Scaled per character.
  base_xp      integer not null check (base_xp >= 0),
  unlocks_key  text not null      -- i18n key describing the unlocks
);

insert into bond_levels (level, title_key, base_xp, unlocks_key) values
  (1, 'bond.lv1', 0,    'bond.lv1_unlocks'),
  (2, 'bond.lv2', 120,  'bond.lv2_unlocks'),
  (3, 'bond.lv3', 360,  'bond.lv3_unlocks'),
  (4, 'bond.lv4', 840,  'bond.lv4_unlocks'),
  (5, 'bond.lv5', 1800, 'bond.lv5_unlocks')
on conflict (level) do update
  set title_key = excluded.title_key,
      base_xp = excluded.base_xp,
      unlocks_key = excluded.unlocks_key;

-- ─── capabilities gated behind a level ──────────────────────────────────────
-- Owning a costume is not the same as being close enough to her to ask for it.
-- `pro_only` stacks on top: free camera needs BOTH level 5 and PRO.
create table if not exists bond_capabilities (
  code       text primary key,
  min_level  smallint not null check (min_level between 1 and 5),
  pro_only   boolean not null default false
);

insert into bond_capabilities (code, min_level, pro_only) values
  ('change_background', 1, false),
  ('change_costume',    2, false),
  ('gallery',           2, false),
  ('dance',             3, false),
  ('voice_call',        3, false),
  ('video_call',        4, false),
  ('media_request',     4, false),
  ('sensitive',         4, false),
  -- The level-5 prize: orbit the model freely. PRO on top of the grind.
  ('free_camera',       5, true)
on conflict (code) do update
  set min_level = excluded.min_level, pro_only = excluded.pro_only;

-- ─── per-user, per-character progress ───────────────────────────────────────
create table if not exists user_bond (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  xp           integer not null default 0 check (xp >= 0),
  level        smallint not null default 1 check (level between 1 and 5),
  -- Per-UTC-day XP already granted per event, so caps survive app restarts.
  day          date,
  day_xp       jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (user_id, character_id)
);

alter table user_bond enable row level security;

drop policy if exists user_bond_self on user_bond;
create policy user_bond_self on user_bond
  for select using (auth.uid() = user_id);
-- No insert/update policy on purpose: only the SECURITY DEFINER functions write.

-- ─── quests ─────────────────────────────────────────────────────────────────
-- character_id null  → a template in the shared daily pool, offered for every
--                      character. Anything else belongs to that character.
create table if not exists character_quests (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid references characters(id) on delete cascade,
  kind         text not null check (kind in ('daily', 'unique', 'hidden')),
  code         text not null,
  event        text not null,
  target       integer not null default 1 check (target > 0),
  reward_xp    integer not null default 0 check (reward_xp >= 0),
  reward_ruby  integer not null default 0 check (reward_ruby >= 0),
  -- Hidden quests stay invisible until they are actually finished.
  is_secret    boolean not null default false,
  sort         integer not null default 0,
  is_active    boolean not null default true,
  unique (character_id, code)
);

create table if not exists user_character_quests (
  user_id      uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  quest_id     uuid not null references character_quests(id) on delete cascade,
  -- 'YYYY-MM-DD' for daily, 'once' for unique/hidden.
  period       text not null,
  progress     integer not null default 0,
  claimed_at   timestamptz,
  primary key (user_id, quest_id, period)
);

alter table user_character_quests enable row level security;
drop policy if exists ucq_self on user_character_quests;
create policy ucq_self on user_character_quests
  for select using (auth.uid() = user_id);

create index if not exists ucq_lookup
  on user_character_quests (user_id, character_id, period);
