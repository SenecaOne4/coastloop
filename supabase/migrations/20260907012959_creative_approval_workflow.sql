alter table public.media_assets
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text;

alter table public.media_assets
  drop constraint if exists media_assets_approval_status_check;

alter table public.media_assets
  add constraint media_assets_approval_status_check
  check (approval_status in ('pending','approved','rejected'));

create index if not exists media_assets_org_approval_idx
  on public.media_assets(organization_id, approval_status, created_at desc);

comment on column public.media_assets.approval_status is
  'Creative review state. Campaign-linked media must be approved before player delivery.';
comment on column public.media_assets.rejection_reason is
  'Short operator review note explaining why creative was rejected.';
