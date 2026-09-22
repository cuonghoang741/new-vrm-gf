-- Ruby items were secretly PRO items.
--
-- `sync_tier` (on backgrounds, character_costumes and dances) derived the tier
-- from unlock_type with `unlock_type in ('pro','ruby') -> tier = 'pro'`. So
-- every "buy with ruby" row was also tier `pro`, and the client — which reads
-- tier first — showed it as *PRO **and** ruby*. That is the "sao lại có mấy
-- cái vừa require pro lẫn ruby một lúc" case, and it was the schema doing it,
-- not the data: any attempt to fix a row by hand was overwritten on write.
--
-- The rules the app actually implements are:
--   free + no price  -> watch an ad
--   free + price     -> buy with ruby
--   pro  + no price  -> PRO unlocks it
--   pro  + price     -> PRO, then buy with ruby
-- so `ruby` belongs to tier `free`. The trigger now says that, and steps aside
-- when a caller sets `tier` explicitly, which is the only way the fourth case
-- can be expressed.
--
-- On top of that: backgrounds were 57/69 PRO-only, leaving ruby nothing to buy
-- here. The cheaper half becomes a ruby purchase; the expensive half stays PRO.

create or replace function public._sync_tier_from_unlock_type()
returns trigger
language plpgsql
as $$
begin
  -- An explicit tier change wins: that is how "PRO, then pay ruby" is set.
  if tg_op = 'UPDATE' and new.tier is distinct from old.tier then
    return new;
  end if;
  new.tier := case when new.unlock_type = 'pro' then 'pro' else 'free' end;
  return new;
end $$;

do $$
declare
  v_pro int; v_ruby int; v_free int; v_ads int; v_pro_ruby int;
begin
  -- 1. Existing ruby rows stop pretending to need PRO.
  update backgrounds        set tier = 'free' where unlock_type = 'ruby' and tier <> 'free';
  update character_costumes set tier = 'free' where unlock_type = 'ruby' and tier <> 'free';
  update dances             set tier = 'free' where unlock_type = 'ruby' and tier <> 'free';

  -- 2. The cheaper 32 PRO backgrounds become ruby purchases.
  with ranked as (
    select id, row_number() over (order by coalesce(price_ruby, 300), id) rn
      from backgrounds
     where tier = 'pro' and unlock_type = 'pro'
  )
  update backgrounds b
     set unlock_type = 'ruby',
         price_ruby = coalesce(b.price_ruby, 300)
    from ranked r
   where b.id = r.id and r.rn <= 32;

  -- 3. `default` means free; a price sitting on one was never charged.
  with ranked as (
    select id, row_number() over (order by coalesce(price_ruby, 0), id) rn
      from backgrounds
     where unlock_type = 'default' and coalesce(price_ruby, 0) > 0
  )
  update backgrounds b
     set price_ruby  = case when r.rn <= 4 then null else b.price_ruby end,
         unlock_type = case when r.rn <= 4 then 'default' else 'ruby' end
    from ranked r
   where b.id = r.id;

  -- 4. A PRO background costs nothing beyond PRO. (The leftovers carried
  --    prices from before the split, which would have read as "PRO *and*
  --    ruby" on every single one of them.)
  update backgrounds set price_ruby = null
   where unlock_type = 'pro' and coalesce(price_ruby, 0) > 0;

  -- 5. Keep the fourth case alive on purpose: three premium backgrounds that
  --    PRO opens and ruby buys, so the combination is exercised by real data.
  with pick as (
    select id from backgrounds
     where unlock_type = 'pro' and coalesce(price_ruby, 0) = 0
     order by id desc limit 3
  )
  update backgrounds b set price_ruby = 600, tier = 'pro'
    from pick p where b.id = p.id;

  select count(*) filter (where tier = 'pro' and coalesce(price_ruby,0) = 0),
         count(*) filter (where tier = 'free' and coalesce(price_ruby,0) > 0),
         count(*) filter (where tier = 'free' and coalesce(price_ruby,0) = 0 and unlock_type = 'default'),
         count(*) filter (where unlock_type = 'ads'),
         count(*) filter (where tier = 'pro' and coalesce(price_ruby,0) > 0)
    into v_pro, v_ruby, v_free, v_ads, v_pro_ruby
    from backgrounds;

  raise notice 'pro_only=% ruby=% free=% ads=% pro_plus_ruby=%',
    v_pro, v_ruby, v_free, v_ads, v_pro_ruby;
end $$;
