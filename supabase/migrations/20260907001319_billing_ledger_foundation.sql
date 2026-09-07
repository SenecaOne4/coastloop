create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_provider_check check (provider in ('stripe','manual')),
  constraint billing_customers_status_check check (status in ('active','inactive')),
  constraint billing_customers_business_provider_key unique (organization_id, business_id, provider)
);

create unique index if not exists billing_customers_provider_id_uidx
  on public.billing_customers(provider, provider_customer_id)
  where provider_customer_id is not null;

create index if not exists billing_customers_business_idx
  on public.billing_customers(business_id);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  advertiser_business_id uuid not null references public.businesses(id) on delete restrict,
  provider text not null default 'manual',
  provider_customer_id text,
  provider_invoice_id text,
  invoice_number text,
  status text not null default 'draft',
  collection_method text not null default 'manual',
  currency text not null default 'usd',
  subtotal_cents integer not null,
  tax_cents integer not null default 0,
  total_cents integer not null,
  amount_paid_cents integer not null default 0,
  amount_due_cents integer not null,
  amount_refunded_cents integer not null default 0,
  due_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  sent_at timestamptz,
  paid_at timestamptz,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_invoices_provider_check check (provider in ('manual','stripe')),
  constraint billing_invoices_status_check check (status in ('draft','open','paid','void','uncollectible')),
  constraint billing_invoices_collection_check check (collection_method in ('manual','send_invoice')),
  constraint billing_invoices_currency_check check (currency ~ '^[a-z]{3}$'),
  constraint billing_invoices_amounts_check check (
    subtotal_cents >= 0 and tax_cents >= 0 and total_cents >= 0
    and amount_paid_cents >= 0 and amount_due_cents >= 0 and amount_refunded_cents >= 0
  )
);

create unique index if not exists billing_invoices_provider_id_uidx
  on public.billing_invoices(provider, provider_invoice_id)
  where provider_invoice_id is not null;

create index if not exists billing_invoices_campaign_idx
  on public.billing_invoices(campaign_id);

create index if not exists billing_invoices_advertiser_idx
  on public.billing_invoices(advertiser_business_id);

create index if not exists billing_invoices_status_due_idx
  on public.billing_invoices(status, due_at);

create table if not exists public.billing_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.billing_invoices(id) on delete restrict,
  campaign_id uuid not null references public.campaigns(id) on delete restrict,
  advertiser_business_id uuid not null references public.businesses(id) on delete restrict,
  provider text not null default 'manual',
  provider_transaction_id text,
  provider_event_id text,
  kind text not null,
  status text not null default 'succeeded',
  amount_cents integer not null,
  currency text not null default 'usd',
  payment_method text,
  occurred_at timestamptz not null default now(),
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint billing_transactions_provider_check check (provider in ('manual','stripe')),
  constraint billing_transactions_kind_check check (kind in ('payment','refund','chargeback','credit','writeoff')),
  constraint billing_transactions_status_check check (status in ('pending','succeeded','failed','canceled')),
  constraint billing_transactions_amount_check check (amount_cents >= 0),
  constraint billing_transactions_currency_check check (currency ~ '^[a-z]{3}$')
);

create unique index if not exists billing_transactions_provider_id_uidx
  on public.billing_transactions(provider, provider_transaction_id)
  where provider_transaction_id is not null;

create index if not exists billing_transactions_invoice_idx
  on public.billing_transactions(invoice_id);

create index if not exists billing_transactions_campaign_idx
  on public.billing_transactions(campaign_id);

create index if not exists billing_transactions_occurred_idx
  on public.billing_transactions(occurred_at desc);

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe',
  provider_event_id text not null,
  event_type text not null,
  livemode boolean,
  status text not null default 'received',
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint billing_webhook_events_provider_check check (provider in ('stripe')),
  constraint billing_webhook_events_status_check check (status in ('received','processed','ignored','failed')),
  constraint billing_webhook_events_provider_event_key unique (provider, provider_event_id)
);

create index if not exists billing_webhook_events_received_idx
  on public.billing_webhook_events(received_at desc);

create table if not exists public.broker_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  broker_user_id uuid not null references auth.users(id) on delete restrict,
  period_start date,
  period_end date,
  amount_cents integer not null,
  status text not null default 'due',
  payment_reference text,
  paid_at timestamptz,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint broker_payouts_amount_check check (amount_cents >= 0),
  constraint broker_payouts_status_check check (status in ('due','approved','paid','void')),
  constraint broker_payouts_period_check check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists broker_payouts_broker_idx
  on public.broker_payouts(broker_user_id, status);

create table if not exists public.host_payouts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete restrict,
  location_id uuid references public.locations(id) on delete set null,
  screen_id uuid references public.screens(id) on delete set null,
  period_start date,
  period_end date,
  amount_cents integer not null,
  status text not null default 'due',
  payment_reference text,
  paid_at timestamptz,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint host_payouts_amount_check check (amount_cents >= 0),
  constraint host_payouts_status_check check (status in ('due','approved','paid','void')),
  constraint host_payouts_period_check check (period_end is null or period_start is null or period_end >= period_start)
);

create index if not exists host_payouts_business_idx
  on public.host_payouts(business_id, status);

create index if not exists host_payouts_screen_idx
  on public.host_payouts(screen_id);

alter table public.billing_customers enable row level security;
alter table public.billing_invoices enable row level security;
alter table public.billing_transactions enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.broker_payouts enable row level security;
alter table public.host_payouts enable row level security;

revoke all on table public.billing_customers from anon, authenticated;
revoke all on table public.billing_invoices from anon, authenticated;
revoke all on table public.billing_transactions from anon, authenticated;
revoke all on table public.billing_webhook_events from anon, authenticated;
revoke all on table public.broker_payouts from anon, authenticated;
revoke all on table public.host_payouts from anon, authenticated;

grant all on table public.billing_customers to service_role;
grant all on table public.billing_invoices to service_role;
grant all on table public.billing_transactions to service_role;
grant all on table public.billing_webhook_events to service_role;
grant all on table public.broker_payouts to service_role;
grant all on table public.host_payouts to service_role;
