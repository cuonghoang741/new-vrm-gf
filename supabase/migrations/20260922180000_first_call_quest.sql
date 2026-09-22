-- "Call her for three minutes" — a one-off 500 ruby reward.
--
-- Deliberately `unique`, not `daily`: 500 ruby is roughly four days of every
-- other source combined, so as a repeatable daily it would be the only quest
-- anyone ever did and the ruby packs would stop meaning anything. As a one-off
-- per character it is a strong push into the feature that most needs a first
-- try, and it stays a story beat rather than a treadmill.
insert into character_quests
  (character_id, kind, code, event, target, reward_xp, reward_ruby, sort)
values
  (null, 'unique', 'first_voice_3m', 'voice_minute', 3, 150, 500, 0)
on conflict (character_id, code) do update
  set target = excluded.target,
      reward_xp = excluded.reward_xp,
      reward_ruby = excluded.reward_ruby,
      event = excluded.event,
      kind = excluded.kind,
      sort = excluded.sort,
      is_active = true;
