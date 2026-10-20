create table if not exists public.platform_nda_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  email_snapshot text not null default '',
  document_version text not null check (length(btrim(document_version)) > 0),
  accepted_at timestamptz not null default now(),
  primary key (user_id, document_version)
);
alter table public.platform_nda_acceptances enable row level security;
revoke all on public.platform_nda_acceptances from public, anon, authenticated;
grant select, insert on public.platform_nda_acceptances to service_role;
comment on table public.platform_nda_acceptances is
  'Immutable account-level acceptance evidence for versioned CoastLoop platform NDAs. Separate from advertiser and venue agreements.';
