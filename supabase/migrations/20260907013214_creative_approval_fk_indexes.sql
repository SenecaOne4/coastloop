create index if not exists media_assets_approved_by_idx
  on public.media_assets(approved_by)
  where approved_by is not null;

create index if not exists media_assets_rejected_by_idx
  on public.media_assets(rejected_by)
  where rejected_by is not null;
