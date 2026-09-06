create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  phone text,
  avatar_url text,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('owner','manager','viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table if not exists public.user_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  email text not null,
  account_type text not null check (account_type in ('internal','business')),
  role text not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '14 days'),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_invitations_role_shape check (
    (account_type = 'internal' and business_id is null and role in ('owner','admin','sales','creative','viewer'))
    or
    (account_type = 'business' and business_id is not null and role in ('owner','manager','viewer'))
  )
);

create index if not exists user_profiles_email_idx on public.user_profiles (lower(email));
create index if not exists business_members_user_idx on public.business_members (user_id);
create index if not exists user_invitations_email_status_idx on public.user_invitations (lower(email), status, expires_at);

alter table public.user_profiles enable row level security;
alter table public.business_members enable row level security;
alter table public.user_invitations enable row level security;

drop policy if exists user_profiles_select_self on public.user_profiles;
create policy user_profiles_select_self on public.user_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists user_profiles_update_self on public.user_profiles;
create policy user_profiles_update_self on public.user_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists business_members_select_self on public.business_members;
create policy business_members_select_self on public.business_members
  for select to authenticated
  using (user_id = (select auth.uid()));

grant select, update on public.user_profiles to authenticated;
grant select on public.business_members to authenticated;
grant all on public.user_profiles to service_role;
grant all on public.business_members to service_role;
grant all on public.user_invitations to service_role;

create or replace function public.sync_coastloop_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_profiles (
    user_id, email, full_name, avatar_url, last_login_at, updated_at
  ) values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    new.last_sign_in_at,
    now()
  )
  on conflict (user_id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    last_login_at = excluded.last_login_at,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists coastloop_auth_user_profile_sync on auth.users;
create trigger coastloop_auth_user_profile_sync
  after insert or update of email, raw_user_meta_data, last_sign_in_at on auth.users
  for each row execute procedure public.sync_coastloop_user_profile();

insert into public.user_profiles (user_id, email, full_name, avatar_url, last_login_at)
select id, coalesce(email,''), coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'), raw_user_meta_data->>'avatar_url', last_sign_in_at
from auth.users
on conflict (user_id) do nothing;
