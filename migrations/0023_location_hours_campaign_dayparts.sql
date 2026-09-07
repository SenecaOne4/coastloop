alter table public.locations
  add column if not exists operating_hours jsonb not null default '{}'::jsonb;

alter table public.locations
  drop constraint if exists locations_operating_hours_object_check;

alter table public.locations
  add constraint locations_operating_hours_object_check
  check (jsonb_typeof(operating_hours) = 'object');

alter table public.campaigns
  add column if not exists dayparts jsonb not null default '{}'::jsonb;

alter table public.campaigns
  drop constraint if exists campaigns_dayparts_object_check;

alter table public.campaigns
  add constraint campaigns_dayparts_object_check
  check (jsonb_typeof(dayparts) = 'object');

comment on column public.locations.operating_hours is
  'Weekly local operating schedule keyed by sun..sat. Empty object means unrestricted/not configured.';
comment on column public.campaigns.dayparts is
  'Weekly local campaign delivery windows keyed by sun..sat. Empty object means unrestricted.';
