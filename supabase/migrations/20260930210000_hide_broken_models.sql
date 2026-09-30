-- Hide nine characters whose VRM is not a finished girlfriend model (rendered
-- and reviewed 2026-09-30): bunny mascot suits (Yua, Yori), odd proportions
-- (Mayu, Zuki), floating garments with no body (Sumire), a broken mesh
-- (Claire), and male-looking models (Kohana, Amane, Fuyu). Eight were sold as
-- PRO. Nobody owned or had bonded with any of them. `available = false` takes
-- them off every list; data.hidden_reason says why, to undo it once fixed.
update characters
   set available = false,
       data = coalesce(data, '{}'::jsonb) || jsonb_build_object('hidden_reason', 'broken model 2026-09-30')
 where id in (
   '5cd4fe2a-9b2d-481b-927f-a1950bb373c1', -- Yua
   'f6f14258-5462-45af-9417-bb153debc881', -- Yori
   '9da32f18-0d01-43bc-9fee-6297b3a6738d', -- Mayu
   '7798d233-23f7-4940-8586-bf35e4fb7ec4', -- Zuki
   '84929eea-7876-4eac-b4fe-0e2e04287ae4', -- Sumire
   'a3fbb500-0532-43ad-be77-0e81def5733d', -- Claire
   '6d86c66f-f051-4fb7-986a-26de7285ecdd', -- Kohana
   '0762bfff-849c-4172-a38e-57440df8cb4b', -- Amane
   '1438ac96-a19f-4533-a3b7-817cd5e591f4'  -- Fuyu
 );
