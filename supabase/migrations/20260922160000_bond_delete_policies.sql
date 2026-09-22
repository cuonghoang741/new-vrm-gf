-- Let a user delete their own bond progress.
--
-- `user_bond` and `user_character_quests` were created with RLS on and only a
-- SELECT policy. Under RLS a DELETE with no matching policy removes zero rows
-- and still returns 204, so "delete my data" reported success while every
-- character stayed at the level it was ground to. Silent, and worse than an
-- error — the app's delete path logs failures but has nothing to log.
--
-- Writes still belong to the SECURITY DEFINER functions; this adds deletion
-- only, and only of the caller's own rows.

drop policy if exists user_bond_delete_self on user_bond;
create policy user_bond_delete_self on user_bond
  for delete using (auth.uid() = user_id);

drop policy if exists ucq_delete_self on user_character_quests;
create policy ucq_delete_self on user_character_quests
  for delete using (auth.uid() = user_id);
