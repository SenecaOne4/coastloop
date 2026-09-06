create table if not exists public.playback_proof_receipts (
  screen_id uuid not null references public.screens(id) on delete cascade,
  proof_id text not null,
  created_at timestamptz not null default now(),
  primary key (screen_id, proof_id)
);

alter table public.playback_proof_receipts enable row level security;

revoke all on table public.playback_proof_receipts from public, anon, authenticated;
grant select, insert, delete on table public.playback_proof_receipts to service_role;

create or replace function public.record_playback_atomic(
  p_organization_id uuid,
  p_play_date date,
  p_screen_id uuid,
  p_media_asset_id uuid,
  p_campaign_id uuid default null,
  p_seconds numeric default 0,
  p_stamp timestamptz default now(),
  p_proof_id text default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_proof_id is not null and length(trim(p_proof_id)) > 0 then
    insert into public.playback_proof_receipts (screen_id, proof_id, created_at)
    values (p_screen_id, p_proof_id, p_stamp)
    on conflict (screen_id, proof_id) do nothing;

    if not found then
      return;
    end if;
  end if;

  insert into public.playback_daily (
    organization_id, play_date, screen_id, media_asset_id, campaign_id,
    play_count, seconds_played, first_played_at, last_played_at, updated_at
  ) values (
    p_organization_id, p_play_date, p_screen_id, p_media_asset_id, p_campaign_id,
    1, greatest(coalesce(p_seconds,0),0), p_stamp, p_stamp, p_stamp
  )
  on conflict (
    play_date, screen_id, media_asset_id,
    (coalesce(campaign_id,'00000000-0000-0000-0000-000000000000'::uuid))
  )
  do update set
    play_count = public.playback_daily.play_count + 1,
    seconds_played = public.playback_daily.seconds_played + excluded.seconds_played,
    first_played_at = coalesce(public.playback_daily.first_played_at, excluded.first_played_at),
    last_played_at = greatest(coalesce(public.playback_daily.last_played_at, excluded.last_played_at), excluded.last_played_at),
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.record_playback_atomic(uuid,date,uuid,uuid,uuid,numeric,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.record_playback_atomic(uuid,date,uuid,uuid,uuid,numeric,timestamptz,text)
  to service_role;
