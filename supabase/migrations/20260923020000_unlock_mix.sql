-- Thin out the locks so each catalogue reads as a shop, not a wall.
--
-- Before this, 45 of 69 backgrounds and 18 of 23 dances were level-gated, and
-- "watch an ad" was spread over 27 costumes and 9 dances — so the ad reward
-- felt like the default way to get anything, and the level gate stopped
-- meaning "this one is special".
--
-- After: dances keep 3 level gates, backgrounds keep 5, and every section
-- offers exactly ONE item behind an ad (costumes: one per character). What
-- used to be an ad unlock becomes a ruby unlock, so the item is still
-- obtainable without PRO — just through the economy instead of the ad slot.
--
-- Media had no middle ground at all (free or PRO, nothing priced), so each
-- character now gets up to two ad items and two ruby items among its visible
-- rows, with the rest left to PRO.

do $$
declare
  v_msg text := '';
  n int;
begin
  -- ── dances: 3 level gates ────────────────────────────────────────────────
  with keep as (
    select id from dances where unlock_at_level > 1
     order by unlock_at_level desc, coalesce(price_ruby, 0) desc, id
     limit 3
  )
  update dances set unlock_at_level = 1
   where unlock_at_level > 1 and id not in (select id from keep);

  -- ── dances: exactly one ad ───────────────────────────────────────────────
  with keep as (
    select id from dances
     where unlock_type = 'ads'
     order by coalesce(price_ruby, 0), sort_order, id
     limit 1
  )
  update dances
     set unlock_type = 'ruby',
         price_ruby = coalesce(nullif(price_ruby, 0), 250)
   where unlock_type = 'ads' and id not in (select id from keep);

  -- The kept one is an ad unlock and nothing else: no price, no PRO tier.
  -- (dances.price_ruby is NOT NULL, so 0 is how "no price" is spelled there.)
  update dances set tier = 'free', price_ruby = 0
   where unlock_type = 'ads';

  -- ── backgrounds: 5 level gates ───────────────────────────────────────────
  with keep as (
    select id from backgrounds where unlock_at_level > 1
     order by unlock_at_level desc, coalesce(price_ruby, 0) desc, id
     limit 5
  )
  update backgrounds set unlock_at_level = 1
   where unlock_at_level > 1 and id not in (select id from keep);

  -- ── backgrounds: exactly one ad (there were none) ────────────────────────
  if not exists (select 1 from backgrounds where unlock_type = 'ads') then
    update backgrounds
       set unlock_type = 'ads', tier = 'free', price_ruby = null
     where id = (
       select id from backgrounds
        where coalesce(price_ruby, 0) > 0 and unlock_at_level <= 1
        order by price_ruby, id
        limit 1
     );
  end if;

  -- ── costumes: one ad per character ───────────────────────────────────────
  with keep as (
    select distinct on (character_id) id
      from character_costumes
     where unlock_type = 'ads'
     order by character_id, coalesce(price_ruby, 0), id
  )
  update character_costumes
     set unlock_type = 'ruby',
         price_ruby = coalesce(nullif(price_ruby, 0), 200)
   where unlock_type = 'ads' and id not in (select id from keep);

  update character_costumes set tier = 'free', price_ruby = null
   where unlock_type = 'ads';

  -- ── media: two ad rows and two ruby rows per character ───────────────────
  -- Media has no unlock_type column; the client reads tier + price, so
  -- "free with no price" is what renders as an ad unlock.
  with ranked as (
    select id, row_number() over (partition by character_id order by created_at, id) rn
      from medias
     where not should_hide
  )
  update medias m
     set tier = case when r.rn <= 2 then 'free' when r.rn <= 4 then 'free' else m.tier end,
         price_ruby = case when r.rn <= 2 then null
                           when r.rn <= 4 then 150
                           else m.price_ruby end
    from ranked r
   where m.id = r.id and r.rn <= 4;

  -- ── report ───────────────────────────────────────────────────────────────
  select count(*) into n from dances where unlock_at_level > 1;
  v_msg := v_msg || format('dance_lvl=%s ', n);
  select count(*) into n from dances where unlock_type = 'ads';
  v_msg := v_msg || format('dance_ads=%s ', n);
  select count(*) into n from backgrounds where unlock_at_level > 1;
  v_msg := v_msg || format('bg_lvl=%s ', n);
  select count(*) into n from backgrounds where unlock_type = 'ads';
  v_msg := v_msg || format('bg_ads=%s ', n);
  select count(*) into n from (
    select character_id from character_costumes where unlock_type = 'ads'
     group by character_id having count(*) > 1) t;
  v_msg := v_msg || format('costume_chars_over_1_ad=%s ', n);
  select count(*) into n from character_costumes where unlock_type = 'ads';
  v_msg := v_msg || format('costume_ads=%s ', n);
  select count(*) into n from medias where not should_hide and tier = 'free' and coalesce(price_ruby,0) = 0;
  v_msg := v_msg || format('media_ads=%s ', n);
  select count(*) into n from medias where not should_hide and coalesce(price_ruby,0) > 0;
  v_msg := v_msg || format('media_ruby=%s', n);

  raise notice '%', v_msg;
end $$;
