alter table public.media_assets
  add column if not exists parent_asset_id uuid references public.media_assets(id) on delete cascade,
  add column if not exists delivery_tier text;

alter table public.media_assets
  drop constraint if exists media_assets_delivery_tier_check;

alter table public.media_assets
  add constraint media_assets_delivery_tier_check
  check (delivery_tier is null or delivery_tier in ('4k','1080p','8k'));

create index if not exists media_assets_parent_variant_idx
  on public.media_assets(parent_asset_id, delivery_tier)
  where parent_asset_id is not null;
