-- CoastLoop digital onboarding foundation.
-- Public signup/signature flows are mediated by the Worker.
-- No raw onboarding token is ever stored; only a SHA-256 digest.

create table public.advertising_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  package_key text not null,
  version integer not null check (version > 0),
  name text not null,
  status text not null default 'draft'
    check (status in ('draft','active','retired')),
  market text,
  placement_scope jsonb not null default '{}'::jsonb,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  term_days integer check (term_days is null or term_days > 0),
  ad_length_seconds integer not null default 15
    check (ad_length_seconds between 1 and 300),
  frequency_label text,
  loop_share numeric(7,4)
    check (loop_share is null or (loop_share > 0 and loop_share <= 1)),
  screen_count integer check (screen_count is null or screen_count >= 0),
  projected_plays bigint check (projected_plays is null or projected_plays >= 0),
  projection_period_days integer
    check (projection_period_days is null or projection_period_days > 0),
  availability_status text not null default 'available'
    check (availability_status in ('available','limited','sold_out','paused')),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, package_key, version)
);

create table public.advertiser_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  advertiser_business_id uuid not null references public.businesses(id) on delete restrict,
  package_id uuid references public.advertising_packages(id) on delete restrict,
  campaign_id uuid references public.campaigns(id) on delete set null,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  status text not null default 'prepared'
    check (status in (
      'prepared','sent','viewed','accepted','payment_pending',
      'paid','canceled','expired','refunded'
    )),
  package_key text not null,
  package_version integer not null check (package_version > 0),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  market text,
  placement_scope jsonb not null default '{}'::jsonb,
  start_preference text,
  creative_election text
    check (
      creative_election is null or
      creative_election in ('website','assets','finished','make_for_me')
    ),
  order_snapshot jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  paid_at timestamptz,
  canceled_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purpose text not null
    check (purpose in ('venue_invite','advertiser_checkout')),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active'
    check (status in ('active','used','revoked','expired')),
  business_id uuid references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  advertiser_order_id uuid references public.advertiser_orders(id) on delete cascade,
  recipient_email text,
  recipient_mobile text,
  expires_at timestamptz not null,
  first_viewed_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (purpose = 'venue_invite' and business_id is not null) or
    (purpose = 'advertiser_checkout' and advertiser_order_id is not null)
  )
);

create table public.agreement_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_family text not null
    check (template_family in (
      'venue_partner',
      'advertising_order_terms',
      'consent_addenda'
    )),
  template_version text not null,
  status text not null default 'counsel_review'
    check (status in ('counsel_review','locked','retired')),
  source_storage_key text,
  source_sha256 text
    check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  notes text,
  locked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, template_family, template_version)
);

create table public.agreement_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.agreement_templates(id) on delete restrict,
  onboarding_token_id uuid references public.onboarding_tokens(id) on delete set null,
  business_id uuid not null references public.businesses(id) on delete restrict,
  location_id uuid references public.locations(id) on delete restrict,
  advertiser_order_id uuid references public.advertiser_orders(id) on delete restrict,
  template_family text not null,
  template_version text not null,
  status text not null default 'prepared'
    check (status in (
      'prepared','sent','viewed','accepted','archived','amended','terminated'
    )),
  deal_summary jsonb not null default '{}'::jsonb,
  executed_snapshot jsonb,
  executed_storage_key text,
  executed_sha256 text
    check (executed_sha256 is null or executed_sha256 ~ '^[0-9a-f]{64}$'),
  signer_legal_name text,
  signer_title text,
  signer_email text,
  signer_mobile text,
  consent_to_electronic_records boolean not null default false,
  authority_confirmation boolean not null default false,
  reviewed_full_agreement boolean not null default false,
  order_summary_confirmed boolean not null default false,
  signature_type text
    check (signature_type is null or signature_type in ('typed','drawn')),
  signature_representation text,
  signer_ip inet,
  signer_user_agent text,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  signed_at timestamptz,
  archived_at timestamptz,
  terminated_at timestamptz,
  supersedes_agreement_id uuid references public.agreement_instances(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    status not in ('accepted','archived','amended','terminated')
    or (
      signed_at is not null
      and executed_snapshot is not null
      and executed_storage_key is not null
      and executed_sha256 is not null
      and signer_legal_name is not null
      and consent_to_electronic_records
      and authority_confirmation
      and reviewed_full_agreement
      and signature_type is not null
      and signature_representation is not null
    )
  )
);

