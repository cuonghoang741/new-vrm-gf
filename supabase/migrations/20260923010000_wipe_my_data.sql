-- "Delete my data" that actually deletes the data.
--
-- The client used to loop over a hand-written list of table names and issue a
-- REST DELETE for each. That list was inherited from an older schema and had
-- drifted: `ruby_ledger`, `user_unlocks`, `user_quest_progress` and
-- `user_character_stories` were never on it, and none of those four had a
-- DELETE policy either — so even the tables it did name could answer 204 while
-- removing nothing. Signing back in (same auth user id) brought the balance,
-- the unlocks and the quest progress straight back.
--
-- So the wipe lives here instead: one SECURITY DEFINER function, one
-- transaction, one list that sits next to the schema it names. Adding a table
-- to the app means adding it here, not in a mobile release.

create or replace function public.app_wipe_my_data(p_client_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tables text[] := array[
    'relationship_milestones','character_relationship','level_up_rewards',
    'user_daily_quests','user_level_quests','user_login_rewards','user_streaks',
    'user_medals','user_character','user_stats','user_currency','user_assets',
    'transactions','purchases','subscriptions','user_preferences','api_characters',
    'conversation','app_feedback','bug_reports','calls','scheduled_notifications',
    'user_notification_preferences','spicy_content_notifications',
    'notification_counters','user_call_quota','user_bond','user_character_quests',
    -- The four the old client list never knew about:
    'ruby_ledger','user_unlocks','user_quest_progress','user_character_stories'
  ];
  t text;
  v_has_client boolean;
  v_n bigint;
  v_out jsonb := '{}'::jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('error', 'not_signed_in');
  end if;

  foreach t in array v_tables loop
    -- Skip anything this project does not have, so one renamed table cannot
    -- abort the whole wipe and leave it half done.
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = t and column_name = 'client_id'
    ) into v_has_client;

    if v_has_client and p_client_id is not null then
      execute format('delete from public.%I where user_id = $1 or client_id = $2', t)
        using v_uid, p_client_id;
    else
      execute format('delete from public.%I where user_id = $1', t)
        using v_uid;
    end if;

    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_out := v_out || jsonb_build_object(t, v_n);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'deleted', v_out);
end $$;

revoke all on function public.app_wipe_my_data(text) from public, anon;
grant execute on function public.app_wipe_my_data(text) to authenticated;
