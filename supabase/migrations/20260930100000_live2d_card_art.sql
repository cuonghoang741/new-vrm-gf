-- Live2D girls' pictures were their transparent PNG cut-outs, which sat on a
-- flat dark tile in the picker, the hero and the welcome-back screen. They now
-- use a card with a scene behind her (thumbs/<slug>_card.jpg, composited from
-- the cut-out over one of our own backgrounds). avatar_nobg keeps the cut-out:
-- it is what is drawn over a scene.
update characters c
set thumbnail_url   = replace(c.avatar_nobg, '/thumbs/' || s.slug || '.png', '/thumbs/' || s.slug || '_card.jpg'),
    small_thumb_url = replace(c.avatar_nobg, '/thumbs/' || s.slug || '.png', '/thumbs/' || s.slug || '_card.jpg'),
    avatar          = replace(c.avatar_nobg, '/thumbs/' || s.slug || '.png', '/thumbs/' || s.slug || '_card.jpg'),
    small_avatar    = replace(c.avatar_nobg, '/thumbs/' || s.slug || '.png', '/thumbs/' || s.slug || '_card.jpg')
from (values ('hiyori'), ('mao'), ('haru'), ('rice')) as s(slug)
where c.data ? 'live2d'
  and c.avatar_nobg like '%/live2d/thumbs/' || s.slug || '.png';
