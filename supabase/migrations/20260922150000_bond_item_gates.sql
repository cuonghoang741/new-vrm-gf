-- Level gates on individual items, and a correction to what level 4 means.
--
-- Video calls, media requests and secret media are NOT a reward for grinding:
-- they are what people came for, and holding them back reads as a shakedown.
-- They open at level 1. Level 4 is instead about how she *talks* — the same
-- features, a much less guarded voice.

update bond_capabilities set min_level = 1 where code in ('video_call', 'media_request', 'sensitive');

-- Level 4's actual unlock: she drops the filter and flirts explicitly. This is
-- a tone applied to her chat prompt server-side, not a content gate.
insert into bond_capabilities (code, min_level, pro_only) values ('intimate_chat', 4, false)
on conflict (code) do update set min_level = 4, pro_only = false;

-- ─── per-item level gates ───────────────────────────────────────────────────
alter table character_costumes add column if not exists unlock_at_level smallint not null default 1
  check (unlock_at_level between 1 and 5);
alter table backgrounds        add column if not exists unlock_at_level smallint not null default 1
  check (unlock_at_level between 1 and 5);
alter table dances             add column if not exists unlock_at_level smallint not null default 1
  check (unlock_at_level between 1 and 5);

comment on column character_costumes.unlock_at_level is
  'Bond level with THIS character before the outfit can be worn. 1 = always.';
comment on column backgrounds.unlock_at_level is
  'Bond level with the active character before the background can be used. 1 = always.';
comment on column dances.unlock_at_level is
  'Bond level with the active character before the dance can be played. 1 = always.';

-- ─── seed the gates ─────────────────────────────────────────────────────────
-- Costumes: the first outfit of every character always stays free, so nobody is
-- ever locked out of dressing her at all. The rest ladder up 2..4, which gives
-- each level-up something visible to show for itself.
with ranked as (
  select id, row_number() over (partition by character_id order by costume_name) as n
    from character_costumes
)
update character_costumes c
   set unlock_at_level = case ranked.n
                           when 1 then 1
                           when 2 then 2
                           when 3 then 3
                           else 4
                         end
  from ranked
 where ranked.id = c.id;

-- A nude/secret outfit is not a level reward — it is PRO's, and gating it twice
-- would punish someone who already paid.
update character_costumes set unlock_at_level = 1
 where costume_name ilike '%nude%' or costume_name ilike '%secret%';

-- Backgrounds: roughly a third stay open, the rest spread over levels 2..4,
-- ordered by name so the split is stable rather than random per deploy.
with ranked as (
  select id, ntile(6) over (order by name) as bucket from backgrounds
)
update backgrounds b
   set unlock_at_level = case ranked.bucket
                           when 1 then 1 when 2 then 1
                           when 3 then 2 when 4 then 2
                           when 5 then 3
                           else 4
                         end
  from ranked
 where ranked.id = b.id;

-- Dances: a handful free, the showy ones late. Level 5 gets the two rarest, so
-- reaching max with a character visibly changes what she can do.
with ranked as (
  select id, ntile(5) over (order by name) as bucket from dances
)
update dances d
   set unlock_at_level = case ranked.bucket
                           when 1 then 1
                           when 2 then 2
                           when 3 then 3
                           when 4 then 4
                           else 5
                         end
  from ranked
 where ranked.id = d.id;
