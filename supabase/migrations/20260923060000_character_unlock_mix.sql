-- The character roster, priced so every way in exists.
--
-- It was 17 of 28 behind "PRO and then ruby" and only two obtainable without
-- paying anything, which is the same shape the costumes and backgrounds had
-- before they were rebalanced: nothing for ruby to buy on its own, and almost
-- nothing an ad could open.
--
-- By `order`, so the roster reads the way it is displayed:
--   1–3   free, no price      → one rewarded ad to switch to her (PRO: free)
--   4–5   free, with a price  → buy with ruby, no PRO needed
--   6–8   pro, with a price   → PRO first, then ruby
--   rest  pro, no price       → PRO opens her
--
-- These four cases are exactly what `CharacterSheet.lockOf` reads, so the
-- table is the only place that decides.

do $$
declare
  v_ad int; v_ruby int; v_pro_ruby int; v_pro int;
begin
  with ranked as (
    select id, row_number() over (order by "order", created_at, id) rn
      from characters
     where is_public and available
  )
  update characters c
     set tier = case when r.rn <= 5 then 'free' else 'pro' end,
         price_ruby = case
           when r.rn <= 3 then null                                   -- ad
           when r.rn <= 5 then coalesce(nullif(c.price_ruby, 0), 800) -- ruby
           when r.rn <= 8 then coalesce(nullif(c.price_ruby, 0), 800) -- pro + ruby
           else null                                                  -- pro
         end
    from ranked r
   where c.id = r.id;

  select count(*) filter (where tier = 'free' and coalesce(price_ruby,0) = 0),
         count(*) filter (where tier = 'free' and coalesce(price_ruby,0) > 0),
         count(*) filter (where tier = 'pro'  and coalesce(price_ruby,0) > 0),
         count(*) filter (where tier = 'pro'  and coalesce(price_ruby,0) = 0)
    into v_ad, v_ruby, v_pro_ruby, v_pro
    from characters where is_public and available;

  raise notice 'ad=% ruby=% pro_ruby=% pro_only=%', v_ad, v_ruby, v_pro_ruby, v_pro;
end $$;
