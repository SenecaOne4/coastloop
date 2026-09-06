alter table public.businesses
  add column if not exists is_host boolean not null default false,
  add column if not exists is_advertiser boolean not null default true;

alter table public.businesses
  drop constraint if exists businesses_has_capability;

alter table public.businesses
  add constraint businesses_has_capability
  check (is_host or is_advertiser);
