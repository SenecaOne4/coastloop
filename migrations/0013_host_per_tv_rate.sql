alter table public.prospects
  add column if not exists host_annual_pay_cents integer not null default 0;

alter table public.prospects
  drop constraint if exists prospects_host_annual_pay_check;

alter table public.prospects
  add constraint prospects_host_annual_pay_check
  check (host_annual_pay_cents >= 0 and host_annual_pay_cents <= 59900);

alter table public.locations
  add column if not exists host_annual_pay_cents integer not null default 0;

alter table public.locations
  drop constraint if exists locations_host_annual_pay_check;

alter table public.locations
  add constraint locations_host_annual_pay_check
  check (host_annual_pay_cents >= 0 and host_annual_pay_cents <= 59900);
