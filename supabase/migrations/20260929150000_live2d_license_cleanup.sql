-- Natori (Jin Natori) is a Live2D "Collaboration Character": its terms forbid
-- commercial use outright, unlike Hiyori, Mao, Haru and Rice, which are Live2D
-- Original Characters and may be used commercially by small-scale publishers.
-- He was never listed; now he is not public either, and his files have been
-- removed from the live2d bucket (with Haru's motion sounds, which the licence
-- does not cover and the viewer never played).
-- https://www.live2d.com/eula/live2d-sample-model-terms_en.html
update characters
set is_public = false,
    data = coalesce(data, '{}'::jsonb) || '{"live2d_listed": false}'::jsonb
where data->'live2d'->>'modelUrl' like '%/live2d/natori/%'
   or (name = 'Natori' and data ? 'live2d');