create table public.placement_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agreement_instance_id uuid not null references public.agreement_instances(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  screen_id uuid references public.screens(id) on delete set null,
  zone_id uuid references public.zones(id) on delete set null,
  zone_label text,
  screen_label text,
  screen_count integer not null default 1 check (screen_count > 0),
  operating_mode text not null
    check (operating_mode in ('dedicated_coastloop','scheduled_coastloop','other')),
  operating_schedule jsonb not null default '{}'::jsonb,
  notes text,
  status text not null default 'proposed'
    check (status in ('proposed','authorized','active','inactive')),
  authorized_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_type text not null
    check (task_type in (
      'installation',
      'payee_setup',
      'creative_intake',
      'creative_review',
      'scheduling'
    )),
  status text not null default 'open'
    check (status in ('open','in_progress','completed','canceled')),
  business_id uuid references public.businesses(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  advertiser_order_id uuid references public.advertiser_orders(id) on delete cascade,
  agreement_instance_id uuid references public.agreement_instances(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index advertising_packages_status_idx
  on public.advertising_packages (organization_id, status, availability_status);

create index advertiser_orders_business_idx
  on public.advertiser_orders (organization_id, advertiser_business_id, created_at desc);

create index advertiser_orders_status_idx
  on public.advertiser_orders (organization_id, status, created_at desc);

create index onboarding_tokens_lookup_idx
  on public.onboarding_tokens (organization_id, status, expires_at);

create index agreement_instances_business_idx
  on public.agreement_instances (organization_id, business_id, created_at desc);

create index agreement_instances_order_idx
  on public.agreement_instances (advertiser_order_id)
  where advertiser_order_id is not null;

create index agreement_instances_token_idx
  on public.agreement_instances (onboarding_token_id)
  where onboarding_token_id is not null;

create index placement_authorizations_agreement_idx
  on public.placement_authorizations (agreement_instance_id, status);

create index onboarding_tasks_open_idx
  on public.onboarding_tasks (organization_id, status, task_type, created_at)
  where status in ('open','in_progress');

create trigger advertising_packages_touch_updated_at
before update on public.advertising_packages
for each row execute function public.touch_updated_at();

create trigger advertiser_orders_touch_updated_at
before update on public.advertiser_orders
for each row execute function public.touch_updated_at();

create trigger agreement_instances_touch_updated_at
before update on public.agreement_instances
for each row execute function public.touch_updated_at();

create trigger placement_authorizations_touch_updated_at
before update on public.placement_authorizations
for each row execute function public.touch_updated_at();

create trigger onboarding_tasks_touch_updated_at
before update on public.onboarding_tasks
for each row execute function public.touch_updated_at();

create or replace function public.lock_executed_agreement_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.signed_at is not null and (
       new.template_id is distinct from old.template_id
    or new.onboarding_token_id is distinct from old.onboarding_token_id
    or new.business_id is distinct from old.business_id
    or new.location_id is distinct from old.location_id
    or new.advertiser_order_id is distinct from old.advertiser_order_id
    or new.template_family is distinct from old.template_family
    or new.template_version is distinct from old.template_version
    or new.deal_summary is distinct from old.deal_summary
    or new.executed_snapshot is distinct from old.executed_snapshot
    or new.executed_storage_key is distinct from old.executed_storage_key
    or new.executed_sha256 is distinct from old.executed_sha256
    or new.signer_legal_name is distinct from old.signer_legal_name
    or new.signer_title is distinct from old.signer_title
    or new.signer_email is distinct from old.signer_email
    or new.signer_mobile is distinct from old.signer_mobile
    or new.consent_to_electronic_records is distinct from old.consent_to_electronic_records
    or new.authority_confirmation is distinct from old.authority_confirmation
    or new.reviewed_full_agreement is distinct from old.reviewed_full_agreement
    or new.order_summary_confirmed is distinct from old.order_summary_confirmed
    or new.signature_type is distinct from old.signature_type
    or new.signature_representation is distinct from old.signature_representation
    or new.signer_ip is distinct from old.signer_ip
    or new.signer_user_agent is distinct from old.signer_user_agent
    or new.signed_at is distinct from old.signed_at
  ) then
    raise exception 'executed agreement evidence is immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.lock_executed_agreement_evidence()
  from public, anon, authenticated;
grant execute on function public.lock_executed_agreement_evidence()
  to service_role;

create trigger agreement_instances_lock_evidence
before update on public.agreement_instances
for each row execute function public.lock_executed_agreement_evidence();

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

revoke all on function public.lock_accepted_advertiser_order()
  from public, anon, authenticated;
grant execute on function public.lock_accepted_advertiser_order()
  to service_role;

create trigger advertiser_orders_lock_evidence
before update on public.advertiser_orders
for each row execute function public.lock_accepted_advertiser_order();

alter table public.advertising_packages enable row level security;
alter table public.advertiser_orders enable row level security;
alter table public.onboarding_tokens enable row level security;
alter table public.agreement_templates enable row level security;
alter table public.agreement_instances enable row level security;
alter table public.placement_authorizations enable row level security;
alter table public.onboarding_tasks enable row level security;

revoke all on table
  public.advertising_packages,
  public.advertiser_orders,
  public.onboarding_tokens,
  public.agreement_templates,
  public.agreement_instances,
  public.placement_authorizations,
  public.onboarding_tasks
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.advertising_packages,
  public.advertiser_orders,
  public.onboarding_tokens,
  public.agreement_templates,
  public.agreement_instances,
  public.placement_authorizations,
  public.onboarding_tasks
to service_role;

comment on table public.onboarding_tokens is
'Hashed one-time CoastLoop onboarding links. Raw bearer tokens are never persisted.';

comment on table public.agreement_instances is
'Structured e-sign record plus immutable executed agreement evidence. Executed files live in CoastLoop R2.';

comment on table public.placement_authorizations is
'Exact venue screens/zones authorized by a signed CoastLoop venue agreement.';

comment on table public.advertiser_orders is
'Immutable deal snapshot foundation for CoastLoop advertiser checkout and campaign activation.';
