-- What deleting a character would take with it — so the CMS can warn before
-- a single click destroys user data.
--
-- characters is referenced ON DELETE CASCADE by conversation (users' chat
-- history) and user_character (users' relationship progress), among others.
-- An admin in the CMS cannot count those rows themselves: conversation's RLS
-- only shows each user their own. This function counts them with definer
-- rights, and only for admins.

begin;

create or replace function public.character_delete_impact(cid uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then json_build_object(
    -- deleted along with the character (ON DELETE CASCADE)
    'conversations', (select count(*) from conversation where character_id = cid),
    'user_links',    (select count(*) from user_character where character_id = cid),
    'costumes',      (select count(*) from character_costumes where character_id = cid),
    'medias',        (select count(*) from medias where character_id = cid),
    'translations',  (select count(*) from character_translates where character_id = cid),
    -- rows that make the delete FAIL (ON DELETE NO ACTION)
    'blockers',
      (select count(*) from daily_quests where reward_character_id = cid)
    + (select count(*) from media_collections where character_id = cid)
    + (select count(*) from scheduled_notifications where character_id = cid)
    + (select count(*) from spicy_content_notifications where character_id = cid)
  ) end;
$$;

revoke all on function public.character_delete_impact(uuid) from public, anon;
grant execute on function public.character_delete_impact(uuid) to authenticated;

commit;
