-- `medias.unlock_type`, so the gallery's economy is editable like every other.
--
-- Backgrounds, costumes and dances all carry `unlock_type`; media was the one
-- family without it, so its lock could only be guessed from tier and price.
-- The guess made every unpriced free photo an ad item — five photos, five
-- gates — when the rule for every other section is ONE ad item each.
--
-- With the column present the mix is explicit and the CMS can change it:
--   default → always free
--   ads     → one rewarded ad
--   ruby    → costs `price_ruby`
--   pro     → behind the subscription

alter table public.medias
    add column if not exists unlock_type text
        check (unlock_type in ('default', 'ads', 'ruby', 'pro'));

-- Start from what tier and price already say.
update public.medias
set unlock_type = case
        when tier = 'pro' then 'pro'
        when coalesce(price_ruby, 0) > 0 then 'ruby'
        else 'default'
    end
where unlock_type is null;

-- Then exactly one ad photo per character, the same rule the outfits follow:
-- the newest free one, so the ad sits on something worth watching for.
with picked as (
    select distinct on (character_id) id
    from public.medias
    where available
      and media_type = 'photo'
      and unlock_type = 'default'
    order by character_id, created_at desc
)
update public.medias m
set unlock_type = 'ads'
from picked p
where m.id = p.id;

create or replace function public._item_unlock(
    p_type text,
    p_id uuid,
    out unlock_type text,
    out price_ruby integer
) returns record
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if p_type = 'background' then
    select b.unlock_type, coalesce(b.price_ruby, 0) into unlock_type, price_ruby from backgrounds b where b.id = p_id;
  elsif p_type = 'costume' then
    select k.unlock_type, coalesce(k.price_ruby, 0) into unlock_type, price_ruby from character_costumes k where k.id = p_id;
  elsif p_type = 'dance' then
    select d.unlock_type, coalesce(d.price_ruby, 0) into unlock_type, price_ruby from dances d where d.id = p_id;
  elsif p_type = 'character' then
    -- Characters keep their old model: free tier = one ad, pro = paywall/ruby.
    select case when c.tier = 'free' then 'ads' else 'pro' end, coalesce(c.price_ruby, 0)
      into unlock_type, price_ruby from characters c where c.id = p_id;
  elsif p_type = 'media' then
    -- The column is the authority; the tier/price reading is only the
    -- fallback for a row the CMS has not set yet.
    select coalesce(m.unlock_type,
             case
               when m.tier = 'pro' then 'pro'
               when coalesce(m.price_ruby, 0) > 0 then 'ruby'
               else 'ads'
             end),
           coalesce(m.price_ruby, 0)
      into unlock_type, price_ruby
      from medias m where m.id = p_id and m.available;
  end if;
end $$;
