-- Dance catalogue: TrueFeel's own dance FBX + 16 imported from Yuuki (files copied
-- into this project's public 'dances' storage bucket). Runs only on an empty table.
insert into storage.buckets (id, name, public, file_size_limit) values ('dances','dances', true, 10485760) on conflict (id) do nothing;
do $$ begin if exists (select 1 from public.dances) then return; end if;
insert into public.dances (name, file_url, thumbnail_url, unlock_type, price_ruby, sort_order) values
('Hip Hop Dancing','https://n6n.top/Anim/Hip%20Hop%20Dancing.fbx',null,'default',0,10),
('Booty Hip Hop','https://n6n.top/Anim/Booty%20Hip%20Hop%20Dance.fbx',null,'default',0,20),
('Step Hip Hop','https://n6n.top/Anim/Step%20Hip%20Hop%20Dance.fbx',null,'default',0,30),
('Give Your Soul','https://pub-8b57fd6b30c04b11b3f3a092bdfed0e2.r2.dev/Dance%20-%20Give%20Your%20Soul.fbx',null,'default',0,40),
('Rumba Dancing','https://n6n.top/Anim/Rumba%20Dancing.fbx',null,'ads',0,50),
('Snake Hip Hop','https://n6n.top/Anim/Snake%20Hip%20Hop%20Dance.fbx',null,'ads',0,60),
('Quick Steps','https://n6n.top/Anim/Quick%20Steps.fbx',null,'ads',0,70),
('Belly Dance','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/belly_dance.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433027750_08438b8c-69c9-461b-b83c-0d5e5f227f13.jpg','pro',0,80),
('Salsa Dancing','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/salsa_dancing.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433216443_0b59cf33-7cb6-4b09-8259-e4fcc3b49b51.jpg','ads',0,90),
('Samba Dancing','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/samba_dancing.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784432963043_5f06f33f-327d-462a-b48b-ca9bd69f7b98.jpg','ads',0,100),
('Step Dance','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/step_hip_hop_dance.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1787675621214_1707bb9b-c1dd-4839-877f-6a06bfd136d2.jpg','ruby',150,110),
('Wave Hip Hop Dance','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/wave_hip_hop_dance.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1787675433240_7306429b-098b-458b-9d6e-abb55e3b7bd5.jpg','ads',0,120),
('Samba Dancing 2','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/samba_dancing_2.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784432971349_6c40ad9b-97fe-4bdc-9286-83722762d861.jpg','ruby',120,130),
('Locking Hip Hop Dance','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/locking_hip_hop_dance.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1787675764059_28dba45d-f37c-48f6-b3eb-86d66e95444f.jpg','pro',0,140),
('Dancing','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/dancing.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433094545_a0315bee-0786-4624-af62-4b52bf0351e5.jpg','ads',0,150),
('Salsa Dancing 2','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/salsa_dancing_2.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433242867_65dd1037-2817-43f5-8960-e5bb27bf7d4b.jpg','ruby',120,160),
('Bellydancing','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/bellydancing.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433130810_9f99eb28-a51a-4ad8-ac58-bac76f9447ba.jpg','pro',0,170),
('Gangnam Style','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/gangnam_style.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433553294_1b044e1f-2ced-472f-9b4c-6e79b030ffca.jpg','pro',0,180),
('Swing Dancing','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/swing_dancing.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784433581227_6f123731-0861-433f-9b37-b9756a000a84.jpg','pro',0,190),
('Bashful','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/bashful.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784434153173_9cf80c92-bfda-4199-afc8-da84379b64c5.jpg','ruby',80,200),
('Excited','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/excited.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784434388574_7281b009-da68-4966-b9ac-49fa3008775d.jpg','ads',0,210),
('Fist Pump','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/fist_pump.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784434493485_66509420-7cc8-4855-a7a3-262b407aa1db.jpg','ads',0,220),
('Catwalk','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/fbx/catwalk_walk.fbx','https://kwqqmjfsrgoczbutuisx.supabase.co/storage/v1/object/public/dances/thumbs/1784434714286_43d85785-6e8c-4c1b-a189-eaad23b681e5.jpg','ruby',200,230);
end $$;
