alter table public.screens add column if not exists device_id text;
alter table public.screens add column if not exists paired_at timestamptz;
alter table public.screens alter column name drop not null;
create unique index if not exists screens_device_id_unique on public.screens(device_id) where device_id is not null;
