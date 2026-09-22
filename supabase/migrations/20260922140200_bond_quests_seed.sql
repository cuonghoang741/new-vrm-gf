-- The quest pools.
--
-- Daily quests are templates (character_id null): every character offers the
-- same pool, and each user is shown a different three per character per day,
-- picked by hash in `_bond_is_offered`. Two characters therefore never ask for
-- the same three things on the same day, which is the point — the app should
-- feel like eight people, not one person wearing eight faces.

insert into character_quests (character_id, kind, code, event, target, reward_xp, reward_ruby, sort) values
  (null, 'daily', 'chat_10',    'chat_message',     10, 25, 5, 1),
  (null, 'daily', 'chat_25',    'chat_message',     25, 40, 8, 2),
  (null, 'daily', 'outfit_1',   'change_outfit',     1, 20, 5, 3),
  (null, 'daily', 'outfit_3',   'change_outfit',     3, 35, 8, 4),
  (null, 'daily', 'bg_2',       'change_background', 2, 20, 5, 5),
  (null, 'daily', 'dance_1',    'dance',             1, 25, 5, 6),
  (null, 'daily', 'dance_3',    'dance',             3, 40, 8, 7),
  (null, 'daily', 'gallery_1',  'open_gallery',      1, 20, 5, 8),
  (null, 'daily', 'voice_3',    'voice_minute',      3, 35, 8, 9),
  (null, 'daily', 'video_2',    'video_minute',      2, 40, 10, 10),
  (null, 'daily', 'checkin_1',  'checkin',           1, 25, 5, 11)
on conflict (character_id, code) do update
  set target = excluded.target, reward_xp = excluded.reward_xp,
      reward_ruby = excluded.reward_ruby, event = excluded.event;

-- ─── hidden quests ──────────────────────────────────────────────────────────
-- Never listed. They surface only once finished, so finding one feels like
-- catching the app being alive rather than ticking a box someone showed you.
insert into character_quests (character_id, kind, code, event, target, reward_xp, reward_ruby, is_secret, sort) values
  (null, 'hidden', 'night_owl',   'chat_night',     15, 150, 40, true, 1),
  (null, 'hidden', 'marathon',    'chat_message',  100, 250, 60, true, 2),
  (null, 'hidden', 'long_call',   'voice_minute',   20, 200, 50, true, 3),
  (null, 'hidden', 'devoted',     'streak_day',      7, 300, 80, true, 4),
  (null, 'hidden', 'wardrobe',    'change_outfit',  30, 200, 50, true, 5)
on conflict (character_id, code) do update
  set target = excluded.target, reward_xp = excluded.reward_xp,
      reward_ruby = excluded.reward_ruby, is_secret = true;

-- ─── unique, per character ──────────────────────────────────────────────────
-- One-off and flavoured, so the grind toward level 5 reads as getting to know
-- one specific person. Seeded for the eight new characters; everyone else keeps
-- the shared daily and hidden pools until they get their own.
do $$
declare
  v record;
  spec jsonb := '[
    {"name":"Mira",   "code":"mira_council",  "event":"chat_message",  "target":40, "xp":200, "ruby":50},
    {"name":"Nerine", "code":"nerine_moon",   "event":"chat_night",    "target":10, "xp":220, "ruby":55},
    {"name":"Tilda",  "code":"tilda_dawn",    "event":"checkin",        "target":5, "xp":200, "ruby":50},
    {"name":"Kione",  "code":"kione_set",     "event":"dance",         "target":10, "xp":220, "ruby":55},
    {"name":"Selene", "code":"selene_stars",  "event":"chat_night",     "target":7, "xp":200, "ruby":50},
    {"name":"Aoi",    "code":"aoi_rival",     "event":"voice_minute",  "target":15, "xp":220, "ruby":55},
    {"name":"Yura",   "code":"yura_recital",  "event":"change_outfit",  "target":8, "xp":200, "ruby":50},
    {"name":"Shiori", "code":"shiori_shelf",  "event":"open_gallery",  "target":12, "xp":200, "ruby":50}
  ]'::jsonb;
  item jsonb;
begin
  for item in select * from jsonb_array_elements(spec) loop
    select id into v from characters where name = item->>'name' limit 1;
    if v.id is not null then
      insert into character_quests
        (character_id, kind, code, event, target, reward_xp, reward_ruby, sort)
      values (v.id, 'unique', item->>'code', item->>'event',
              (item->>'target')::int, (item->>'xp')::int, (item->>'ruby')::int, 1)
      on conflict (character_id, code) do update
        set target = excluded.target, reward_xp = excluded.reward_xp,
            reward_ruby = excluded.reward_ruby;
    end if;
  end loop;
end $$;

-- ─── difficulty per character ───────────────────────────────────────────────
-- Spread across the range so the roster has both a warm easy start and a
-- genuinely long climb. Reserved/aloof personalities are the hard ones, which
-- is also how they read in their own descriptions.
update characters set difficulty = 1 where name in ('Tilda', 'Aoi');
update characters set difficulty = 2 where name in ('Mira', 'Selene');
update characters set difficulty = 3 where name in ('Yura');
update characters set difficulty = 4 where name in ('Shiori', 'Kione');
update characters set difficulty = 5 where name in ('Nerine');
