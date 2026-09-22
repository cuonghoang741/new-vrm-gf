-- Make sure every unlock case actually exists in the data.
--
-- The four cases the app must handle, from (tier, price_ruby):
--   free + no price  → watch an ad
--   free + price     → pay ruby
--   pro  + no price  → be PRO
--   pro  + price     → be PRO, then pay ruby
--
-- Before this, costumes had only two of the four and dances and characters
-- were each missing one, so three of the paths had never been exercised
-- against real rows.

-- ─── costumes: had only free/no-price and pro/no-price ──────────────────────
-- Never touch the first outfit of a character: `unlock_type = 'default'` keeps
-- it free regardless of tier, and every character must keep one.
with pick as (
  select id, row_number() over (partition by tier order by costume_name) rn
    from character_costumes
   where coalesce(unlock_type, '') <> 'default'
     and costume_name not ilike '%nude%'
     and tier = 'free'
)
update character_costumes c set price_ruby = 120
  from pick where pick.id = c.id and pick.rn <= 8;

with pick as (
  select id, row_number() over (order by costume_name) rn
    from character_costumes
   where coalesce(unlock_type, '') <> 'default'
     and costume_name not ilike '%nude%'
     and tier = 'pro'
)
update character_costumes c set price_ruby = 200
  from pick where pick.id = c.id and pick.rn <= 8;

-- ─── dances: had no free+price row ──────────────────────────────────────────
with pick as (
  select id, row_number() over (order by name) rn
    from dances where tier = 'free' and coalesce(price_ruby, 0) = 0
)
update dances d set price_ruby = 80
  from pick where pick.id = d.id and pick.rn <= 3;

-- ─── characters: had no free+no-price row ───────────────────────────────────
-- `price_ruby` is NULL-or-positive by check constraint, so "no price" is NULL.
-- One genuinely free character so a new user is never staring at a wall of
-- locks on their first open.
with pick as (
  select id, row_number() over (order by "order") rn
    from characters
   where tier = 'free' and coalesce(price_ruby, 0) > 0 and available
)
update characters c set price_ruby = null
  from pick where pick.id = c.id and pick.rn <= 2;

-- ─── the eight new characters ───────────────────────────────────────────────
-- They shipped as pro + 350 ruby, which under the rules above means "subscribe
-- AND pay". That is a fine tier for a couple of showpieces but not for all
-- eight, so most become plain PRO and two keep the price as premium unlocks.
update characters set price_ruby = null
 where name in ('Mira', 'Tilda', 'Kione', 'Selene', 'Aoi', 'Shiori');
update characters set price_ruby = 350
 where name in ('Nerine', 'Yura');
