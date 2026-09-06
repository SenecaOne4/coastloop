alter table public.screens
  add column if not exists is_test boolean not null default false;

create index if not exists screens_org_is_test_idx
  on public.screens (organization_id, is_test);

comment on column public.screens.is_test is
  'Internal/demo/test screen. Playback is retained but excluded from commercial/customer-facing metrics.';
