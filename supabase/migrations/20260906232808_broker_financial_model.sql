alter table public.organization_members
  drop constraint if exists organization_members_role_check;

update public.organization_members
set role = 'broker'
where role = 'sales';

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner','admin','broker','creative','viewer'));

alter table public.organization_members
  add column if not exists broker_commission_percent numeric(5,2) not null default 0;

alter table public.organization_members
  drop constraint if exists organization_members_broker_commission_check;

alter table public.organization_members
  add constraint organization_members_broker_commission_check
  check (broker_commission_percent >= 0 and broker_commission_percent <= 100);

alter table public.user_invitations
  drop constraint if exists user_invitations_role_shape;

update public.user_invitations
set role = 'broker'
where account_type = 'internal' and role = 'sales';

alter table public.user_invitations
  add constraint user_invitations_role_shape check (
    (
      account_type = 'internal'
      and business_id is null
      and role in ('owner','admin','broker','creative','viewer')
    )
    or
    (
      account_type = 'business'
      and business_id is not null
      and role in ('owner','manager','viewer')
    )
  );

alter table public.prospects
  add column if not exists broker_user_id uuid references auth.users(id) on delete set null;

alter table public.businesses
  add column if not exists broker_user_id uuid references auth.users(id) on delete set null;

alter table public.campaigns
  add column if not exists broker_user_id uuid references auth.users(id) on delete set null,
  add column if not exists broker_commission_percent numeric(5,2) not null default 0;

alter table public.campaigns
  drop constraint if exists campaigns_broker_commission_check;

alter table public.campaigns
  add constraint campaigns_broker_commission_check
  check (broker_commission_percent >= 0 and broker_commission_percent <= 100);

alter table public.screens
  add column if not exists host_annual_pay_cents integer not null default 0,
  add column if not exists hardware_cost_cents integer not null default 0,
  add column if not exists setup_cost_cents integer not null default 0;

alter table public.screens
  drop constraint if exists screens_host_annual_pay_check,
  drop constraint if exists screens_hardware_cost_check,
  drop constraint if exists screens_setup_cost_check;

alter table public.screens
  add constraint screens_host_annual_pay_check
    check (host_annual_pay_cents >= 0 and host_annual_pay_cents <= 59900),
  add constraint screens_hardware_cost_check
    check (hardware_cost_cents >= 0),
  add constraint screens_setup_cost_check
    check (setup_cost_cents >= 0);

create index if not exists prospects_broker_user_idx
  on public.prospects(broker_user_id);

create index if not exists businesses_broker_user_idx
  on public.businesses(broker_user_id);

create index if not exists campaigns_broker_user_idx
  on public.campaigns(broker_user_id);
