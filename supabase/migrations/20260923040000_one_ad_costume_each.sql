-- Every character gets one outfit you can have for watching an ad.
--
-- After the ad slots were thinned to one per character, only the twelve
-- characters that happened to have an ad outfit before still had one — the
-- rest offered a free player nothing at all beyond the starter outfit. The
-- cheapest non-starter outfit that is not level-gated becomes that character's
-- ad unlock; her starter outfit is never taken for it.
--
-- Also gives dances the "PRO, then ruby" case, which no dance had, so all four
-- lock states exist in every catalogue.

do $$
declare
  v_missing int; v_ads int; v_dup int;
begin
  with candidates as (
    select distinct on (cc.character_id) cc.id
      from character_costumes cc
     where cc.unlock_type <> 'default'
       and coalesce(cc.unlock_at_level, 1) <= 1
       and not exists (
         select 1 from character_costumes x
          where x.character_id = cc.character_id and x.unlock_type = 'ads')
     order by cc.character_id, coalesce(cc.price_ruby, 999999), cc.id
  )
  update character_costumes c
     set unlock_type = 'ads', price_ruby = null
    from candidates k
   where c.id = k.id;

  -- Dances: two that PRO opens and ruby buys.
  with pick as (
    select id from dances
     where unlock_type = 'pro' and coalesce(price_ruby, 0) = 0
     order by sort_order, id limit 2
  )
  update dances d set price_ruby = 400, tier = 'pro'
    from pick p where d.id = p.id;

  select count(*) into v_ads from character_costumes where unlock_type = 'ads';
  select count(*) into v_dup from (
    select character_id from character_costumes where unlock_type = 'ads'
     group by character_id having count(*) > 1) t;
  select count(*) into v_missing from (
    select cc.character_id from character_costumes cc
     group by cc.character_id
    having count(*) filter (where cc.unlock_type = 'ads') = 0) t;

  raise notice 'costume_ads=% chars_with_2plus=% chars_without_any=%',
    v_ads, v_dup, v_missing;
end $$;
