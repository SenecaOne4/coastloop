create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid null,
  actor_type text not null check (actor_type in ('user','legacy_admin','system')),
  actor_role text null,
  action text not null check (length(action) between 1 and 120),
  entity_type text null,
  entity_id text null,
  request_method text not null check (request_method in ('POST','PUT','PATCH','DELETE')),
  request_path text not null,
  request_id text null,
  status_code integer not null check (status_code between 100 and 599),
  succeeded boolean not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_org_created_idx
  on public.audit_events (organization_id, created_at desc);

create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc)
  where actor_user_id is not null;

create index audit_events_entity_idx
  on public.audit_events (entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

alter table public.audit_events enable row level security;

revoke all on table public.audit_events
  from public, anon, authenticated, service_role;

grant select, insert on table public.audit_events to service_role;

comment on table public.audit_events is
  'Append-only CoastLoop operational audit events. Direct client access is denied; server service_role may only select and insert.';
