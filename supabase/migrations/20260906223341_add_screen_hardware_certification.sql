alter table public.screens
  add column if not exists device_model text,
  add column if not exists device_display_name text,
  add column if not exists device_type text,
  add column if not exists device_vendor text,
  add column if not exists device_model_number text,
  add column if not exists device_screen_size text,
  add column if not exists deployment_class text not null default 'unreviewed',
  add column if not exists certification_note text;

alter table public.screens
  drop constraint if exists screens_deployment_class_check;

alter table public.screens
  add constraint screens_deployment_class_check
  check (deployment_class in ('unreviewed','lab_only','pilot','production'));
