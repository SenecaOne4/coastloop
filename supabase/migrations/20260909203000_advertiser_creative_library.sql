create table public.advertiser_creative_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  business_category text,
  business_description text,
  website_url text,
  default_cta text,
  brand_notes text,
  network_notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,business_id)
);

create table public.advertiser_source_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  title text,
  asset_type text not null check (asset_type in ('logo','photo','video','brand_guide','menu','document','archive','reference','other')),
  storage_key text not null unique,
  original_filename text,
  mime_type text,
  byte_size bigint,
  checksum text,
  usage_status text not null default 'approved' check (usage_status in ('approved','pending','blocked','archived')),
  ingest_status text not null default 'ready' check (ingest_status in ('processing','ready','error')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.creative_job_sources (
  creative_job_id uuid not null references public.creative_jobs(id) on delete cascade,
  source_asset_id uuid not null references public.advertiser_source_assets(id) on delete restrict,
  role text not null default 'other' check (role in ('logo','hero_reference','product_reference','brand_reference','document_reference','other')),
  created_at timestamptz not null default now(),
  primary key (creative_job_id,source_asset_id)
);

create index advertiser_source_assets_business_idx on public.advertiser_source_assets(organization_id,business_id,created_at desc);
create index creative_job_sources_asset_idx on public.creative_job_sources(source_asset_id);

alter table public.advertiser_creative_profiles enable row level security;
alter table public.advertiser_source_assets enable row level security;
alter table public.creative_job_sources enable row level security;

revoke all on public.advertiser_creative_profiles from anon, authenticated;
revoke all on public.advertiser_source_assets from anon, authenticated;
revoke all on public.creative_job_sources from anon, authenticated;
