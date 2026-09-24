-- Categories for the media imported from Yuuki.
--
-- The import brought the files over but not the captions, so every one of the
-- 219 rows landed with `keywords` empty. That column is the vocabulary the
-- chat model picks from when it decides to send a photo — with it empty the
-- picker can only ever choose at random, which is exactly the complaint: the
-- picture never matches the sentence.
--
-- The categories below are Yuuki's own captions, translated to short English
-- phrases (they were Vietnamese with emoji, which is a poor thing to put in an
-- English system prompt), falling back to the descriptive part of the file
-- name where the caption was a filename or a UUID. Rows with neither stay
-- empty on purpose: they are the fallback pool, not a wrong guess.

update medias m
set keywords = v.category
from (values
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/263654cc-2cf7-458a-b530-7581b8260200/gen_1787165131641.jpg', 'beach at sunset in a sundress'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/263654cc-2cf7-458a-b530-7581b8260200/gen_1787542005970.jpg', 'bikini'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/263654cc-2cf7-458a-b530-7581b8260200/gen_1787689544108.jpg', 'swimsuit by the pool'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/3dec56ca-0b44-4d6a-a11c-d5d2c478a3ed/gen_1784086641299.jpg', 'elegant evening gown'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/3dec56ca-0b44-4d6a-a11c-d5d2c478a3ed/gen_1784086696047.jpg', 'elegant evening gown'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/3dec56ca-0b44-4d6a-a11c-d5d2c478a3ed/gen_1784256238639.png', 'neon city street at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/3dec56ca-0b44-4d6a-a11c-d5d2c478a3ed/gen_1784369069163.png', 'nude'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/3dec56ca-0b44-4d6a-a11c-d5d2c478a3ed/gen_1784713547467.jpg', 'swimsuit by the pool'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/akane/ai_car_passenger_1788422880087_0.png', 'car passenger seat'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/akane/ai_dessert_cafe_1788422879916_1.png', 'dessert cafe'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/c398eb29-2665-40a8-9fdb-dd13fe97a5aa/gen_1789578442933.jpg', 'cozy bedroom at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/e89303f3-1005-4153-ba29-3adf6c64bdf2/gen_1788441743610.jpg', 'cozy bedroom at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/e89303f3-1005-4153-ba29-3adf6c64bdf2/gen_1789455027922.jpg', 'cozy cafe'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/e89303f3-1005-4153-ba29-3adf6c64bdf2/gen_1789654642945.jpg', 'cozy cafe'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/e89303f3-1005-4153-ba29-3adf6c64bdf2/gen_1789656807019.jpg', 'neon city street at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kanade/ai_car_passenger_1788422922100_1.png', 'car passenger seat'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kanade/ai_dance_studio_1788422909541_0.png', 'dance studio'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kazane/ai_car_passenger_1787302631356_0.png', 'car passenger seat'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kazane/ai_rainy_bus_1786100108332_0.png', 'rainy bus stop'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kazane/ai_red_lounge_1786100756988_0.png', 'red lounge'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/kazane/ai_wet_shirt_1786098383828_0.png', 'beach at dusk'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/m_erika/ai_poolside_1786097509609_0.png', 'poolside'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/m_rei/ai_rainy_bus_1787302385770_0.png', 'rainy bus stop'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/m_rei/ai_wet_shirt_1786097580462_0.png', 'beach at dusk'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/m_rei/ai_wet_shirt_1787238973276_0.png', 'beach at dusk'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/m_sumire/ai_bookstore_1786094551224_0.png', 'bookstore'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/miyu/ai_car_passenger_1788422908763_1.png', 'car passenger seat'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/miyu/ai_dance_studio_1788422909413_0.png', 'dance studio'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/nanami/ai_car_passenger_1788422882372_0.png', 'car passenger seat'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/nanami/ai_dessert_cafe_1788422895933_1.png', 'dessert cafe'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_izumi/ai_bath_steam_1786100713382_0.png', 'steamy bath'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_izumi/ai_onsen_night_1786098223439_0.png', 'hot spring at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_izumi/ai_plush_room_1786100058170_0.png', 'plush room'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_izumi/ai_rooftop_bar_1787302577928_0.png', 'rooftop bar'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_kanon/ai_festival_night_1786099991420_0.png', 'summer festival'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_kanon/ai_festival_night_1787302520137_0.png', 'summer festival'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_kanon/ai_silhouette_window_1786100654731_0.png', 'silhouette by the window'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/p_kanon/ai_silk_lounge_1786098039495_0.png', 'candlelit hall'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/ruriko/ai_bath_steam_1786100747828_0.png', 'steamy bath'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/ruriko/ai_onsen_night_1786098360004_0.png', 'hot spring at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/ruriko/ai_onsen_night_1787239017876_0.png', 'hot spring at night'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/ruriko/ai_plush_room_1786100097840_0.png', 'plush room'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/ruriko/ai_plush_room_1787302624241_0.png', 'plush room'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/sayuki/ai_festival_night_1786100074929_0.png', 'summer festival'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/sayuki/ai_festival_night_1787302598203_0.png', 'summer festival'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/sayuki/ai_silhouette_window_1786100724511_0.png', 'silhouette by the window'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/sayuki/ai_silk_lounge_1786098282037_0.png', 'candlelit hall'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/tsukiko/ai_rainy_bus_1788422896791_0.png', 'rainy bus stop'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/tsukiko/ai_street_fashion_1788422896415_1.png', 'street fashion'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/yukari/ai_laundry_balcony_1787302641892_0.png', 'laundry on the balcony'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/yukari/ai_red_lounge_1786100769883_0.png', 'red lounge'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/yukari/ai_wet_shirt_1786098431375_0.png', 'beach at dusk'),
    ('https://pub-2682fd3d83e342588016f364737f5758.r2.dev/media/yukari/ai_wet_shirt_1786100353008_0.png', 'beach at dusk')
) as v(url, category)
where m.url = v.url
  and coalesce(m.keywords, '') = '';
