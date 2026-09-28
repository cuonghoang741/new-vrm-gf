-- Add country column to profiles table
-- Will be populated from Cloudflare IP header (cf-ipcountry) sent by webhooks
alter table public.profiles add column if not exists country text default null;

-- Index for queries filtering by country
create index if not exists idx_profiles_country on public.profiles(country);
