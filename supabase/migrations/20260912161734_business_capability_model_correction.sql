alter table public.businesses
  alter column is_host set default false,
  alter column is_advertiser set default false;

alter table public.businesses
  drop constraint if exists businesses_has_capability;
