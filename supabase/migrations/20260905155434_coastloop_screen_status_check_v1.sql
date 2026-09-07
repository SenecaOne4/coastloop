alter table public.screens drop constraint if exists screens_status_check;
alter table public.screens add constraint screens_status_check check (status in ('unpaired','active','offline','retired'));
