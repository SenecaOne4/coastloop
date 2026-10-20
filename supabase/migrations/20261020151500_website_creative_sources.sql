alter table public.advertiser_creative_profiles
  add column if not exists website_context jsonb not null default '{}'::jsonb;

alter table public.advertiser_creative_profiles
  add column if not exists website_scanned_at timestamptz;

alter table public.advertiser_source_assets
  add column if not exists source_kind text not null default 'upload';

alter table public.advertiser_source_assets
  add column if not exists source_url text;

alter table public.advertiser_source_assets
  add column if not exists source_page_url text;

alter table public.advertiser_source_assets
  add column if not exists source_fetched_at timestamptz;

alter table public.advertiser_source_assets
  add column if not exists source_metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'advertiser_source_assets_source_kind_check'
  ) then
    alter table public.advertiser_source_assets
      add constraint advertiser_source_assets_source_kind_check
      check (source_kind in ('upload','website','campaign','generated'));
  end if;
end
$$;

create index if not exists advertiser_source_assets_source_url_idx
  on public.advertiser_source_assets
  (organization_id,business_id,source_kind,source_url);
