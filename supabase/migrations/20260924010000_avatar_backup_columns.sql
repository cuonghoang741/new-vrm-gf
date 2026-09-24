-- Keep the originals before anything is cut out.
--
-- The 2D layer draws `characters.avatar` (or `character_costumes.url` when a
-- costume is on) straight over the chosen background image. Most of that art
-- ships with its own scenery baked in, so changing the background in 2D did
-- nothing — you swapped a picture nobody could see behind an opaque one.
--
-- Cutouts are written as NEW files; these columns hold the URL of the art as
-- it was, so a bad cutout is one UPDATE away from being undone.
alter table public.characters
  add column if not exists avatar_original text;
alter table public.character_costumes
  add column if not exists url_original text;

update public.characters
   set avatar_original = avatar
 where avatar_original is null and avatar is not null;

update public.character_costumes
   set url_original = url
 where url_original is null and url is not null;
