alter table public.campaigns
  add column if not exists delivery_target_plays bigint,
  add column if not exists makegood_plays bigint not null default 0;

alter table public.campaigns
  drop constraint if exists campaigns_delivery_target_plays_check,
  drop constraint if exists campaigns_makegood_plays_check;

alter table public.campaigns
  add constraint campaigns_delivery_target_plays_check
    check (delivery_target_plays is null or delivery_target_plays > 0),
  add constraint campaigns_makegood_plays_check
    check (makegood_plays >= 0);

comment on column public.campaigns.delivery_target_plays is
  'Contracted verified play target for the campaign. Null means no play-count delivery guarantee.';
comment on column public.campaigns.makegood_plays is
  'Additional verified plays owed as makegood delivery beyond the original contracted target.';
