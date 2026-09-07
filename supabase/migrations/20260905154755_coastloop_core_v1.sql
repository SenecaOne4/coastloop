create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','admin','sales','creative','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text,
  stage text not null default 'new' check (stage in ('new','researched','contacted','follow_up','hot','won','lost','do_not_contact')),
  host_interest boolean not null default false,
  advertiser_interest boolean not null default false,
  score smallint check (score between 0 and 100),
  contact_name text,
  phone text,
  email text,
  website text,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  source text,
  notes text,
  assigned_to uuid references auth.users(id) on delete set null,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_prospect_id uuid references public.prospects(id) on delete set null,
  name text not null,
  category text,
  contact_name text,
  phone text,
  email text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  zone_id uuid references public.zones(id) on delete set null,
  name text,
  address_line1 text,
  city text,
  state text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  timezone text not null default 'America/New_York',
  host_status text not null default 'prospect' check (host_status in ('prospect','negotiating','signed','installed','inactive')),
  agreement_start date,
  agreement_end date,
  placement_notes text,
  hours_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  advertiser_business_id uuid not null references public.businesses(id) on delete restrict,
  name text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','active','paused','completed','canceled')),
  starts_at timestamptz,
  ends_at timestamptz,
  price_cents integer check (price_cents is null or price_cents >= 0),
  billing_notes text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  advertiser_business_id uuid references public.businesses(id) on delete set null,
  title text not null,
  kind text not null check (kind in ('image','video')),
  storage_key text not null,
  original_filename text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  duration_seconds numeric(10,3) check (duration_seconds is null or duration_seconds >= 0),
  width integer,
  height integer,
  checksum text,
  status text not null default 'processing' check (status in ('processing','ready','archived','error')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, storage_key)
);

create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  version bigint not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete set null,
  position integer not null check (position >= 0),
  display_seconds numeric(10,3) check (display_seconds is null or display_seconds > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (playlist_id, position)
);

