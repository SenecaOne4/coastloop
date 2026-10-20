alter table public.creative_jobs
  add column parent_job_id uuid references public.creative_jobs(id) on delete set null,
  add column revision_number integer not null default 1 check (revision_number > 0),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column max_attempts integer not null default 3 check (max_attempts > 0),
  add column next_attempt_at timestamptz,
  add column review_status text not null default 'pending'
    check (review_status in ('pending','approved','changes_requested')),
  add column review_notes text;

create index creative_jobs_worker_queue_idx
  on public.creative_jobs (status, next_attempt_at, created_at);

create index creative_jobs_parent_idx
  on public.creative_jobs (parent_job_id, revision_number);

create unique index creative_jobs_parent_revision_unique
  on public.creative_jobs (parent_job_id, revision_number)
  where parent_job_id is not null;

create or replace function public.claim_creative_job(
  p_worker_id text,
  p_lease_seconds integer default 900
)
returns setof public.creative_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
begin
  select id into v_job_id
  from public.creative_jobs
  where
    (
      status = 'queued'
      or (
        status = 'claimed'
        and lease_expires_at is not null
        and lease_expires_at <= now()
      )
    )
    and coalesce(next_attempt_at, now()) <= now()
    and attempt_count < max_attempts
  order by created_at
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  return query
  update public.creative_jobs
  set status = 'claimed',
      claimed_by = p_worker_id,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
      attempt_count = attempt_count + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = v_job_id
  returning *;
end;
$$;

revoke all on function public.claim_creative_job(text, integer) from public;
grant execute on function public.claim_creative_job(text, integer) to service_role;

create or replace function public.heartbeat_creative_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 900
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.creative_jobs
  set lease_expires_at = now() + make_interval(secs => greatest(60, p_lease_seconds)),
      updated_at = now()
  where id = p_job_id
    and status = 'claimed'
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning true;
$$;

revoke all on function public.heartbeat_creative_job(uuid, uuid, integer) from public;
grant execute on function public.heartbeat_creative_job(uuid, uuid, integer) to service_role;

create or replace function public.fail_creative_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error text,
  p_retry_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_retry boolean;
begin
  select attempt_count < max_attempts into v_retry
  from public.creative_jobs
  where id = p_job_id
    and status = 'claimed'
    and lease_token = p_lease_token
  for update;

  if not found then return false; end if;

  update public.creative_jobs
  set status = case when v_retry then 'queued' else 'failed' end,
      error_message = p_error,
      next_attempt_at = case when v_retry then now() + make_interval(secs => greatest(0,p_retry_seconds)) else null end,
      lease_token = null,
      lease_expires_at = null,
      claimed_by = null,
      completed_at = case when v_retry then null else now() end,
      updated_at = now()
  where id = p_job_id and lease_token = p_lease_token;

  return found;
end;
$$;

revoke all on function public.fail_creative_job(uuid, uuid, text, integer) from public;
grant execute on function public.fail_creative_job(uuid, uuid, text, integer) to service_role;

create or replace function public.complete_creative_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_output_asset_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.creative_jobs
  set status = 'completed',
      output_asset_id = p_output_asset_id,
      review_status = 'pending',
      error_message = null,
      lease_token = null,
      lease_expires_at = null,
      completed_at = now(),
      updated_at = now()
  where id = p_job_id
    and status = 'claimed'
    and lease_token = p_lease_token
    and lease_expires_at > now();

  return found;
end;
$$;

revoke all on function public.complete_creative_job(uuid, uuid, uuid) from public;
grant execute on function public.complete_creative_job(uuid, uuid, uuid) to service_role;
