alter table public.screens
  add column if not exists video_mode text,
  add column if not exists can_play_4k boolean not null default false;