create table public.screens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  status text not null default 'unpaired' check (status in ('unpaired','active','offline','retired')),
  pairing_code text unique,
  pairing_expires_at timestamptz,
  device_key_hash text,
  last_seen_at timestamptz,
  app_version text,
  display_width integer,
  display_height integer,
  orientation text not null default 'landscape' check (orientation in ('landscape','portrait')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.screen_playlist_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  screen_id uuid not null references public.screens(id) on delete cascade,
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.playback_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  play_date date not null,
  screen_id uuid not null references public.screens(id) on delete cascade,
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  play_count bigint not null default 0 check (play_count >= 0),
  seconds_played numeric(18,3) not null default 0 check (seconds_played >= 0),
  first_played_at timestamptz,
  last_played_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index playback_daily_unique
  on public.playback_daily (play_date, screen_id, media_asset_id, coalesce(campaign_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table public.creative_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  advertiser_business_id uuid references public.businesses(id) on delete set null,
  prompt text not null,
  job_type text not null default 'image' check (job_type in ('image','video')),
  status text not null default 'queued' check (status in ('queued','claimed','completed','failed','canceled')),
  requested_by uuid references auth.users(id) on delete set null,
  claimed_by text,
  output_asset_id uuid references public.media_assets(id) on delete set null,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index prospects_org_stage_idx on public.prospects(organization_id, stage);
create index prospects_follow_up_idx on public.prospects(organization_id, next_follow_up_at) where next_follow_up_at is not null;
create index prospects_geo_idx on public.prospects(organization_id, latitude, longitude);
create index businesses_org_name_idx on public.businesses(organization_id, name);
create index locations_org_host_idx on public.locations(organization_id, host_status);
create index locations_geo_idx on public.locations(organization_id, latitude, longitude);
create index campaigns_org_status_idx on public.campaigns(organization_id, status, starts_at, ends_at);
create index media_org_status_idx on public.media_assets(organization_id, status);
create index playlist_items_order_idx on public.playlist_items(playlist_id, position);
create index screens_org_seen_idx on public.screens(organization_id, last_seen_at);
create index assignments_screen_idx on public.screen_playlist_assignments(screen_id, starts_at, ends_at, priority desc);
create index playback_org_date_idx on public.playback_daily(organization_id, play_date);
create index playback_campaign_date_idx on public.playback_daily(campaign_id, play_date) where campaign_id is not null;
create index creative_jobs_queue_idx on public.creative_jobs(organization_id, status, created_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger prospects_touch_updated_at before update on public.prospects for each row execute function public.touch_updated_at();
create trigger businesses_touch_updated_at before update on public.businesses for each row execute function public.touch_updated_at();
create trigger locations_touch_updated_at before update on public.locations for each row execute function public.touch_updated_at();
create trigger campaigns_touch_updated_at before update on public.campaigns for each row execute function public.touch_updated_at();
create trigger media_assets_touch_updated_at before update on public.media_assets for each row execute function public.touch_updated_at();
create trigger playlists_touch_updated_at before update on public.playlists for each row execute function public.touch_updated_at();
create trigger screens_touch_updated_at before update on public.screens for each row execute function public.touch_updated_at();
create trigger playback_daily_touch_updated_at before update on public.playback_daily for each row execute function public.touch_updated_at();
create trigger creative_jobs_touch_updated_at before update on public.creative_jobs for each row execute function public.touch_updated_at();

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.prospects enable row level security;
alter table public.businesses enable row level security;
alter table public.zones enable row level security;
alter table public.locations enable row level security;
alter table public.campaigns enable row level security;
alter table public.media_assets enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
alter table public.screens enable row level security;
alter table public.screen_playlist_assignments enable row level security;
alter table public.playback_daily enable row level security;
alter table public.creative_jobs enable row level security;

revoke all on table public.organizations, public.organization_members, public.prospects, public.businesses, public.zones, public.locations, public.campaigns, public.media_assets, public.playlists, public.playlist_items, public.screens, public.screen_playlist_assignments, public.playback_daily, public.creative_jobs from anon;
grant select, insert, update, delete on table public.organizations, public.organization_members, public.prospects, public.businesses, public.zones, public.locations, public.campaigns, public.media_assets, public.playlists, public.playlist_items, public.screens, public.screen_playlist_assignments, public.playback_daily, public.creative_jobs to authenticated;

create policy organizations_select_member on public.organizations for select to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = (select auth.uid())));

create policy organization_members_select_self on public.organization_members for select to authenticated
using (user_id = (select auth.uid()));

create policy prospects_member_all on public.prospects for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = prospects.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = prospects.organization_id and m.user_id = (select auth.uid())));

create policy businesses_member_all on public.businesses for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = businesses.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = businesses.organization_id and m.user_id = (select auth.uid())));

create policy zones_member_all on public.zones for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = zones.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = zones.organization_id and m.user_id = (select auth.uid())));

create policy locations_member_all on public.locations for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = locations.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = locations.organization_id and m.user_id = (select auth.uid())));

create policy campaigns_member_all on public.campaigns for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = campaigns.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = campaigns.organization_id and m.user_id = (select auth.uid())));

create policy media_assets_member_all on public.media_assets for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = media_assets.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = media_assets.organization_id and m.user_id = (select auth.uid())));

create policy playlists_member_all on public.playlists for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = playlists.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = playlists.organization_id and m.user_id = (select auth.uid())));

create policy playlist_items_member_all on public.playlist_items for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = playlist_items.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = playlist_items.organization_id and m.user_id = (select auth.uid())));

create policy screens_member_all on public.screens for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = screens.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = screens.organization_id and m.user_id = (select auth.uid())));

create policy assignments_member_all on public.screen_playlist_assignments for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = screen_playlist_assignments.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = screen_playlist_assignments.organization_id and m.user_id = (select auth.uid())));

create policy playback_daily_member_all on public.playback_daily for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = playback_daily.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = playback_daily.organization_id and m.user_id = (select auth.uid())));

create policy creative_jobs_member_all on public.creative_jobs for all to authenticated
using (exists (select 1 from public.organization_members m where m.organization_id = creative_jobs.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.organization_members m where m.organization_id = creative_jobs.organization_id and m.user_id = (select auth.uid())));
