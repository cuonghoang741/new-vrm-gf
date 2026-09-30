-- Buying a free-tier character that has a ruby price (Roxie and seven
-- others, 800 ruby) always failed with not_for_sale: _item_unlock read every
-- free character as ad-unlocked, while the picker offered it for ruby.
CREATE OR REPLACE FUNCTION public._item_unlock(p_type text, p_id uuid, OUT unlock_type text, OUT price_ruby integer)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_type = 'background' then
    select b.unlock_type, coalesce(b.price_ruby, 0) into unlock_type, price_ruby from backgrounds b where b.id = p_id;
  elsif p_type = 'costume' then
    select k.unlock_type, coalesce(k.price_ruby, 0) into unlock_type, price_ruby from character_costumes k where k.id = p_id;
  elsif p_type = 'dance' then
    select d.unlock_type, coalesce(d.price_ruby, 0) into unlock_type, price_ruby from dances d where d.id = p_id;
  elsif p_type = 'character' then
    -- Free tier = one ad, unless it has a ruby price: then ruby, which is
    -- what the picker has always shown (8 free girls priced at 800 answered
    -- "not_for_sale" to every purchase). Pro = paywall, or ruby if priced.
    select case
             when c.tier = 'free' and coalesce(c.price_ruby, 0) > 0 then 'ruby'
             when c.tier = 'free' then 'ads'
             else 'pro'
           end, coalesce(c.price_ruby, 0)
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
end $function$;
