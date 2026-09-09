-- CoastLoop global click-through terms.
-- Independent from transactional venue/advertising signatures.
-- Publishing a new required version automatically makes prior
-- acceptances stale without deleting their audit history.

create table if not exists public.platform_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  version integer not null check (version > 0),
  title text not null,
  body_html text not null,
  source_storage_key text,
  source_sha256 text,
  content_sha256 text not null,
  status text not null default 'draft'
    check (status in ('draft','published','retired')),
  require_reacceptance boolean not null default true,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, version)
);

create unique index if not exists
  platform_terms_one_published_per_org
on public.platform_terms (organization_id)
where status='published';

create table if not exists public.platform_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  terms_id uuid not null
    references public.platform_terms(id) on delete restrict,
  user_id uuid not null
    references auth.users(id) on delete cascade,
  version integer not null,
  content_sha256 text not null,
  accepted_at timestamptz not null default now(),
  ip_address text,
  user_agent text,
  unique (terms_id, user_id)
);

create index if not exists
  platform_terms_acceptances_user_idx
on public.platform_terms_acceptances
  (organization_id, user_id, accepted_at desc);
