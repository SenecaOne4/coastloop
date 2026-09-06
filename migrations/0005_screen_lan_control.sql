alter table public.screens
  add column if not exists lan_ip text;

create index if not exists screens_org_lan_ip_idx
  on public.screens (organization_id, lan_ip);

comment on column public.screens.lan_ip is
  'LAN IP reported by player for local administrative control such as Roku ECP relaunch.';
