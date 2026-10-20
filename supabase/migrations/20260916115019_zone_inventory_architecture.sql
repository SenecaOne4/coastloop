-- CoastLoop canonical geography / inventory foundation.
-- Additive only: preserves existing packages, orders, campaigns, locations,
-- screens, playlists and pacing architecture.

create table public.geography_areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.geography_areas(id) on delete restrict,
  area_type text not null
    check (area_type in ('network','local_area','market','region','multi_region')),
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('draft','active','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.zones
  add column parent_area_id uuid references public.geography_areas(id) on delete restrict,
  add column status text not null default 'active'
    check (status in ('draft','active','retired')),
  add column metadata jsonb not null default '{}'::jsonb,
  add column updated_at timestamptz not null default now();

create table public.zone_boundary_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete restrict,
  version integer not null check (version > 0),
  boundary_geojson jsonb not null
    check (
      jsonb_typeof(boundary_geojson) = 'object'
      and boundary_geojson->>'type' in ('Polygon','MultiPolygon')
    ),
  status text not null default 'draft'
    check (status in ('draft','active','superseded','retired')),
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  unique (zone_id, version)
);

create unique index zone_boundary_one_active_idx
  on public.zone_boundary_versions(zone_id)
  where status = 'active';

create table public.advertising_package_zones (
  package_id uuid not null references public.advertising_packages(id) on delete restrict,
  zone_id uuid not null references public.zones(id) on delete restrict,
  delivery_weight numeric not null default 1 check (delivery_weight > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (package_id, zone_id)
);

create table public.advertiser_order_zones (
  order_id uuid not null references public.advertiser_orders(id) on delete restrict,
  zone_id uuid not null references public.zones(id) on delete restrict,
  zone_name_snapshot text not null,
  zone_slug_snapshot text not null,
  boundary_version integer,
  delivery_weight numeric not null default 1 check (delivery_weight > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (order_id, zone_id),
  foreign key (zone_id, boundary_version)
    references public.zone_boundary_versions(zone_id, version)
    on delete restrict
);

create table public.business_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  parent_id uuid references public.business_categories(id) on delete restrict,
  name text not null,
  slug text not null,
  status text not null default 'active'
    check (status in ('draft','active','retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

alter table public.advertising_packages
  add column coverage_mode text not null default 'legacy'
    check (coverage_mode in ('legacy','network','zones'));

update public.advertising_packages
set coverage_mode = case
  when placement_scope->>'mode' = 'network' then 'network'
  else 'legacy'
end;

alter table public.advertiser_orders
  add column coverage_mode text not null default 'legacy'
    check (coverage_mode in ('legacy','network','zones'));

update public.advertiser_orders o
set coverage_mode = coalesce(
  (select p.coverage_mode
   from public.advertising_packages p
   where p.id = o.package_id),
  case when o.placement_scope->>'mode' = 'network' then 'network' else 'legacy' end
);

alter table public.businesses
  add column category_id uuid references public.business_categories(id) on delete restrict;

alter table public.campaigns
  add column coverage_mode text not null default 'legacy'
    check (coverage_mode in ('legacy','network','zones')),
  add column business_category_id uuid references public.business_categories(id) on delete restrict;

create table public.campaign_zone_entitlements (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  zone_id uuid not null references public.zones(id) on delete restrict,
  source_order_id uuid references public.advertiser_orders(id) on delete restrict,
  status text not null default 'active'
    check (status in ('active','paused','retired')),
  delivery_weight numeric not null default 1 check (delivery_weight > 0),
  guaranteed_plays bigint check (guaranteed_plays is null or guaranteed_plays >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (campaign_id, zone_id)
);

alter table public.playback_daily
  add column location_id uuid references public.locations(id) on delete restrict,
  add column zone_id uuid references public.zones(id) on delete restrict,
  add column business_category_id uuid references public.business_categories(id) on delete restrict;

update public.playback_daily pd
set
  location_id = x.location_id,
  zone_id = x.zone_id,
  business_category_id = x.business_category_id
from (
  select
    pd0.id,
    s.location_id,
    l.zone_id,
    c.business_category_id
  from public.playback_daily pd0
  join public.screens s on s.id = pd0.screen_id
  left join public.locations l on l.id = s.location_id
  left join public.campaigns c on c.id = pd0.campaign_id
) x
where x.id = pd.id;

drop index if exists public.playback_daily_unique;

create unique index playback_daily_unique
  on public.playback_daily (
    play_date,
    screen_id,
    media_asset_id,
    (coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(location_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(zone_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(business_category_id,'00000000-0000-0000-0000-000000000000'::uuid))
  );

create index geography_areas_parent_idx
  on public.geography_areas(parent_id);

create index zones_parent_area_idx
  on public.zones(parent_area_id);

create index zone_boundary_org_idx
  on public.zone_boundary_versions(organization_id);

create index zone_boundary_zone_status_idx
  on public.zone_boundary_versions(zone_id, status, version desc);

create index advertising_package_zones_zone_idx
  on public.advertising_package_zones(zone_id);

create index advertiser_order_zones_zone_idx
  on public.advertiser_order_zones(zone_id);

create index business_categories_parent_idx
  on public.business_categories(parent_id);

create index businesses_category_idx
  on public.businesses(category_id)
  where category_id is not null;

create index campaigns_category_idx
  on public.campaigns(business_category_id)
  where business_category_id is not null;

create index campaign_zone_entitlements_zone_idx
  on public.campaign_zone_entitlements(zone_id, status);

create index campaign_zone_entitlements_order_idx
  on public.campaign_zone_entitlements(source_order_id)
  where source_order_id is not null;

create index playback_location_idx
  on public.playback_daily(location_id)
  where location_id is not null;

create index playback_category_date_idx
  on public.playback_daily(business_category_id, play_date)
  where business_category_id is not null;

create index playback_zone_category_date_idx
  on public.playback_daily(zone_id, business_category_id, play_date)
  where campaign_id is not null;

create trigger geography_areas_touch_updated_at
before update on public.geography_areas
for each row execute function public.touch_updated_at();

create trigger zones_touch_updated_at
before update on public.zones
for each row execute function public.touch_updated_at();

create trigger business_categories_touch_updated_at
before update on public.business_categories
for each row execute function public.touch_updated_at();

create or replace function public.lock_versioned_advertising_package()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'active' and new.coverage_mode = 'zones' and not exists (
    select 1 from public.advertising_package_zones apz
    where apz.package_id = new.id
  ) then
    raise exception 'zone-covered advertising package requires at least one zone before activation';
  end if;

  if new.status = 'active' and new.coverage_mode = 'network' and exists (
    select 1 from public.advertising_package_zones apz
    where apz.package_id = new.id
  ) then
    raise exception 'network advertising package cannot also contain package zones';
  end if;

  if old.status in ('active','retired') and (
       new.package_key is distinct from old.package_key
    or new.version is distinct from old.version
    or new.name is distinct from old.name
    or new.market is distinct from old.market
    or new.placement_scope is distinct from old.placement_scope
    or new.coverage_mode is distinct from old.coverage_mode
    or new.price_cents is distinct from old.price_cents
    or new.currency is distinct from old.currency
    or new.term_days is distinct from old.term_days
    or new.ad_length_seconds is distinct from old.ad_length_seconds
    or new.frequency_label is distinct from old.frequency_label
    or new.loop_share is distinct from old.loop_share
    or new.screen_count is distinct from old.screen_count
    or new.projected_plays is distinct from old.projected_plays
    or new.projection_period_days is distinct from old.projection_period_days
    or new.activated_at is distinct from old.activated_at
  ) then
    raise exception 'active advertising package version is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.lock_accepted_advertiser_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.accepted_at is not null and (
       new.advertiser_business_id is distinct from old.advertiser_business_id
    or new.package_id is distinct from old.package_id
    or new.package_key is distinct from old.package_key
    or new.package_version is distinct from old.package_version
    or new.amount_cents is distinct from old.amount_cents
    or new.currency is distinct from old.currency
    or new.market is distinct from old.market
    or new.placement_scope is distinct from old.placement_scope
    or new.coverage_mode is distinct from old.coverage_mode
    or new.start_preference is distinct from old.start_preference
    or new.creative_election is distinct from old.creative_election
    or new.order_snapshot is distinct from old.order_snapshot
    or new.accepted_at is distinct from old.accepted_at
  ) then
    raise exception 'accepted advertiser order evidence is immutable';
  end if;
  return new;
end;
$$;

create or replace function public.lock_advertising_package_zone_membership()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_package_id uuid;
  v_status text;
begin
  if tg_op = 'UPDATE' and new.package_id is distinct from old.package_id then
    raise exception 'package zone membership cannot move between package versions';
  end if;

  if tg_op = 'INSERT' then
    v_package_id := new.package_id;
  else
    v_package_id := old.package_id;
  end if;

  select status into v_status
  from public.advertising_packages
  where id = v_package_id;

  if v_status is distinct from 'draft' then
    raise exception 'package zone membership is immutable once package is not draft';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger advertising_package_zones_lock
before insert or update or delete on public.advertising_package_zones
for each row execute function public.lock_advertising_package_zone_membership();

create or replace function public.record_playback_atomic(
  p_organization_id uuid,
  p_play_date date,
  p_screen_id uuid,
  p_media_asset_id uuid,
  p_campaign_id uuid default null,
  p_seconds numeric default 0,
  p_stamp timestamptz default now(),
  p_proof_id text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_location_id uuid;
  v_zone_id uuid;
  v_category_id uuid;
begin
  if p_proof_id is not null and length(trim(p_proof_id)) > 0 then
    insert into public.playback_proof_receipts (screen_id, proof_id, created_at)
    values (p_screen_id, p_proof_id, p_stamp)
    on conflict (screen_id, proof_id) do nothing;

    if not found then
      return;
    end if;
  end if;

  select s.location_id, l.zone_id
    into v_location_id, v_zone_id
  from public.screens s
  left join public.locations l on l.id = s.location_id
  where s.id = p_screen_id;

  if p_campaign_id is not null then
    select c.business_category_id
      into v_category_id
    from public.campaigns c
    where c.id = p_campaign_id;
  end if;

  insert into public.playback_daily (
    organization_id,
    play_date,
    screen_id,
    media_asset_id,
    campaign_id,
    location_id,
    zone_id,
    business_category_id,
    play_count,
    seconds_played,
    first_played_at,
    last_played_at,
    updated_at
  ) values (
    p_organization_id,
    p_play_date,
    p_screen_id,
    p_media_asset_id,
    p_campaign_id,
    v_location_id,
    v_zone_id,
    v_category_id,
    1,
    greatest(coalesce(p_seconds,0),0),
    p_stamp,
    p_stamp,
    p_stamp
  )
  on conflict (
    play_date,
    screen_id,
    media_asset_id,
    (coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(location_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(zone_id,'00000000-0000-0000-0000-000000000000'::uuid)),
    (coalesce(business_category_id,'00000000-0000-0000-0000-000000000000'::uuid))
  )
  do update set
    play_count = public.playback_daily.play_count + 1,
    seconds_played = public.playback_daily.seconds_played + excluded.seconds_played,
    first_played_at = coalesce(public.playback_daily.first_played_at, excluded.first_played_at),
    last_played_at = greatest(
      coalesce(public.playback_daily.last_played_at, excluded.last_played_at),
      excluded.last_played_at
    ),
    updated_at = excluded.updated_at;
end;
$$;

create or replace function public.record_playback_atomic(
  p_organization_id uuid,
  p_play_date date,
  p_screen_id uuid,
  p_media_asset_id uuid,
  p_campaign_id uuid default null,
  p_seconds numeric default 0,
  p_stamp timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.record_playback_atomic(
    p_organization_id,
    p_play_date,
    p_screen_id,
    p_media_asset_id,
    p_campaign_id,
    p_seconds,
    p_stamp,
    null::text
  );
end;
$$;

revoke all on function public.record_playback_atomic(uuid,date,uuid,uuid,uuid,numeric,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.record_playback_atomic(uuid,date,uuid,uuid,uuid,numeric,timestamptz,text)
  to service_role;




create or replace function public.protect_zone_boundary_history()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'non-draft zone boundary versions are immutable';
    end if;
    return old;
  end if;

  if old.status <> 'draft' and (
       new.organization_id is distinct from old.organization_id
    or new.zone_id is distinct from old.zone_id
    or new.version is distinct from old.version
    or new.boundary_geojson is distinct from old.boundary_geojson
    or new.created_at is distinct from old.created_at
    or new.status = 'draft'
  ) then
    raise exception 'activated zone boundary geometry/version is immutable';
  end if;

  return new;
end;
$$;

create trigger zone_boundary_versions_history_guard
before update or delete on public.zone_boundary_versions
for each row execute function public.protect_zone_boundary_history();

create or replace function public.protect_advertiser_order_zone_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'advertiser order zone snapshots are immutable';
end;
$$;

create trigger advertiser_order_zones_immutable
before update or delete on public.advertiser_order_zones
for each row execute function public.protect_advertiser_order_zone_snapshot();

create or replace function public.snapshot_order_zone_json()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zones jsonb;
  v_coverage_mode text;
begin
  if new.package_id is null then
    return new;
  end if;

  select p.coverage_mode
    into v_coverage_mode
  from public.advertising_packages p
  where p.id = new.package_id;

  new.coverage_mode = coalesce(v_coverage_mode, 'legacy');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'zone_id', z.id,
        'name', z.name,
        'slug', z.slug,
        'boundary_version', zb.version,
        'delivery_weight', apz.delivery_weight
      )
      order by z.name, z.id
    ),
    '[]'::jsonb
  )
  into v_zones
  from public.advertising_package_zones apz
  join public.zones z on z.id = apz.zone_id
  left join public.zone_boundary_versions zb
    on zb.zone_id = z.id
   and zb.status = 'active'
  where apz.package_id = new.package_id;

  new.order_snapshot =
    jsonb_set(
      jsonb_set(
        coalesce(new.order_snapshot, '{}'::jsonb),
        '{coverage_mode}',
        to_jsonb(new.coverage_mode),
        true
      ),
      '{coverage_zones}',
      v_zones,
      true
    );
  return new;
end;
$$;

create trigger advertiser_orders_snapshot_zone_json
before insert on public.advertiser_orders
for each row execute function public.snapshot_order_zone_json();

create or replace function public.snapshot_campaign_category()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.business_category_id is null then
    select b.category_id
      into new.business_category_id
    from public.businesses b
    where b.id = new.advertiser_business_id;
  end if;
  return new;
end;
$$;

create trigger campaigns_snapshot_category
before insert on public.campaigns
for each row execute function public.snapshot_campaign_category();

create or replace function public.snapshot_advertiser_order_zones()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.package_id is null then
    return new;
  end if;

  insert into public.advertiser_order_zones (
    order_id,
    zone_id,
    zone_name_snapshot,
    zone_slug_snapshot,
    boundary_version,
    delivery_weight
  )
  select
    new.id,
    z.id,
    z.name,
    z.slug,
    zb.version,
    apz.delivery_weight
  from public.advertising_package_zones apz
  join public.zones z on z.id = apz.zone_id
  left join public.zone_boundary_versions zb
    on zb.zone_id = z.id
   and zb.status = 'active'
  where apz.package_id = new.package_id
  on conflict (order_id, zone_id) do nothing;

  return new;
end;
$$;

create trigger advertiser_orders_snapshot_zones
after insert on public.advertiser_orders
for each row execute function public.snapshot_advertiser_order_zones();

create or replace function public.activate_campaign_zone_entitlements()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zone_count integer;
begin
  if new.campaign_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.campaign_id is not distinct from new.campaign_id then
      return new;
    end if;
  end if;

  insert into public.campaign_zone_entitlements (
    campaign_id,
    zone_id,
    source_order_id,
    delivery_weight
  )
  select
    new.campaign_id,
    oz.zone_id,
    new.id,
    oz.delivery_weight
  from public.advertiser_order_zones oz
  where oz.order_id = new.id
  on conflict (campaign_id, zone_id) do nothing;

  select count(*)
    into v_zone_count
  from public.campaign_zone_entitlements
  where campaign_id = new.campaign_id
    and status = 'active';

  update public.campaigns
  set coverage_mode = case
        when v_zone_count > 0 then 'zones'
        when new.coverage_mode = 'network' then 'network'
        else 'legacy'
      end,
      updated_at = now()
  where id = new.campaign_id;

  return new;
end;
$$;

create trigger advertiser_orders_activate_campaign_zones
after insert or update of campaign_id on public.advertiser_orders
for each row execute function public.activate_campaign_zone_entitlements();

revoke all on function public.lock_advertising_package_zone_membership() from public, anon, authenticated;
revoke all on function public.protect_zone_boundary_history() from public, anon, authenticated;
revoke all on function public.protect_advertiser_order_zone_snapshot() from public, anon, authenticated;
revoke all on function public.snapshot_order_zone_json() from public, anon, authenticated;
revoke all on function public.snapshot_advertiser_order_zones() from public, anon, authenticated;
revoke all on function public.snapshot_campaign_category() from public, anon, authenticated;
revoke all on function public.activate_campaign_zone_entitlements() from public, anon, authenticated;

alter table public.geography_areas enable row level security;
alter table public.zone_boundary_versions enable row level security;
alter table public.advertising_package_zones enable row level security;
alter table public.advertiser_order_zones enable row level security;
alter table public.business_categories enable row level security;
alter table public.campaign_zone_entitlements enable row level security;

revoke all on table
  public.geography_areas,
  public.zone_boundary_versions,
  public.advertising_package_zones,
  public.advertiser_order_zones,
  public.business_categories,
  public.campaign_zone_entitlements
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.geography_areas,
  public.zone_boundary_versions,
  public.advertising_package_zones,
  public.advertiser_order_zones,
  public.business_categories,
  public.campaign_zone_entitlements
to service_role;
