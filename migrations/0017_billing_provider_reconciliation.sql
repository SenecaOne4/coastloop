alter table public.billing_invoices
  add column if not exists provider_invoice_item_id text;

create unique index if not exists billing_invoices_provider_item_uidx
  on public.billing_invoices(provider, provider_invoice_item_id)
  where provider_invoice_item_id is not null;

alter table public.billing_transactions
  add column if not exists request_key text;

create unique index if not exists billing_transactions_request_key_uidx
  on public.billing_transactions(organization_id, request_key)
  where request_key is not null;
