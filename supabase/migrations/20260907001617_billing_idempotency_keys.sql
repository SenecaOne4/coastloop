alter table public.billing_invoices
  add column if not exists request_key text;

create unique index if not exists billing_invoices_request_key_uidx
  on public.billing_invoices(organization_id, request_key)
  where request_key is not null;

alter table public.broker_payouts
  add column if not exists request_key text;

create unique index if not exists broker_payouts_request_key_uidx
  on public.broker_payouts(organization_id, request_key)
  where request_key is not null;

alter table public.host_payouts
  add column if not exists request_key text;

create unique index if not exists host_payouts_request_key_uidx
  on public.host_payouts(organization_id, request_key)
  where request_key is not null;
