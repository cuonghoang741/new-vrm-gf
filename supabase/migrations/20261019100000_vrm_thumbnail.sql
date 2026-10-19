-- The thumbnail embedded in each character's VRM file (VRM 0.x
-- meta.texture / VRM 1.0 meta.thumbnailImage), extracted once by
-- tools/vroid/vrm_thumbs.py and hosted on R2 under app-art/vrm-thumb/.
-- The CMS shows it in the corner of each character card so the catalogue art
-- can be compared with the model actually shipped. NULL = not captured yet
-- (the CMS then falls back to rendering the VRM in the browser).
alter table public.characters
  add column if not exists vrm_thumbnail_url text;
