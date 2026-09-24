-- Media joins the unlock system.
--
-- `medias` has carried `tier`, `price_ruby` and `unlock_relationship_level`
-- for a while, but nothing could act on them: `user_unlocks.asset_type` did
-- not allow 'media', `_item_unlock()` had no branch for it, and both
-- `app_buy_item` and `app_unlock_with_ad` rejected the type outright. So the
-- gallery could only ever ask "are you PRO?", and the seven free photos priced
-- at 150 ruby were being handed out for nothing.
--
-- Media has no `unlock_type` column of its own, so it is derived the same way
-- characters do it: a free photo with a price is bought with ruby, a free
-- photo without one is earned by watching an ad, and a pro photo is behind the
-- subscription (and then its price, if it has one).

alter table public.user_unlocks
    drop constraint if exists user_unlocks_asset_type_check;
alter table public.user_unlocks
    add constraint user_unlocks_asset_type_check
    check (asset_type = any (array['character', 'costume', 'background', 'dance', 'media']));

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
    -- Same shape as characters, with the ruby price promoted to its own kind
    -- so a priced free photo is bought rather than watched.
    select case
             when m.tier = 'pro' then 'pro'
             when coalesce(m.price_ruby, 0) > 0 then 'ruby'
             else 'ads'
           end,
           coalesce(m.price_ruby, 0)
      into unlock_type, price_ruby
      from medias m where m.id = p_id and m.available;
  end if;
end $$;

create or replace function public.app_buy_item(p_type text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_u record; v_bal integer; v_have integer;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  if p_type not in ('background', 'costume', 'dance', 'character', 'media') then return jsonb_build_object('error', 'bad_type'); end if;
  if exists (select 1 from user_unlocks where user_id = v_uid and asset_type = p_type and asset_id = p_id and source <> 'ad') then
    return jsonb_build_object('error', 'owned');
  end if;
  select * into v_u from _item_unlock(p_type, p_id);
  if v_u.unlock_type is null then return jsonb_build_object('error', 'not_found'); end if;
  if v_u.price_ruby <= 0 or v_u.unlock_type not in ('ruby', 'pro') then
    return jsonb_build_object('error', 'not_for_sale');
  end if;

  v_bal := _ruby_apply(v_uid, -v_u.price_ruby, 'purchase', p_type || ':' || p_id);
  if v_bal is null then
    select coalesce(ruby, 0) into v_have from user_currency where user_id = v_uid;
    return jsonb_build_object('error', 'insufficient', 'need', v_u.price_ruby, 'have', coalesce(v_have, 0));
  end if;

  insert into user_unlocks (user_id, asset_type, asset_id, source) values (v_uid, p_type, p_id, 'ruby')
    on conflict (user_id, asset_type, asset_id) do update set source = 'ruby';
  -- `user_assets` is the "things you own" list the profile reads; a dance and
  -- a photo are not things it shows, so they stay out of it.
  insert into user_assets (user_id, item_type, item_id)
    select v_uid, case p_type when 'costume' then 'character_costume' else p_type end, p_id
    where p_type not in ('dance', 'media')
      and not exists (select 1 from user_assets where user_id = v_uid and item_id = p_id);
  insert into transactions (user_id, item_type, item_id, currency_type, amount_paid)
    values (v_uid, p_type, p_id, 'ruby', v_u.price_ruby);
  return jsonb_build_object('ok', true, 'price', v_u.price_ruby, 'ruby_left', v_bal);
end $$;
