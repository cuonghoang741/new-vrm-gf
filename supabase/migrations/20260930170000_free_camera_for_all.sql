-- Orbiting her in 3D is no longer the Lv5 + PRO prize: anyone in 3D can drag
-- to turn the camera. Lv5 (still PRO only, see 20260930140000) now changes her:
-- the DEVOTION tier in gemini-chat-v2.
update bond_capabilities set min_level = 1, pro_only = false where code = 'free_camera';
